import { mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,unlinkSync,openSync,closeSync } from 'node:fs';
export function readJson(path:string,fallback:any=null):any {try{return JSON.parse(readFileSync(path,'utf8'));}catch(e:any){if(e.code==='ENOENT')return fallback;throw e;}}
export function saveJson(path:string,value:any){mkdirSync(path.slice(0,path.lastIndexOf('/'))||'.',{recursive:true});const tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n',{mode:0o600});renameSync(tmp,path);}
export function appendTrail(type:string,title:string,status:string,extra:any={}){const t=readJson('.local/trail.json',[]);t.push({id:crypto.randomUUID(),poolId:readJson('.local/pool.json')?.id,at:new Date().toISOString(),type,title,status,...extra});saveJson('.local/trail.json',t);}
export async function exclusive<T>(fn:()=>Promise<T>):Promise<T>{
  mkdirSync('.local',{recursive:true});const path='.local/action.lock';
  if(existsSync(path)){const old=readJson(path,{});try{process.kill(old.pid,0);throw new Error('Another Prize Lock action is in progress');}catch(e:any){if(e.code!=='ESRCH')throw e;unlinkSync(path);}}
  const fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid}));closeSync(fd);
  try{return await fn();}finally{unlinkSync(path);}
}
