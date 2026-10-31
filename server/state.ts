import { existsSync } from 'node:fs';
import { readJson } from './store.ts';
import { readPool } from './chain.ts';
import { AIRNODE,AUSD,AIRNODE_URL,PAY_TO,NETWORK } from './config.ts';
export async function getState(){
 const localPool=readJson('.local/pool.json');const pool=localPool||readJson('evidence/deployment.json');const archivedPayout=readJson('evidence/payout.json');const m=localPool?readJson('.local/mandate.json'):(archivedPayout?.pool?.id===pool?.id?archivedPayout.mandate:null);
 const match=readJson('evidence/match.json');const p=pool?.policy;const c=pool?.address?await readPool(pool):null;const now=Math.floor(Date.now()/1000);
 const writable=!!process.env.WALLET_FILE&&existsSync(process.env.WALLET_FILE);
 const preview=p?{status:'ready',network:NETWORK,asset:AUSD,allowedTool:'getMatch',requestHash:p.requestHash,endpoint:AIRNODE_URL,contract:pool.address,payer:p.organizer,payTo:PAY_TO,beneficiaries:[p.walletA,p.walletB],maxCalls:3,callsUsed:0,maxActions:4,maxApiFee:'10000',totalApiBudget:'30000',apiReserved:'0',apiSpent:'0',gasBudgetWei:'300000000000000',maxActionGasWei:'150000000000000',gasSpentWei:'0',pollingSeconds:60}:undefined;
 return {network:'Base Sepolia',mode:writable?'live':'evidence',updatedAt:new Date().toISOString(),notice:'Known-result test scenario. Prize recipients are isolated test wallets; they do not represent these teams. Source result: PandaScore via API3.',
 match:match?{id:match.id,name:match.name,league:match.league?.name,videogame:match.videogame?.name,status:match.status,beginAt:match.begin_at,endAt:match.end_at,modifiedAt:match.modified_at,historical:true,teams:match.opponents.map((x:any,n:number)=>({id:x.opponent.id,name:x.opponent.name,acronym:x.opponent.acronym,score:match.results.find((r:any)=>r.team_id===x.opponent.id)?.score??null,address:n===0?p?.walletA:p?.walletB}))}:undefined,
 pool:pool?{id:pool.id,address:pool.address,status:c?['unfunded','funded','paid','refunded'][c.state]:pool.status,prizeWei:p?.prizeWei,balanceWei:c?.balanceWei,payee:c?.state===2?c.paidTo:null,payoutTx:pool.payoutTx,fundingTx:pool.fundingTx,refundAvailable:c?.state===1&&now>=p.settlementDeadline+p.refundGrace}:undefined,
 mandate:m?{...m,expiresAt:new Date(m.expiresAt*1000).toISOString(),pollingSeconds:m.pollIntervalSeconds}:preview,
 proof:readJson('.local/proof.json')||readJson('evidence/latest-proof.json'),trail:readJson('.local/trail.json',readJson('evidence/trail.json',[])).filter((x:any)=>!pool||x.poolId===pool.id||x.at>=pool.createdAt).slice().reverse(),checks:readJson('.local/checks.json',readJson('evidence/tamper-checks.json',[])).filter((x:any)=>!pool||x.contract?.toLowerCase()===pool.address?.toLowerCase()),
 policy:p?{...p,signer:AIRNODE,operation:pool.request.operation,projection:pool.request.responseProjection,maxResponseAge:p.maxEnvelopeAge,deadline:new Date(p.settlementDeadline*1000).toISOString(),grace:p.refundGrace,sourceWindowStart:new Date(p.sourceObservationMin*1000).toISOString(),sourceWindowEnd:new Date(p.sourceObservationMax*1000).toISOString(),refundRecipient:p.organizer}:undefined,
 actions:{canFund:writable&&c?.state===0,canStart:writable&&c?.state===1&&!m,canRun:writable&&c?.state===1&&!!m&&now<m.expiresAt,canRefund:writable&&c?.state===1&&now>=p.settlementDeadline+p.refundGrace,canNewPool:writable&&(!pool||c?.state===2||c?.state===3)&&readJson('.local/pools.json',[]).length<5}};
}
