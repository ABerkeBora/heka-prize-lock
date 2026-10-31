import { AsyncLocalStorage } from 'node:async_hooks';
export type RuntimeScope={localRoot:string;evidenceRoot:string;walletFile?:string;artifactName?:string};
const contexts=new AsyncLocalStorage<RuntimeScope>();
export const v2Scope:RuntimeScope={localRoot:'.local/v2',evidenceRoot:'evidence/v2',walletFile:'.local/v2/test-wallets.json',artifactName:'FuturePrizeLock'};
export function scope(){return contexts.getStore();}
export function withScope<T>(runtime:RuntimeScope,fn:()=>T):T{return contexts.run(runtime,fn);}
export function scopedPath(path:string){const runtime=scope();if(!runtime)return path;
 for(const [base,target] of [['.local',runtime.localRoot],['evidence',runtime.evidenceRoot]]){
  if(path===target||path.startsWith(target+'/'))return path;
  if(path===base)return target;
  if(path.startsWith(base+'/'))return target+path.slice(base.length);
 }return path;
}
