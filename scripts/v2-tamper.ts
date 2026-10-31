import {withScope,v2Scope} from '../server/scope.ts';
import {exclusive,readJson,saveJson} from '../server/store.ts';
import {checkProof} from '../server/proofs.ts';
import {publicClient} from '../server/config.ts';
import {abi,readPool} from '../server/chain.ts';
import {toHex} from 'viem';
await withScope(v2Scope,()=>exclusive(async()=>{
 for(const name of ['edited','stale','wrong-request','wrong-signer']){const suffix=process.argv.includes('--correct-initial')&&['edited','wrong-request'].includes(name)?'corrected':undefined;const r=await checkProof(name,undefined,process.argv.includes('--live'),{intentSuffix:suffix});console.log(name,r.status,r.reason,r.txHash||'');if(r.accepted)throw new Error('Unsafe tamper accepted');}
 const pool=readJson('.local/pool.json');const before=await readPool(pool);const original=readJson('.local/proof.json');let rejection='';
 try{await publicClient.readContract({address:pool.address,abi:abi(),functionName:'validateResponse',args:[BigInt(original.timestamp),toHex(original.data),original.signature]});throw new Error('Nonfinal result accepted');}catch(e:any){if(e.message==='Nonfinal result accepted')throw e;rejection=e.cause?.data?.errorName||e.shortMessage||e.message;}
 const after=await readPool(pool);saveJson('evidence/nonfinal-no-payment.json',{checkedAt:new Date().toISOString(),before,after,unchanged:JSON.stringify(before)===JSON.stringify(after),rejection,proof:original,liveTerminal:'PENDING'});
}));
