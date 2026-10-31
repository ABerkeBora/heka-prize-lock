import {existsSync} from 'node:fs';
import {readJson} from './store.ts';
import {readPool} from './chain.ts';
import {scope} from './scope.ts';
import {AIRNODE,AUSD,PAY_TO,NETWORK,AIRNODE_URL} from './config.ts';
export async function getFutureState(){
 const pool=readJson('.local/pool.json')||readJson('evidence/deployment.json');const p=pool?.policy;const original=readJson('evidence/match.json');const proof=readJson('.local/proof.json')||readJson('evidence/latest-proof.json')||readJson('evidence/funding-observation.json');
 const data=proof?JSON.parse(proof.data):null;const m=readJson('.local/mandate.json')||readJson('evidence/waiting.json')?.mandate;const c=pool?.address?await readPool(pool):null;const now=Math.floor(Date.now()/1000);
 const writable=!!scope()?.walletFile&&existsSync(scope()!.walletFile!);const expiry=p?Math.min(p.settlementDeadline+p.refundGrace+3600,now+43200):null;
 const preview=p?{status:'ready',network:NETWORK,asset:AUSD,payer:p.organizer,payTo:PAY_TO,maxCalls:3,callsUsed:0,maxActions:4,maxApiFee:'10000',totalApiBudget:'30000',apiSpent:'0',apiReserved:'0',gasSpentWei:'0',gasBudgetWei:'300000000000000',maxActionGasWei:'150000000000000',pollingSeconds:900,expiresAt:new Date(expiry!*1000).toISOString(),expiryLabel:'Fixed cutoff shown before delegation; maximum 12 hours'}:undefined;
 const liveChecks=readJson('evidence/live-tamper-checks.json',[]);const checks=readJson('.local/checks.json',liveChecks).map((x:any)=>({...x,txHash:x.txHash||liveChecks.find((l:any)=>l.case===x.case&&l.contract===pool?.address)?.txHash}));
 return {network:'Base Sepolia',mode:writable?'live':'evidence',updatedAt:new Date().toISOString(),notice:`Future match verified before funding. Beneficiaries are isolated test wallets, not team representatives. ${c?.state===2?'Prize payout confirmed.':c?.state===3?'Fixed refund confirmed.':'Live final payout/refund is pending.'}`,
 match:original?{id:original.id,name:original.name,league:original.league?.name,videogame:original.videogame?.name,status:data?.status||original.status,scheduledAt:data?.scheduledAt||original.scheduled_at,beginAt:original.begin_at,endAt:data?.endAt??null,modifiedAt:data?.modifiedAt||original.modified_at,historical:false,teams:original.opponents.map((o:any,n:number)=>({id:o.opponent.id,name:o.opponent.name,acronym:o.opponent.acronym,address:String(o.opponent.id)===String(p?.teamA)?p?.walletA:p?.walletB,score:null}))}:undefined,
 pool:pool?{id:pool.id,address:pool.address,status:c?['unfunded','funded','paid','refunded'][c.state]:pool.status,prizeWei:p?.prizeWei,balanceWei:c?.balanceWei,payee:c?.state===2?c.paidTo:null,payoutTx:pool.payoutTx,fundingTx:pool.fundingTx,refundAvailable:c?.state===1&&now>=p.settlementDeadline+p.refundGrace}:undefined,
 mandate:m?{...m,expiresAt:new Date(m.expiresAt*1000).toISOString(),nextPollAt:new Date(m.nextPollAt*1000).toISOString(),pollingSeconds:m.pollIntervalSeconds}:preview,proof,checks,
 trail:readJson('.local/trail.json',readJson('evidence/trail.json',[])).slice().reverse(),
 policy:p?{...p,signer:AIRNODE,operation:pool.request.operation,projection:pool.request.responseProjection,maxResponseAge:p.maxEnvelopeAge,deadline:new Date(p.settlementDeadline*1000).toISOString(),grace:p.refundGrace,sourceWindowStart:new Date(p.endWindowStart*1000).toISOString(),sourceWindowEnd:new Date(p.endWindowEnd*1000).toISOString(),refundRecipient:p.organizer}:undefined,
 actions:{canNewPool:false,canFund:writable&&c?.state===0,canStart:writable&&c?.state===1&&!m,canRun:writable&&c?.state===1&&!!m&&now<m.expiresAt&&now>=m.nextPollAt&&m.callsUsed<m.maxCalls,canRefund:writable&&c?.state===1&&now>=p.settlementDeadline+p.refundGrace}};
}
