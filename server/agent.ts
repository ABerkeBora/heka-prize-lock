import { encodeDeployData,encodeFunctionData,toHex } from 'viem';
import { AIRNODE,AIRNODE_URL,AUSD,PAY_TO,NETWORK,publicClient,wallets } from './config.ts';
import { deriveRequestHash,verifySignedResponse } from './airnode-v2.ts';
import { readJson,saveJson,appendTrail } from './store.ts';
import { abi,artifact,sendTx,readPool,submitRequest } from './chain.ts';
import { buy } from './payment.ts';

export async function newPool(){
  const previous=readJson('.local/pool.json');
  if(previous?.address&&(await readPool(previous)).state===1)throw new Error('Current prize still locked; finish or refund before a new pool');
  const history=readJson('.local/pools.json',[]);
  if(history.length>=5)throw new Error('Local five-scenario test limit reached; no automatic top-up');
  const match=readJson('evidence/match.json');const request=readJson('evidence/request.json');
  if(!match||!request)throw new Error('Run npm run preflight first');
  const now=Math.floor(Date.now()/1000);const w=wallets();const ended=Math.floor(Date.parse(match.end_at)/1000);
  const id=previous?.status==='deploying'?previous.id:`prize-${history.length+1}-${Date.now().toString(36)}`;
  const p=previous?.status==='deploying'?previous.policy:{airnode:AIRNODE,requestHash:deriveRequestHash(request),matchId:String(match.id),teamA:String(match.opponents[0].opponent.id),teamB:String(match.opponents[1].opponent.id),walletA:w.buyer.address,walletB:w.counterparty.address,organizer:w.deployer.address,prizeWei:'100000000000000',fundingClosesAt:now+7200,settlementDeadline:now+86400,refundGrace:600,maxEnvelopeAge:120,finalityDelay:60,sourceObservationMin:ended,sourceObservationMax:ended+172800};
  if(p.sourceObservationMax>p.settlementDeadline)p.sourceObservationMax=p.settlementDeadline;
  const pool:any=previous?.status==='deploying'?previous:{id,status:'deploying',policy:p,request,createdAt:new Date().toISOString()};saveJson('.local/pool.json',pool);
  const a=artifact();saveJson('evidence/contract-abi.json',a.abi);
  const tx=await sendTx(`${id}-deploy`,{data:encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:[p]})});
  pool.address=tx.receipt.contractAddress;pool.deploymentTx=tx.hash;pool.status='unfunded';pool.deploymentGasWei=tx.receipt.gasCostWei;saveJson('.local/pool.json',pool);
  history.push(pool);saveJson('.local/pools.json',history);saveJson(`evidence/${id}-deployment.json`,pool);saveJson('evidence/deployment.json',pool);
  saveJson('.local/mandate.json',null);
  appendTrail('pool','Prize contract deployed','confirmed',{txHash:tx.hash,detail:'Match, recipients and settlement rules are fixed.'});return pool;
}
export async function fundPool(){const pool=readJson('.local/pool.json');if(!pool?.address)throw new Error('Create a prize first');
  if((await readPool(pool)).state!==0&&!readJson(`.local/transactions/${pool.id}-fund.json`))throw new Error('Prize already funded or terminal');
  const tx=await sendTx(`${pool.id}-fund`,{to:pool.address,data:encodeFunctionData({abi:abi(),functionName:'fund'}),value:BigInt(pool.policy.prizeWei)});
  pool.fundingTx=tx.hash;pool.status='funded';saveJson('.local/pool.json',pool);saveJson(`evidence/${pool.id}-deployment.json`,pool);saveJson('evidence/deployment.json',pool);
  appendTrail('fund','Prize locked','confirmed',{txHash:tx.hash,amount:pool.policy.prizeWei,asset:'test ETH',detail:'Held by the contract until a valid final result or fixed refund deadline.'});return pool;}
export async function startAgent(){const pool=readJson('.local/pool.json');if(!pool?.address||(await readPool(pool)).state!==1)throw new Error('Fund the prize before delegating');
  if(readJson('.local/mandate.json'))throw new Error('This pool already has a mandate; resume its existing intent');
  const now=Math.floor(Date.now()/1000);const m={id:pool.id+'-treasury',network:NETWORK,asset:AUSD,allowedTool:'getMatch',requestHash:pool.policy.requestHash,endpoint:AIRNODE_URL,contract:pool.address,payer:wallets().deployer.address,payTo:PAY_TO,beneficiaries:[pool.policy.walletA,pool.policy.walletB],expiresAt:Math.min(now+1800,pool.policy.settlementDeadline),maxCalls:3,callsUsed:0,maxActions:4,payoutActions:0,maxApiFee:'10000',totalApiBudget:'30000',apiReserved:'0',apiSpent:'0',gasBudgetWei:'300000000000000',maxActionGasWei:'150000000000000',gasReservedWei:'0',gasSpentWei:'0',pollIntervalSeconds:60,status:'active',createdAt:new Date().toISOString()};
  saveJson('.local/mandate.json',m);saveJson(`evidence/${m.id}-mandate.json`,m);appendTrail('mandate','Treasury agent delegated','confirmed',{detail:'At most 3 priced observations and one fixed-recipient payout. No automatic top-up.'});return runAgent();}
