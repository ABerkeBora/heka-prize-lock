import {withScope,v2Scope} from '../server/scope.ts';
import {buy} from '../server/payment.ts';
import {exclusive,readJson,saveJson} from '../server/store.ts';
await withScope(v2Scope,()=>exclusive(async()=>{
 if(readJson('evidence/deployment.json')?.address&&!readJson('.local/pool.json'))throw new Error('Review the published V2 pilot; do not replace its immutable evidence');
 const file='.local/discovery-mandate.json';let m=readJson(file);if(!m){m={id:'future-discovery',createdAt:new Date().toISOString(),expiresAt:Math.floor(Date.now()/1000)+300,maxCalls:3,callsUsed:0,maxApiFee:'10000',totalApiBudget:'30000',apiReserved:'0',apiSpent:'0'};saveJson(file,m);}
 if(Math.floor(Date.now()/1000)>=m.expiresAt)throw new Error('Five-minute discovery boundary reached; no extension');
 const found=await buy({operation:'matchesUpcoming',parameters:{per_page:10,sort:'scheduled_at'}},'upcoming-discovery',m,file);
 const records=JSON.parse(found.proof.data);const now=Math.floor(Date.now()/1000);
 const candidates=records.filter((x:any)=>x.status==='not_started'&&x.winner_id===null&&x.end_at===null&&Date.parse(x.scheduled_at)/1000>now+1800&&x.opponents?.length===2&&x.opponents.every((o:any)=>o.type==='Team'&&o.opponent?.id));
 if(!candidates.length){saveJson('evidence/discovery-blocker.json',{at:new Date().toISOString(),reason:'No complete future two-team match in bounded discovery',observed:records.map((x:any)=>({id:x.id,status:x.status,scheduledAt:x.scheduled_at,winnerId:x.winner_id,opponents:x.opponents}))});throw new Error('No suitable future record; do not fabricate one');}
 const match=candidates[0];saveJson('evidence/match.json',match);
 const request={operation:'getMatch',parameters:{match_id_or_slug:String(match.id)},responseProjection:{id:'/id',status:'/status',winnerId:'/winner_id',endAt:'/end_at',modifiedAt:'/modified_at',scheduledAt:'/scheduled_at',teamAId:'/opponents/0/opponent/id',teamBId:'/opponents/1/opponent/id'}};
 saveJson('evidence/request.json',request);
 m=readJson(file);const selected=await buy(request,'future-selection',m,file);saveJson('evidence/funding-observation.json',selected.proof);
 const data=JSON.parse(selected.proof.data);if(data.status!=='not_started'||data.endAt!==null||data.winnerId!==null||Date.parse(data.scheduledAt)<=Date.now())throw new Error('Selection changed; no funding');
 console.log('Verified future match',JSON.stringify({id:match.id,name:match.name,status:data.status,scheduledAt:data.scheduledAt,modifiedAt:data.modifiedAt,teamA:data.teamAId,teamB:data.teamBId,requestHash:selected.requestHash,payment:selected.settlement.transaction}));
}));
