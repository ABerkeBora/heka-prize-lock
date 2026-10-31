import {encodeDeployData,encodeFunctionData,toHex} from 'viem';
import {AIRNODE,AIRNODE_URL,AUSD,PAY_TO,NETWORK,publicClient,wallets} from './config.ts';
import {deriveRequestHash,verifySignedResponse} from './airnode-v2.ts';
import {readJson,saveJson,appendTrail} from './store.ts';
import {abi,artifact,sendTx,readPool,submitRequest} from './chain.ts';
import {buy} from './payment.ts';
import {runAgent} from './agent.ts';
export async function createFuturePool(){
 let pool=readJson('.local/pool.json');if(pool?.address)throw new Error('One V2 pilot is already deployed; preserve it');
 if(!pool&&readJson('evidence/deployment.json')?.address)throw new Error('Published V2 pilot is read-only without its local state; do not overwrite its history');
 const request=readJson('evidence/request.json');const match=readJson('evidence/match.json');const initial=readJson('evidence/funding-observation.json');if(!request||!initial)throw new Error('Bounded future discovery required');
 const d=JSON.parse(initial.data);const scheduledAt=Math.floor(Date.parse(d.scheduledAt)/1000);const now=Math.floor(Date.now()/1000);const w=wallets();
 const describedTeams=match.opponents.map((o:any)=>String(o.opponent.id)).sort().join(',');
 if(String(d.id)!==String(match.id)||describedTeams!==[String(d.teamAId),String(d.teamBId)].sort().join(',')||d.scheduledAt!==match.scheduled_at)throw new Error('Signed selection changed match, team set or schedule before policy creation');
 if(d.status!=='not_started'||d.winnerId!==null||d.endAt!==null||!Number.isSafeInteger(scheduledAt)||scheduledAt<=now+60)throw new Error('A future, unknown-result match is required');
 if(!pool){const policy={airnode:AIRNODE,requestHash:deriveRequestHash(request),matchId:d.id,teamA:d.teamAId,teamB:d.teamBId,walletA:w.buyer.address,walletB:w.counterparty.address,organizer:w.deployer.address,prizeWei:'100000000000000',fundingClosesAt:Math.min(now+3600,scheduledAt-60),scheduledAt,endWindowStart:scheduledAt-1800,endWindowEnd:scheduledAt+21600,settlementDeadline:scheduledAt+28800,refundGrace:600,maxEnvelopeAge:180,finalityDelay:120,maxInitialSourceAge:604800,maxFinalSourceAge:3600};pool={id:'future-prize-1',status:'deploying',policy,request,createdAt:new Date().toISOString(),initialObservation:initial};saveJson('.local/pool.json',pool);}
 const a=artifact();saveJson('evidence/contract-abi.json',a.abi);
 const tx=await sendTx(`${pool.id}-deploy`,{data:encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args:[pool.policy]})});
 pool.address=tx.receipt.contractAddress;pool.deploymentTx=tx.hash;pool.status='unfunded';saveJson('.local/pool.json',pool);saveJson('evidence/deployment.json',pool);appendTrail('pool','Future-match rule fixed','confirmed',{txHash:tx.hash,detail:'Match, schedule, beneficiary wallets and observation window fixed before funding.'});return pool;
}
export async function fundFuturePool(){
 const pool=readJson('.local/pool.json');if(!pool?.address)throw new Error('Deploy the future-match policy first');
 let proof=readJson('.local/funding-proof.json');
 if(!proof){
  const m=readJson('.local/discovery-mandate.json');const result=await buy(pool.request,'future-funding-refresh',m,'.local/discovery-mandate.json');proof=result.proof;saveJson('.local/funding-proof.json',proof);
 }
 const args=[BigInt(proof.timestamp),toHex(proof.data),proof.signature];
 if(!readJson(`.local/transactions/${pool.id}-fund.json`))await publicClient.readContract({address:pool.address,abi:abi(),functionName:'validateFundingResponse',args});
 const tx=await sendTx(`${pool.id}-fund`,{to:pool.address,data:encodeFunctionData({abi:abi(),functionName:'fund',args}),value:BigInt(pool.policy.prizeWei)});
 pool.fundingTx=tx.hash;pool.status='waiting';saveJson('.local/pool.json',pool);saveJson('evidence/deployment.json',pool);saveJson('evidence/funding.json',{pool,proof,validator:'Fresh authenticated future/not_started, unknown result and exact schedule/team set accepted on-chain',receipt:tx.receipt,chain:await readPool(pool)});saveJson('.local/proof.json',proof);saveJson('evidence/latest-proof.json',proof);
 appendTrail('fund','Prize funded before result','confirmed',{txHash:tx.hash,amount:pool.policy.prizeWei,asset:'test ETH',detail:'The signed match was not started; winner and end time were null.'});return pool;
}
export async function startFutureAgent(){
 const pool=readJson('.local/pool.json');if(!pool?.address||(await readPool(pool)).state!==1)throw new Error('An unknown-result funded prize is required');
 if(readJson('.local/mandate.json'))throw new Error('A bounded V2 mandate already exists; resume it');
 const now=Math.floor(Date.now()/1000);const p=pool.policy;
 const mandate={id:pool.id+'-monitor',network:NETWORK,asset:AUSD,allowedTool:'getMatch',requestHash:p.requestHash,endpoint:AIRNODE_URL,contract:pool.address,payer:wallets().deployer.address,payTo:PAY_TO,beneficiaries:[p.walletA,p.walletB],refundBeneficiary:p.organizer,allowRefund:true,expiresAt:Math.min(p.settlementDeadline+p.refundGrace+3600,now+43200),maxCalls:3,callsUsed:0,maxActions:4,payoutActions:0,maxApiFee:'10000',totalApiBudget:'30000',apiReserved:'0',apiSpent:'0',gasBudgetWei:'300000000000000',maxActionGasWei:'150000000000000',gasReservedWei:'0',gasSpentWei:'0',pollIntervalSeconds:900,nextPollAt:now,status:'active',createdAt:new Date().toISOString()};
 saveJson('.local/mandate.json',mandate);saveJson('evidence/monitor-mandate.json',mandate);appendTrail('mandate','Result monitor delegated','confirmed',{detail:'Three priced observations maximum, one payout or fixed refund, no top-up or expiry extension.'});return runFutureAgent();
}
export async function refundFuturePool(delegated=false){
 const pool=readJson('.local/pool.json');const m=readJson('.local/mandate.json');
 if(Math.floor(Date.now()/1000)<pool.policy.settlementDeadline+pool.policy.refundGrace)throw new Error('Fixed refund grace has not elapsed');
 const tx=await sendTx(`${pool.id}-refund`,{to:pool.address,data:encodeFunctionData({abi:abi(),functionName:'refund',args:[]}),value:0n},delegated?{mandate:m,mandateFile:'.local/mandate.json',maxActionGasWei:m.maxActionGasWei,method:'refund',args:[]}:{maxActionGasWei:'150000000000000'});
 pool.refundTx=tx.hash;pool.status='refunded';saveJson('.local/pool.json',pool);saveJson('evidence/deployment.json',pool);if(m){m.status='refunded';m.gasSpentWei=tx.receipt.gasCostWei;saveJson('.local/mandate.json',m);}saveJson('evidence/refund.json',{pool,receipt:tx.receipt,chain:await readPool(pool)});appendTrail('refund','Prize returned after fixed timeout','confirmed',{txHash:tx.hash,amount:pool.policy.prizeWei,asset:'test ETH'});return tx.receipt;
}
export async function runFutureAgent(){
 const pool=readJson('.local/pool.json');let m=readJson('.local/mandate.json');if(!m)throw new Error('Delegate the V2 monitor first');
 const knownPayout=readJson(`.local/transactions/${pool.id}-payout.json`);const now=Math.floor(Date.now()/1000);
 if(knownPayout)return runAgent(); // Reuse V1's persisted receipt recovery before any new purchase.
 if(readJson(`.local/transactions/${pool.id}-refund.json`))return refundFuturePool(true);
 const chain=await readPool(pool);if(chain.state===2)return runAgent();if(chain.state===3){m.status='refunded';saveJson('.local/mandate.json',m);return {refunded:true};}
 if(now>=m.expiresAt){m.status='expired';saveJson('.local/mandate.json',m);throw new Error('V2 mandate expired; no extension or new payment');}
 if(now>=pool.policy.settlementDeadline+pool.policy.refundGrace)return refundFuturePool(true);
 if(now>=pool.policy.settlementDeadline){m.status='waiting-void';m.nextPollAt=pool.policy.settlementDeadline+pool.policy.refundGrace;saveJson('.local/mandate.json',m);return {waiting:true,reason:'Fixed grace interval'};}
 if(m.callsUsed>=m.maxCalls&&!m.currentIntent){m.status='budget-exhausted';m.nextPollAt=pool.policy.settlementDeadline+pool.policy.refundGrace;saveJson('.local/mandate.json',m);return {waiting:true,reason:'Observation budget exhausted; prize remains locked'};}
 if(now<m.nextPollAt)throw new Error('Next bounded observation is not due');
 const result=await runAgent();m=readJson('.local/mandate.json');
 if(result.held){const proof=readJson('.local/proof.json');const d=JSON.parse(proof.data);m.status=['canceled','postponed'].includes(d.status)?'waiting-void':'waiting';m.lastError=null;m.nextPollAt=m.status==='waiting-void'?pool.policy.settlementDeadline+pool.policy.refundGrace:(m.callsUsed===1?Math.max(now+m.pollIntervalSeconds,pool.policy.scheduledAt+5400):now+1800);saveJson('.local/mandate.json',m);
  const evidence={checkedAt:new Date().toISOString(),pool,mandate:m,proof,chain:await readPool(pool),decision:'NO_PAYOUT',reason:'Real signed result is not final; prize remains protected',liveTerminal:'PENDING'};saveJson('evidence/waiting.json',evidence);appendTrail('wait','Waiting for a final match result','confirmed',{detail:'Authenticated nonfinal data did not release the prize. Next observation follows the fixed mandate.'});return evidence;
 }return result;
}
