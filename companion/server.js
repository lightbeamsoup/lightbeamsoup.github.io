import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {askCodex,API} from './codex.js';

const port=Number(process.env.GOALROOM_PORT||3487);
const pairing=randomBytes(32).toString('hex');
const host=`127.0.0.1:${port}`;
const origin=`http://${host}`;
const allowed=new Set(['https://www.joshcodes.ai','https://joshcodes.ai',origin]);
const files=new Map(['index.html','app.js','style.css','config.js','contracts.js','ask-ai.js','benchmarks.json','README.md'].map(n=>['/agent-lab/'+(n==='index.html'?'':n),n]));
let active=null;
const authorized=req=>{const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const expected=Buffer.from(pairing);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);};
async function body(req){const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw new Error('Request too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.headers.host!==host)return json(res,403,{error:'Invalid host.'});
  if(req.headers.origin&&!allowed.has(req.headers.origin))return json(res,403,{error:'Origin not allowed.'});
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, X-Goals-Channel');res.writeHead(204);return res.end();}
  try{
    const path=new URL(req.url,origin).pathname;
    if(req.method==='GET'&&path==='/'){res.writeHead(302,{Location:'/agent-lab/'});return res.end();}
    if(req.method==='GET'&&files.has(path)){
      const name=files.get(path);const data=await readFile(new URL('../agent-lab/'+name,import.meta.url));
      res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.md')?'text/plain; charset=utf-8':'text/javascript'});return res.end(data);
    }
    // Same-origin proxy for the local tracker. Only the fixed Goalroom API is reachable.
    if(path.startsWith('/api/agent-lab/v1/')&&['GET','POST'].includes(req.method)){
      const suffix=path.slice('/api/agent-lab/v1'.length);
      if(!/^\/(workspaces|login|logout|snapshot|openapi\.json|actions\/[a-z_]+|goals\/[a-zA-Z0-9-]+)$/.test(suffix))return json(res,404,{error:'Unknown tracker route.'});
      const payload=req.method==='POST'?await body(req):undefined;
      const upstream=await fetch(API+suffix,{method:req.method,headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{}),'X-Goals-Channel':req.headers['x-goals-channel']||'browser'},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000)});
      return json(res,upstream.status,await upstream.json());
    }
    if(!authorized(req))return json(res,401,{error:'Open the paired URL printed by npm run companion.'});
    if(path==='/companion/status'&&req.method==='GET')return json(res,200,{ready:true,busy:!!active});
    if(path==='/companion/cancel'&&req.method==='POST'){active?.abort();return json(res,200,{cancelled:true});}
    if(path==='/companion/run'&&req.method==='POST'){
      if(active)return json(res,409,{error:'Another run is in progress.'});
      const input=await body(req);
      if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>8000||typeof input.token!=='string'||input.token.length>2048||!input.token)return json(res,400,{error:'A prompt and signed-in tracker session are required.'});
      if(input.allowWrites!==undefined&&typeof input.allowWrites!=='boolean')return json(res,400,{error:'Invalid update permission.'});
      if(active)return json(res,409,{error:'Another run is in progress.'});
      const controller=new AbortController();active=controller;
      res.writeHead(200,{'Content-Type':'application/x-ndjson'});
      const emit=value=>{if(!res.destroyed)res.write(JSON.stringify(value)+'\n');};
      const close=()=>controller.abort();res.on('close',close);
      try{const result=await askCodex({...input,model:undefined,signal:controller.signal,onEvent:emit});emit({type:'done',result});}
      catch(error){emit({type:'error',error:error.message});}
      finally{res.off('close',close);active=null;res.end();}
      return;
    }
    json(res,404,{error:'Not found.'});
  }catch(error){if(!res.headersSent)json(res,400,{error:error.message});else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Goalroom companion (local only)\nOpen: ${origin}/agent-lab/#pair=${pairing}\nUse your existing codex login. Ctrl+C stops the companion.`));
for(const event of ['SIGINT','SIGTERM'])process.on(event,()=>{active?.abort();server.close();});
