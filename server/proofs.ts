import { encodeFunctionData,encodePacked,keccak256,toHex } from 'viem';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { publicClient } from './config.ts';
import { abi,sendTx,readPool } from './chain.ts';
import { readJson,saveJson,appendTrail } from './store.ts';
export async function caseProof(name:string,supplied?:any){
  const original=readJson('.local/proof.json')||readJson('evidence/latest-proof.json')||readJson('evidence/preflight-match.json')?.proof;
  if(supplied)return supplied;
  if(!original)throw new Error('No signed proof saved yet');
  if(name==='valid')return original;
  if(name==='edited'){const p={...original};p.data=p.data.replace(/"winnerId":(?:null|\d+)/, '"winnerId":1');if(p.data===original.data)throw new Error('No editable winner field in this proof');return p;}
  if(name==='stale')return readJson('evidence/preflight-match.json').proof;
  if(name==='wrong-request')return readJson('evidence/discovery.json').proof;
  if(name==='wrong-signer'){
    const key=privateKeyToAccount(generatePrivateKey());const digest=keccak256(encodePacked(['bytes32','uint256','bytes'],[original.requestHash,BigInt(original.timestamp),toHex(original.data)]));
    return {...original,signature:await key.signMessage({message:{raw:digest}})};
  }throw new Error('Unknown proof case');
}
export async function checkProof(name:string,supplied?:any,live=false,options:any={}){
  const pool=readJson('.local/pool.json')||readJson('evidence/deployment.json');if(!pool?.address)throw new Error('No contract deployed');
  const recorded=readJson('evidence/live-tamper-checks.json',[]).find((x:any)=>x.case===name&&x.contract?.toLowerCase()===pool.address.toLowerCase());
  if(live&&recorded?.txHash&&!options.intentSuffix)return recorded;
  const proof=await caseProof(name,supplied);if(!/^\d+$/.test(String(proof.timestamp))||typeof proof.data!=='string'||proof.data.length>64000||!/^0x[0-9a-fA-F]{130}$/.test(proof.signature))throw new Error('Invalid proof envelope');
  const args=[BigInt(proof.timestamp),toHex(proof.data),proof.signature];let accepted=false;let reason='';
  const before=await readPool(pool);
  try{const v=await publicClient.readContract({address:pool.address,abi:abi(),functionName:'validateResponse',args});accepted=true;reason=`Valid proof: winner ${v[0]}, fixed recipient ${v[1]}`;}
  catch(e:any){reason=e.cause?.data?.errorName||e.data?.errorName||e.shortMessage||e.message;}
  const result:any={case:name,status:accepted?'accepted':'rejected',accepted,reason,checkedAt:new Date().toISOString(),method:live?'confirmed transaction':'eth_call on Base Sepolia',contract:pool.address,proofHash:keccak256(toHex(proof.data)),before};
  if(live){const dataFloor=BigInt(Buffer.byteLength(proof.data))*50n+300000n;const gasLimit=dataFloor>650000n?dataFloor:650000n;const tx=await sendTx(`${pool.id}-tamper-${name}${options.intentSuffix?'-'+options.intentSuffix:''}`,{to:pool.address,data:encodeFunctionData({abi:abi(),functionName:'validateResponse',args}),value:0n},{expectedRevert:!accepted,gasLimit});result.txHash=tx.hash;result.receipt=tx.receipt;if((tx.receipt.status==='success')!==accepted)throw new Error('Live receipt disagrees with verifier');}
  result.after=await readPool(pool);result.prizeUnchanged=JSON.stringify(result.before)===JSON.stringify(result.after);
  const checks=readJson('.local/checks.json',[]).filter((x:any)=>x.case!==name);checks.push(result);saveJson('.local/checks.json',checks);saveJson('evidence/tamper-checks.json',checks);
  if(live){const liveChecks=readJson('evidence/live-tamper-checks.json',[]).filter((x:any)=>!(x.case===name&&x.contract===pool.address));liveChecks.push(result);saveJson('evidence/live-tamper-checks.json',liveChecks);}
  appendTrail('proof',`${name} proof ${result.status}`,result.status,{detail:reason,txHash:result.txHash});return result;
}
