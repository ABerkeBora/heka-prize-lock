import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData} from 'viem';
import {exclusive,readJson,saveJson} from '../server/store.ts';
import {v2Scope,withScope} from '../server/scope.ts';
import {wallets,AUSD,publicClient} from '../server/config.ts';
import {sendTx} from '../server/chain.ts';
// V1's nonce is used only under its global lock to seed the new isolated executor once.
await exclusive(async()=>{
 const sourceFile=process.env.WALLET_FILE;if(!sourceFile)throw new Error('Explicit V1 test funding wallet required');
 const source=wallets().deployer;const v1=readJson('.local/mandate.json');if(v1&&v1.status!=='paid'&&v1.status!=='expired')throw new Error('V1 executor is not terminal; do not race its nonce');
 await withScope(v2Scope,()=>exclusive(async()=>{
  let w=readJson('.local/test-wallets.json');if(!w&&readJson('evidence/executor.json'))throw new Error('Published V2 executor exists; review evidence without seeding a replacement');if(!w){const roles:any={};for(const role of ['deployer','buyer','counterparty']){const privateKey=generatePrivateKey();roles[role]={privateKey,address:privateKeyToAccount(privateKey).address};}w={testOnly:true,chainId:84532,roles};saveJson('.local/test-wallets.json',w);}
  const target=w.roles.deployer.address;saveJson('evidence/executor.json',{network:84532,executor:target,beneficiaryA:w.roles.buyer.address,beneficiaryB:w.roles.counterparty.address,source:source.address,note:'Separate V2 nonce and storage. Test beneficiaries do not represent teams.'});
  const fundingScope={...v2Scope,walletFile:sourceFile};
  const eth=await withScope(fundingScope,()=>sendTx('seed-v2-gas-prize',{to:target,value:1000000000000000n}));
  const transferAbi=[{type:'function',name:'transfer',stateMutability:'nonpayable',inputs:[{type:'address'},{type:'uint256'}],outputs:[{type:'bool'}]}] as const;
  const usd=await withScope(fundingScope,()=>sendTx('seed-v2-api',{to:AUSD,data:encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[target,100000n]}),value:0n}));
  saveJson('evidence/executor-funding.json',{executor:target,testEthWei:'1000000000000000',aUSDBaseUnits:'100000',ethTransaction:eth.hash,aUSDTransaction:usd.hash});console.log('Isolated V2 executor funded',target);
 }));
});
