import {v2Scope,withScope} from './scope.ts';
import {readJson,saveJson,exclusive,appendTrail} from './store.ts';
import {runFutureAgent} from './future-agent.ts';
let ticking=false;
export async function tickFuture(){if(ticking)return;ticking=true;
 try{await withScope(v2Scope,()=>exclusive(async()=>{
  const m=readJson('.local/mandate.json');const pool=readJson('.local/pool.json');if(!m||!pool||!['active','waiting','waiting-void','budget-exhausted','paying','buying-data','awaiting-result'].includes(m.status))return;
  const pending=readJson(`.local/transactions/${pool.id}-payout.json`)||readJson(`.local/transactions/${pool.id}-refund.json`);const now=Math.floor(Date.now()/1000);
  if(!pending&&now>=m.expiresAt){m.status='expired';saveJson('.local/mandate.json',m);return;}
  if(!pending&&now<m.nextPollAt)return;
  try{await runFutureAgent();}catch(e:any){const latest=readJson('.local/mandate.json');latest.status=/expired/.test(e.message)?'expired':'attention';latest.lastError=e.shortMessage||e.message;saveJson('.local/mandate.json',latest);appendTrail('agent','Bounded monitor stopped','rejected',{detail:latest.lastError});}
 }));}catch(e:any){if(!/in progress/.test(e.message))console.error('V2 keeper state error:',e.message);}finally{ticking=false;}
}
