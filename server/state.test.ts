import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {getState} from './state.ts';
import {saveJson,readJson} from './store.ts';
import {publicClient} from './config.ts';
const fixture=JSON.parse(readFileSync(new URL('../evidence/deployment.json',import.meta.url),'utf8'));
const contractAbi=JSON.parse(readFileSync(new URL('../evidence/contract-abi.json',import.meta.url),'utf8'));
test('a fresh funded prize shows its bounded mandate before delegation and ignores an older paid mandate',async()=>{
 const root=process.cwd();mkdirSync('.local',{recursive:true});const dir=mkdtempSync(join(root,'.local/state-test-'));const env=process.env.WALLET_FILE;const read=publicClient.readContract;const balance=publicClient.getBalance;
 try{process.chdir(dir);saveJson('.local/pool.json',{...fixture,id:'fresh-prize'});saveJson('.local/mandate.json',null);saveJson('evidence/payout.json',{pool:{id:'older-prize'},mandate:{status:'paid'}});saveJson('evidence/contract-abi.json',contractAbi);saveJson('.local/test-wallets.json',{});process.env.WALLET_FILE=join(dir,'.local/test-wallets.json');
 publicClient.readContract=(async({functionName}:any)=>functionName==='state'?1:functionName==='winningTeam'?0n:functionName==='paidTo'?'0x0000000000000000000000000000000000000000':'0x'+'00'.repeat(32)) as any;
 publicClient.getBalance=(async()=>100000000000000n) as any;
 const s=await getState();assert.equal(s.mandate.status,'ready');assert.equal(s.mandate.maxApiFee,'10000');assert.equal(s.mandate.totalApiBudget,'30000');assert.equal(s.mandate.maxCalls,3);assert.equal(s.mandate.apiSpent,'0');assert.equal(s.mandate.contract,fixture.address);assert.equal(s.actions.canStart,true);assert.equal(readJson('.local/mandate.json'),null);
 }finally{publicClient.readContract=read;publicClient.getBalance=balance;if(env===undefined)delete process.env.WALLET_FILE;else process.env.WALLET_FILE=env;process.chdir(root);rmSync(dir,{recursive:true,force:true});}
});
