import {withScope,v2Scope} from '../server/scope.ts';
import {exclusive} from '../server/store.ts';
import {createFuturePool,fundFuturePool} from '../server/future-agent.ts';
await withScope(v2Scope,()=>exclusive(async()=>{const p=await createFuturePool();console.log('Future policy deployed',p.address);const f=await fundFuturePool();console.log('Unknown-result prize funded',f.fundingTx);}));
