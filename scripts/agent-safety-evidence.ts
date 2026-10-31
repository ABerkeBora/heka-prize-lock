import { validateChallenge,buy } from '../server/payment.ts';
import { publicClient,AIRNODE_URL,AUSD,PAY_TO,NETWORK } from '../server/config.ts';
import { readJson,saveJson,exclusive } from '../server/store.ts';
import { runAgent } from '../server/agent.ts';
await exclusive(async()=>{
 const pool=readJson('.local/pool.json');const m=readJson('.local/mandate.json');const intentId=m.currentIntent;
 const before={apiSpent:m.apiSpent,callsUsed:m.callsUsed,block:(await publicClient.getBlockNumber()).toString(),nonce:await publicClient.getTransactionCount({address:m.payer})};
 const result=await runAgent();const cached=await buy(pool.request,intentId,readJson('.local/mandate.json'),'.local/mandate.json');
 const c={x402Version:2,resource:{url:AIRNODE_URL},accepts:[{scheme:'exact',network:NETWORK,asset:AUSD,payTo:PAY_TO,amount:'10000',maxTimeoutSeconds:300,extra:{name:'AirnodeHub USD',version:'1'}}]};
 const blocked=[];for(const [name,challenge,mandate] of [['over-budget',{...c,accepts:[{...c.accepts[0],amount:'10001'}]},m],['wrong-recipient',{...c,accepts:[{...c.accepts[0],payTo:pool.policy.walletB}]},m]] as const){try{validateChallenge(challenge,mandate);throw new Error('Unsafe acceptance');}catch(e:any){if(e.message==='Unsafe acceptance')throw e;blocked.push({case:name,decision:'rejected',reason:e.message});}}
 const afterM=readJson('.local/mandate.json');const after={apiSpent:afterM.apiSpent,callsUsed:afterM.callsUsed,block:(await publicClient.getBlockNumber()).toString(),nonce:await publicClient.getTransactionCount({address:m.payer})};
 if(before.apiSpent!==after.apiSpent||before.callsUsed!==after.callsUsed||before.nonce!==after.nonce||!result.duplicate||cached.status!=='delivered')throw new Error('Duplicate action changed spend or transaction nonce');
 saveJson('evidence/agent-safety.json',{checkedAt:new Date().toISOString(),pool:pool.address,intentId,duplicate:{decision:'blocked',cachedResult:'delivered',before,after},blocked,limits:'API and gas limits are local executor controls; fixed recipients and one-shot prize are enforced on-chain.'});console.log('Duplicate purchase/payout blocked; over-budget and wrong-recipient rejected; nonce and spend unchanged.');
});
