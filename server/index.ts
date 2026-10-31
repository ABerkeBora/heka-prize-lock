import express from 'express';
import { getState } from './state.ts';
import { startAgent,runAgent,newPool,fundPool,refundPool } from './agent.ts';
import { checkProof } from './proofs.ts';
import { exclusive,readJson,saveJson,appendTrail } from './store.ts';
const app=express();app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
 if(req.method==='POST'){
  const origin=req.headers.origin;if(origin&&origin!==`http://127.0.0.1:${process.env.PORT||3105}`&&origin!==`http://localhost:${process.env.PORT||3105}`)return res.status(403).json({error:'Unapproved origin'});
  if(!req.is('application/json'))return res.status(415).json({error:'JSON required'});
 }next();});
app.use(express.json({limit:'128kb'}));
app.get('/api/state',async(_req,res)=>{try{res.json(await getState());}catch(e:any){res.status(503).json({error:e.shortMessage||e.message});}});
for(const [path,handler] of Object.entries({'/api/agent/start':startAgent,'/api/agent/run':runAgent,'/api/pool/new':newPool,'/api/pool/fund':fundPool,'/api/refund':refundPool}))app.post(path,async(_req,res)=>{try{res.json(await exclusive(handler));}catch(e:any){res.status(409).json({error:e.shortMessage||e.message});}});
app.post('/api/proof/check',async(req,res)=>{try{res.json(await exclusive(()=>checkProof(req.body.case,req.body.proof)));}catch(e:any){res.status(400).json({error:e.shortMessage||e.message});}});
app.use('/evidence',express.static('evidence',{dotfiles:'deny'}));app.use(express.static('web/dist'));
// A bounded local keeper resumes only this mandate. Attention/error states require review; no top-ups.
let ticking=false;
setInterval(async()=>{if(ticking)return;const current=readJson('.local/mandate.json');if(!current||!['active','awaiting-result','buying-data','paying'].includes(current.status))return;
 ticking=true;try{await exclusive(async()=>{
  const m=readJson('.local/mandate.json');if(!m||!['active','awaiting-result','buying-data','paying'].includes(m.status))return;
  const p=readJson('.local/pool.json');const pendingPayout=readJson(`.local/transactions/${p.id}-payout.json`);
  if(!pendingPayout&&Math.floor(Date.now()/1000)>=m.expiresAt){m.status='expired';saveJson('.local/mandate.json',m);return;}
  if(!pendingPayout&&m.lastObservedAt&&Date.now()-Date.parse(m.lastObservedAt)<m.pollIntervalSeconds*1000)return;
  try{await runAgent();}catch(e:any){const latest=readJson('.local/mandate.json');latest.status=/budget|limit/.test(e.message)?'budget-exhausted':'attention';latest.lastError=e.shortMessage||e.message;saveJson('.local/mandate.json',latest);appendTrail('agent','Treasury cycle stopped','rejected',{detail:latest.lastError});}
 });}catch(e:any){if(!/in progress/.test(e.message))console.error('Treasury state unavailable:',e.message);}finally{ticking=false;}
},5000).unref();
app.listen(Number(process.env.PORT||3105),'127.0.0.1',()=>console.log(`Prize Lock: http://127.0.0.1:${process.env.PORT||3105}`));
