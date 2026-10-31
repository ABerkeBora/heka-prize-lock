import { exclusive } from '../server/store.ts';
import { newPool,fundPool } from '../server/agent.ts';
await exclusive(async()=>{const p=await newPool();console.log('Contract deployed:',p.address,'tx:',p.deploymentTx);const f=await fundPool();console.log('Prize funded:',f.fundingTx);});
