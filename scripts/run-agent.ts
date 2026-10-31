import { exclusive } from '../server/store.ts';
import { startAgent,runAgent } from '../server/agent.ts';
const result=await exclusive(()=>process.argv.includes('--resume')?runAgent():startAgent());
console.log(JSON.stringify({status:result.mandate?.status||result.status,payoutTx:result.submittedTransaction,duplicate:result.duplicate,held:result.held},null,2));
