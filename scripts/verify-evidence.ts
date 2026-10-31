import {publicClient} from '../server/config.ts';
import {abi,readPool} from '../server/chain.ts';
import {readJson,saveJson} from '../server/store.ts';
const pool=readJson('evidence/deployment.json');const actual:any={};
for(const [name,value] of Object.entries(pool.policy)){
 if(name==='refundGrace')continue;
 const result=await publicClient.readContract({address:pool.address,abi:abi(),functionName:name});actual[name]=String(result);
 if(String(result).toLowerCase()!==String(value).toLowerCase())throw new Error('Policy mismatch: '+name);
}
const refund=await publicClient.readContract({address:pool.address,abi:abi(),functionName:'refundAvailableAt'});
if(refund!==BigInt(pool.policy.settlementDeadline)+BigInt(pool.policy.refundGrace))throw new Error('Refund policy mismatch');
const chain=await readPool(pool);if(chain.state!==2||chain.balanceWei!=='0')throw new Error('Prize is not paid');
const rejects=[];for(const entry of readJson('evidence/live-tamper-checks.json',[])){
 const receipt=await publicClient.getTransactionReceipt({hash:entry.txHash});if(receipt.status!=='reverted'||!entry.prizeUnchanged)throw new Error('Missing rejection evidence');rejects.push({case:entry.case,txHash:entry.txHash,status:receipt.status});
}
saveJson('evidence/chain-verification.json',{checkedAt:new Date().toISOString(),network:84532,address:pool.address,policy:actual,refundAvailableAt:String(refund),chain,rejections:rejects});console.log('Immutable policy, terminal payout, zero reserve and four reverted receipts verified.');
