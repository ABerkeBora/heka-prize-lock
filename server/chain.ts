import { readFileSync } from 'node:fs';
import { encodeFunctionData, keccak256, toHex, type Hex } from 'viem';
import { publicClient,walletClient,wallets } from './config.ts';
import { readJson,saveJson,appendTrail } from './store.ts';
export function artifact(){return JSON.parse(readFileSync('out/PrizeLock.sol/PrizeLock.json','utf8'));}
export function abi(){return readJson('evidence/contract-abi.json') || artifact().abi;}

// Sign, persist the exact transaction, then broadcast. Restart retries reuse its hash and nonce.
export async function sendTx(intentId:string,request:any,options:any={}){
  const path=`.local/transactions/${intentId}.json`;let tx=readJson(path);const client=walletClient();
  const requestHash=keccak256(toHex(JSON.stringify({to:request.to?.toLowerCase()||null,data:request.data||'0x',value:String(request.value||0n)})));
  if(tx?.requestHash&&tx.requestHash!==requestHash)throw new Error('Transaction intent is bound to different calldata, recipient or value');
  if(!tx){
    if(await publicClient.getChainId()!==84532)throw new Error('Wrong chain');
    const gas=options.gasLimit||await publicClient.estimateGas({...request,account:client.account});
    const maxFeePerGas=100000000n;const gasLimit=gas*12n/10n;
    // Conservative local reserve includes a rollup-fee allowance; this is an executor estimate, not an on-chain gas allowance.
    const reserved=gasLimit*maxFeePerGas+1000000000000n;
    if(reserved>BigInt(options.maxActionGasWei||'1000000000000000'))throw new Error('Per-action gas cap exceeded');
    if(options.mandate){
      const m=options.mandate;
      if(Math.floor(Date.now()/1000)>=m.expiresAt)throw new Error('Mandate expired');
      if(request.to?.toLowerCase()!==m.contract.toLowerCase()||request.value&&BigInt(request.value)!==0n)throw new Error('Unapproved transaction destination or value');
      const expected=encodeFunctionData({abi:abi(),functionName:'submitResponse',args:options.args});
      if(request.data!==expected)throw new Error('Unapproved calldata');
      if(BigInt(m.gasReservedWei)+reserved>BigInt(m.gasBudgetWei)||m.payoutActions>=1)throw new Error('Total gas budget or action limit exceeded');
      m.gasReservedWei=(BigInt(m.gasReservedWei)+reserved).toString();m.payoutActions++;saveJson(options.mandateFile,m);
    }
    const prepared=await client.prepareTransactionRequest({...request,gas:gasLimit,maxFeePerGas,maxPriorityFeePerGas:1000000n});
    const raw=await client.signTransaction(prepared);tx={intentId,requestHash,hash:keccak256(raw),raw,status:'signed',to:request.to||null,gasReservedWei:reserved.toString(),createdAt:new Date().toISOString()};saveJson(path,tx);
  }
  let receipt:any;
  try{receipt=await publicClient.getTransactionReceipt({hash:tx.hash});}catch(e:any){if(e.name!=='TransactionReceiptNotFoundError')throw e;}
  if(!receipt){
    if(options.mandate&&Math.floor(Date.now()/1000)>=options.mandate.expiresAt)throw new Error('Mandate expired; signed transaction not rebroadcast. Existing hash remains reconcilable.');
    try{await client.sendRawTransaction({serializedTransaction:tx.raw});}catch(e:any){
      // A known transaction may already be in the mempool. Never sign a replacement with a fresh nonce.
      if(!/already known|nonce too low|known transaction/i.test(e.shortMessage||e.message))throw new Error(`Broadcast uncertain for ${tx.hash}. Reconcile this hash before retry.`);
    }
    tx.status='pending';saveJson(path,tx);
    appendTrail('transaction','Transaction submitted','pending',{txHash:tx.hash,intentId});
    receipt=await publicClient.waitForTransactionReceipt({hash:tx.hash,timeout:60_000});
  }
  const l1Fee=BigInt(receipt.l1Fee||0);tx.status=receipt.status;tx.receipt={transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber.toString(),status:receipt.status,contractAddress:receipt.contractAddress,gasUsed:receipt.gasUsed.toString(),effectiveGasPrice:receipt.effectiveGasPrice.toString(),l1FeeWei:l1Fee.toString(),gasCostWei:(receipt.gasUsed*receipt.effectiveGasPrice+l1Fee).toString()};saveJson(path,tx);
  const trail=readJson('.local/trail.json',[]);for(const item of trail){if(item.txHash===tx.hash&&item.status==='pending')item.status=receipt.status==='success'?'confirmed':'reverted';}saveJson('.local/trail.json',trail);
  if(receipt.status!=='success'&&!options.expectedRevert)throw new Error(`Transaction reverted: ${tx.hash}`);
  return tx;
}
export async function readPool(pool:any){
  const names=['state','winningTeam','paidTo','acceptedProofHash'];const values=await Promise.all(names.map(functionName=>publicClient.readContract({address:pool.address,abi:abi(),functionName})));
  return {state:Number(values[0]),winningTeam:String(values[1]),paidTo:values[2],acceptedProofHash:values[3],balanceWei:(await publicClient.getBalance({address:pool.address})).toString()};
}
export function submitRequest(pool:any,proof:any){
  return {to:pool.address as Hex,data:encodeFunctionData({abi:abi(),functionName:'submitResponse',args:[BigInt(proof.timestamp),'0x'+Buffer.from(proof.data).toString('hex'),proof.signature]}),value:0n};}
