import { buy } from '../server/payment.ts';
import { exclusive,readJson,saveJson } from '../server/store.ts';
import { publicClient,wallets,AUSD,tokenAbi } from '../server/config.ts';
await exclusive(async()=>{
  const file='.local/preflight-mandate.json';let m=readJson(file);
  if(!m){m={id:'preflight',expiresAt:Math.floor(Date.now()/1000)+1800,maxCalls:4,callsUsed:0,maxApiFee:'10000',totalApiBudget:'40000',apiReserved:'0',apiSpent:'0'};saveJson(file,m);}
  const roles=wallets();console.log('Test roles verified; chain',await publicClient.getChainId(),'payer',roles.deployer.address,'aUSD balance',String(await publicClient.readContract({address:AUSD,abi:tokenAbi,functionName:'balanceOf',args:[roles.deployer.address]})));
  // Published qualification fixtures are immutable inputs. A fresh preflight buys a uniquely named observation.
  if(readJson('evidence/request.json')&&readJson('evidence/match.json')){
    const fresh=await buy(readJson('evidence/request.json'),`preflight-${Date.now().toString(36)}`,m,file);console.log('Fresh getMatch',fresh.proof.data,'payment',fresh.settlement.transaction);return;
  }
  const i=await buy({operation:'matchesPast',parameters:{per_page:3,sort:'-begin_at','range[begin_at]':'2026-10-25T00:00:00Z,2026-10-31T23:59:59Z'}},'discovery',m,file);
  const data=JSON.parse(i.proof.data);saveJson('.local/discovery.json',data);console.log('Discovery',JSON.stringify(data.map((x:any)=>({id:x.id,name:x.name,status:x.status,end_at:x.end_at,modified_at:x.modified_at,winner_id:x.winner_id,teams:x.opponents,results:x.results})),null,2));
  const selected=data.find((x:any)=>x.status==='finished'&&x.winner_id&&x.end_at&&x.opponents?.length===2);
  if(!selected)throw new Error('No two-team final match in discovery');
  saveJson('evidence/match.json',selected);
  const request={operation:'getMatch',parameters:{match_id_or_slug:String(selected.id)},responseProjection:{id:'/id',status:'/status',winnerId:'/winner_id',endAt:'/end_at',modifiedAt:'/modified_at'}};
  saveJson('evidence/request.json',request);
  const proof=await buy(request,'preflight-match',m,file);console.log('getMatch proof',proof.proof.data,'payment',proof.settlement.transaction);
});
