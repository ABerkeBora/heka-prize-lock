import {withScope,v2Scope} from '../server/scope.ts';
import {exclusive} from '../server/store.ts';
import {startFutureAgent,runFutureAgent} from '../server/future-agent.ts';
const r=await withScope(v2Scope,()=>exclusive(()=>process.argv.includes('--resume')?runFutureAgent():startFutureAgent()));console.log(JSON.stringify({decision:r.decision,status:r.mandate?.status,payout:r.submittedTransaction},null,2));
