import { readFileSync, statSync } from 'node:fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import {scope} from './scope.ts';
export const AIRNODE_URL = 'https://airnode-pandascore.fly.dev/';
export const AIRNODE = '0xd9D29FEDc3737aD5198611457fE04aB08a739C7b';
export const AUSD = '0xbeA34973e5f67F18F656A2C6070C64326C791808';
export const PAY_TO = '0x1505FD562AC2Fb4307B85BC6c672FfeafB4d57A7';
export const NETWORK = 'eip155:84532';
export const rpc = process.env.RPC_URL || 'https://sepolia.base.org';
export const publicClient = createPublicClient({chain:baseSepolia,transport:http(rpc,{timeout:20_000,retryCount:1})});
export function wallets() {
  const path=scope()?.walletFile || process.env.WALLET_FILE || '.local/test-wallets.json';
  if ((statSync(path).mode & 0o077)!==0) throw new Error('Wallet file permissions must be 0600');
  const w=JSON.parse(readFileSync(path,'utf8'));
  if(w.testOnly!==true || w.chainId!==84532) throw new Error('Only isolated Base Sepolia test wallets are allowed');
  const roles:any={};
  for(const role of ['deployer','buyer','counterparty']){
    const entry=w.roles[role]; const account=privateKeyToAccount(entry.privateKey as Hex);
    if(account.address.toLowerCase()!==entry.address.toLowerCase()) throw new Error('Wallet address mismatch');
    roles[role]=account;
  }
  return roles;
}
export function walletClient(role='deployer') {return createWalletClient({account:wallets()[role],chain:baseSepolia,transport:http(rpc,{timeout:20_000,retryCount:0})});}
export const tokenAbi=[{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'uint256'}]}, {type:'function',name:'authorizationState',stateMutability:'view',inputs:[{type:'address'},{type:'bytes32'}],outputs:[{type:'bool'}]}] as const;