export async function runAgent(){
  const pool=readJson('.local/pool.json');let m=readJson('.local/mandate.json');if(!m)throw new Error('No mandate');
  const chain=await readPool(pool);
  if(chain.state===2){
    const prior=readJson(`.local/transactions/${pool.id}-payout.json`);
    if(prior){const proof=readJson('.local/proof.json');const args=[BigInt(proof.timestamp),toHex(proof.data),proof.signature];const tx=await sendTx(`${pool.id}-payout`,submitRequest(pool,proof),{mandate:m,mandateFile:'.local/mandate.json',maxActionGasWei:m.maxActionGasWei,args});pool.payoutTx=tx.hash;m.gasSpentWei=tx.receipt.gasCostWei;saveJson('.local/pool.json',pool);saveJson('evidence/deployment.json',pool);
      if(!readJson(`evidence/${pool.id}-payout.json`)){const intent=readJson(`.local/intents/${m.currentIntent}.json`);const recovered={intentId:m.currentIntent,mandate:{...m,status:'paid'},pool,proof,apiPayment:intent?.settlement,submittedTransaction:tx.hash,receipt:tx.receipt,chain,recovered:true,deliveredPrizeWei:pool.policy.prizeWei};saveJson(`evidence/${pool.id}-payout.json`,recovered);saveJson('evidence/payout.json',recovered);}}
    m.status='paid';saveJson('.local/mandate.json',m);appendTrail('validator','Duplicate payout blocked','rejected',{detail:'Contract is already paid; known receipt reconciled, no API purchase or new transaction.'});return {duplicate:true};}
  if(chain.state!==1)throw new Error('Prize is not funded');
  const priorPayout=readJson(`.local/transactions/${pool.id}-payout.json`);
  if(priorPayout){
    const saved=readJson('.local/proof.json');if(!saved)throw new Error('Pending payout has no saved proof; reconcile its hash manually');
    const args=[BigInt(saved.timestamp),toHex(saved.data),saved.signature];
    const tx=await sendTx(`${pool.id}-payout`,submitRequest(pool,saved),{mandate:m,mandateFile:'.local/mandate.json',maxActionGasWei:m.maxActionGasWei,args});
    appendTrail('payout','Payout receipt reconciled','confirmed',{txHash:tx.hash});return runAgent();
  }
  if(Math.floor(Date.now()/1000)>=m.expiresAt){m.status='expired';saveJson('.local/mandate.json',m);throw new Error('Mandate expired');}
  const currentId=m.currentIntent || `${m.id}-observation-${m.callsUsed+1}`;
  const existing=readJson(`.local/intents/${currentId}.json`);
  if(!existing && m.lastObservedAt && Date.now()-Date.parse(m.lastObservedAt)<m.pollIntervalSeconds*1000)throw new Error('Polling interval has not elapsed');
  m.currentIntent=currentId;m.status='buying-data';saveJson('.local/mandate.json',m);
  let i:any;
  try{i=await buy(pool.request,currentId,m,'.local/mandate.json');}catch(e:any){m=readJson('.local/mandate.json');m.status='attention';m.lastError=e.message;saveJson('.local/mandate.json',m);appendTrail('agent','Observation stopped','rejected',{detail:e.message});throw e;}
  m=readJson('.local/mandate.json');m.lastObservedAt=i.deliveredAt;saveJson('.local/mandate.json',m);saveJson('.local/proof.json',i.proof);saveJson('evidence/latest-proof.json',i.proof);
  await verifySignedResponse(i.proof,AIRNODE,pool.policy.requestHash);
  const args=[BigInt(i.proof.timestamp),toHex(i.proof.data),i.proof.signature];
  try{await publicClient.readContract({address:pool.address,abi:abi(),functionName:'validateResponse',args});}
  catch(e:any){m.status='awaiting-result';m.lastError=e.shortMessage||e.message;m.currentIntent=null;saveJson('.local/mandate.json',m);appendTrail('validator','Result held for review','rejected',{detail:m.lastError});return {held:true};}
  appendTrail('validator','Final result verified','confirmed',{detail:'Pinned signer, exact request, final winner and both timestamps passed on-chain simulation.'});
  m.status='paying';saveJson('.local/mandate.json',m);
  const before=(await publicClient.getBalance({address:JSON.parse(i.proof.data).winnerId===Number(pool.policy.teamA)?pool.policy.walletA:pool.policy.walletB})).toString();
  const tx=await sendTx(`${pool.id}-payout`,submitRequest(pool,i.proof),{mandate:m,mandateFile:'.local/mandate.json',maxActionGasWei:m.maxActionGasWei,args});
  m=readJson('.local/mandate.json');m.status='paid';m.gasSpentWei=tx.receipt.gasCostWei;saveJson('.local/mandate.json',m);
  const afterChain=await readPool(pool);const after=(await publicClient.getBalance({address:afterChain.paidTo as `0x${string}`})).toString();
  pool.payoutTx=tx.hash;pool.status='paid';saveJson('.local/pool.json',pool);saveJson('evidence/deployment.json',pool);
  const evidence={intentId:currentId,mandate:m,pool,proof:i.proof,apiPayment:i.settlement,validator:'on-chain validateResponse passed',submittedTransaction:tx.hash,receipt:tx.receipt,chain:afterChain,recipientBalanceBeforeWei:before,recipientBalanceAfterWei:after,deliveredPrizeWei:pool.policy.prizeWei};
  saveJson(`evidence/${pool.id}-payout.json`,evidence);saveJson('evidence/payout.json',evidence);
  appendTrail('payout','Prize paid to winner','confirmed',{txHash:tx.hash,amount:pool.policy.prizeWei,asset:'test ETH',detail:'Fixed team wallet received the prize. The same pool cannot pay again.'});return evidence;
}
export async function refundPool(){const pool=readJson('.local/pool.json');const tx=await sendTx(`${pool.id}-refund`,{to:pool.address,data:encodeFunctionData({abi:abi(),functionName:'refund'}),value:0n});pool.refundTx=tx.hash;saveJson('.local/pool.json',pool);appendTrail('refund','Prize refunded','confirmed',{txHash:tx.hash,amount:pool.policy.prizeWei,asset:'test ETH'});return tx.receipt;}
