import { ExactEvmScheme } from '@x402/evm';
import { decodePaymentResponseHeader } from '@x402/fetch';
import { AIRNODE_URL,AUSD,PAY_TO,NETWORK,publicClient,tokenAbi,wallets } from './config.ts';
import { readJson,saveJson,appendTrail } from './store.ts';
import { deriveRequestHash,verifySignedResponse,type AirnodeV2Request } from './airnode-v2.ts';
import { AIRNODE } from './config.ts';
import { decodeEventLog } from 'viem';
const transferAbi=[{type:'event',name:'Transfer',inputs:[{name:'from',type:'address',indexed:true},{name:'to',type:'address',indexed:true},{name:'value',type:'uint256',indexed:false}]}] as const;
const authorizationAbi=[{type:'event',name:'AuthorizationUsed',inputs:[{name:'authorizer',type:'address',indexed:true},{name:'nonce',type:'bytes32',indexed:true}]}] as const;
function recordFee(i:any,mandate:any,mandateFile:string){
  if(!i.amount||!mandate.id)return;
  const delivered=readJson('.local/delivered-fees.json',{});delivered[i.intentId]={mandateId:mandate.id,amount:i.amount};saveJson('.local/delivered-fees.json',delivered);
  mandate.apiSpent=Object.values(delivered).filter((x:any)=>x.mandateId===mandate.id).reduce((sum:bigint,x:any)=>sum+BigInt(x.amount),0n).toString();saveJson(mandateFile,mandate);
}

async function finishDelivery(i:any,path:string,mandate:any,mandateFile:string){
  const s=i.settlement;
  if(!s?.success||!s.transaction||s.network!==NETWORK)throw new Error('Missing confirmed x402 receipt; no payout');
  const receipt=await publicClient.waitForTransactionReceipt({hash:s.transaction,timeout:30_000});
  if(receipt.status!=='success')throw new Error('API fee transaction reverted');
  const paid=receipt.logs.some(log=>{try{if(log.address.toLowerCase()!==AUSD.toLowerCase())return false;const event=decodeEventLog({abi:transferAbi,data:log.data,topics:log.topics});return event.args.from.toLowerCase()===i.payer.toLowerCase()&&event.args.to.toLowerCase()===PAY_TO.toLowerCase()&&event.args.value===BigInt(i.amount);}catch{return false;}});
  if(!paid)throw new Error('Receipt does not contain the exact authorized aUSD transfer');
  const nonceInReceipt=receipt.logs.some(log=>{try{if(log.address.toLowerCase()!==AUSD.toLowerCase())return false;const event=decodeEventLog({abi:authorizationAbi,data:log.data,topics:log.topics});return event.args.authorizer.toLowerCase()===i.payer.toLowerCase()&&event.args.nonce.toLowerCase()===i.payload.payload.authorization.nonce.toLowerCase();}catch{return false;}});
  if(!nonceInReceipt)throw new Error('Receipt does not contain this payment authorization nonce');
  const used=await publicClient.readContract({address:AUSD,abi:tokenAbi,functionName:'authorizationState',args:[i.payer,i.payload.payload.authorization.nonce]});
  if(!used)throw new Error('Payment nonce has not been consumed');
  recordFee(i,mandate,mandateFile);
  try{i.proof=JSON.parse(i.rawResponse);await verifySignedResponse(i.proof,AIRNODE,i.requestHash);}
  catch(e){i.status='paid-result-rejected';saveJson(path,i);saveJson(`evidence/${i.intentId}-rejected.json`,{intentId:i.intentId,amount:i.amount,payer:i.payer,payTo:PAY_TO,settlement:s,status:i.status,receiptVerified:true});throw e;}
  i.deliveredAt=i.deliveredAt||new Date().toISOString();
  // Recompute from delivered intent files on recovery; this intent contributes once.
  recordFee(i,mandate,mandateFile);
  i.status='delivered';saveJson(path,i);
  appendTrail('api','Signed match data delivered','confirmed',{intentId:i.intentId,amount:i.amount,asset:'aUSD',txHash:s.transaction,detail:'Exact provider token transfer and consumed nonce verified. This fee is separate from the prize.'});
  saveJson(`evidence/${i.intentId}.json`,{intentId:i.intentId,request:i.request,requestHash:i.requestHash,amount:i.amount,asset:AUSD,payer:i.payer,payTo:PAY_TO,settlement:s,proof:i.proof,deliveredAt:i.deliveredAt,receiptVerified:true});return i;
}

