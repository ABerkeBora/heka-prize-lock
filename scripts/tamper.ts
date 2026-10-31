import { exclusive,saveJson } from '../server/store.ts';
import { checkProof } from '../server/proofs.ts';
await exclusive(async()=>{for(const name of ['edited','stale','wrong-request','wrong-signer']){const r=await checkProof(name,undefined,process.argv.includes('--live'));console.log(name,r.status,r.reason,r.txHash||'');if(r.accepted)throw new Error(`Expected ${name} rejection`);}});