export function validateChallenge(c:any,m:any,now=Math.floor(Date.now()/1000)){
  if(now>=m.expiresAt)throw new Error('Mandate expired');
  if(c.x402Version!==2 || c.resource?.url!==AIRNODE_URL)throw new Error('Unapproved payment resource');
  const r=c.accepts?.find((r:any)=>r.scheme==='exact'&&r.network===NETWORK&&r.asset?.toLowerCase()===AUSD.toLowerCase()&&r.payTo?.toLowerCase()===PAY_TO.toLowerCase());
  if(!r || r.extra?.name!=='AirnodeHub USD'||r.extra?.version!=='1'||r.extra?.assetTransferMethod)throw new Error('Unapproved asset, recipient or scheme');
  if(!/^\d+$/.test(r.amount)||BigInt(r.amount)<=0n||BigInt(r.amount)>BigInt(m.maxApiFee))throw new Error('Per-action API budget exceeded');
  if(m.callsUsed>=m.maxCalls||BigInt(m.apiReserved)+BigInt(r.amount)>BigInt(m.totalApiBudget))throw new Error('Total API budget exhausted');
  if(!Number.isInteger(r.maxTimeoutSeconds)||r.maxTimeoutSeconds<1||r.maxTimeoutSeconds>300)throw new Error('Unapproved authorization timeout');
  return {...r,maxTimeoutSeconds:Math.min(r.maxTimeoutSeconds,m.expiresAt-now)};
}

// One persisted authorization per intent. A missing receipt freezes the intent; it never creates a second charge.
export async function buy(request:AirnodeV2Request,intentId:string,mandate:any,mandateFile:string){
  const path=`.local/intents/${intentId}.json`;const hash=deriveRequestHash(request);
  if(mandate.allowedTool&&mandate.allowedTool!==request.operation)throw new Error('Operation outside mandate');
  if(mandate.requestHash&&mandate.requestHash!==hash)throw new Error('Request outside mandate');
  if(mandate.endpoint&&mandate.endpoint!==AIRNODE_URL)throw new Error('Endpoint outside mandate');
  let i=readJson(path);
  if(i && i.requestHash!==hash)throw new Error('Intent is bound to another request');
  if(i?.status==='delivered'){recordFee(i,mandate,mandateFile);return i;}
  if(i?.httpStatus===200&&i.rawResponse&&i.settlement)return finishDelivery(i,path,mandate,mandateFile);
  if(i?.status==='paid-result-missing')throw new Error('Payment confirmed but result missing; manual recovery required, no retry charge');
  if(!i){
    if(Math.floor(Date.now()/1000)>=mandate.expiresAt)throw new Error('Mandate expired');
    const unpaid=await fetch(AIRNODE_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(20_000),redirect:'error'});
    if(unpaid.status!==402)throw new Error(`Expected priced operation, got HTTP ${unpaid.status}`);
    const header=unpaid.headers.get('payment-required');if(!header)throw new Error('Missing payment challenge');
    const challenge=JSON.parse(Buffer.from(header,'base64').toString());const requirement=validateChallenge(challenge,mandate);
    const account=wallets().deployer;
    const result=await new ExactEvmScheme(account).createPaymentPayload(2,requirement);
    const payload={...result,x402Version:2,resource:challenge.resource,accepted:requirement};
    i={intentId,request,requestHash:hash,status:'authorized',payload,payer:account.address,amount:requirement.amount,startBlock:(await publicClient.getBlockNumber()).toString(),createdAt:new Date().toISOString()};
    // Persist budget reservation first: a crash can burn capacity but cannot exceed it.
    mandate.callsUsed++;mandate.apiReserved=(BigInt(mandate.apiReserved)+BigInt(i.amount)).toString();saveJson(mandateFile,mandate);saveJson(path,i);
    appendTrail('api','API payment authorized','pending',{intentId,amount:i.amount,asset:'aUSD',detail:'One EIP-3009 nonce reserved for this request.'});
  } else {
    const auth=i.payload.payload.authorization;
    const used=await publicClient.readContract({address:AUSD,abi:tokenAbi,functionName:'authorizationState',args:[i.payer,auth.nonce]});
    if(used){i.status='paid-result-missing';saveJson(path,i);throw new Error('Authorization already settled; result missing, stopped without a second payment');}
    if(BigInt(auth.validBefore)<=BigInt(Math.floor(Date.now()/1000)))throw new Error('Authorization expired; intent stopped without replacing payment');
  }
  let response:Response;
  try{
    response=await fetch(AIRNODE_URL,{method:'POST',headers:{'content-type':'application/json','PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(i.payload)).toString('base64')},body:JSON.stringify(request),signal:AbortSignal.timeout(30_000),redirect:'error'});
  }catch{ i.status='uncertain';saveJson(path,i);throw new Error('Paid request timed out. Receipt will be reconciled before any retry.'); }
  const settlementHeader=response.headers.get('payment-response');
  const settlement=settlementHeader?decodePaymentResponseHeader(settlementHeader):null;
  i.httpStatus=response.status;i.settlement=settlement;i.rawResponse=await response.text();saveJson(path,i);
  if(!response.ok){i.status='uncertain';saveJson(path,i);throw new Error(`PandaScore returned HTTP ${response.status}; payment may have settled, budget remains reserved`);}
  return finishDelivery(i,path,mandate,mandateFile);
}
