import { tools } from '../agent-lab/contracts.js';
import { AppError, fail, validate, authSchema } from '../server/goals/shared.js';
import { seedData, actorFor, employee, goalView, execute } from './domain.js';

const prefix='/api/agent-lab/v1';
const randomKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,'0')).join('');
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const credentialHash=(workspace,id,password)=>digest(`goalroom-generated-key-v1:${workspace}:${id}:${password}`);
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
async function body(request){
  if(Number(request.headers.get('content-length'))>16384)fail(413,'Request body is too large.');
  if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'Use application/json.');
  const reader=request.body?.getReader();if(!reader)return {};
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();fail(413,'Request body is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid JSON.');}
}
async function limited(db,ip,category,max){
  const now=Date.now();const id=await digest(`${category}:${ip}`);
  const row=await stmt(db,`INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET
    count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN ? ELSE expires END RETURNING count`,id,now+3600000,now,now,now+3600000).first();
  if(row.count>max)fail(429,'Too many attempts. Try again in an hour.');
}
async function workspace(db,id){
  const row=await stmt(db,'SELECT id,expires,revision,data FROM sandboxes WHERE id=? AND expires>?',id,Date.now()).first();
  if(!row)fail(401,'Sandbox expired or not found. Create a new sandbox.');
  return {...row,data:JSON.parse(row.data)};
}
async function createWorkspace(db){
  const now=Date.now();
  await db.batch([stmt(db,'DELETE FROM sessions WHERE expires<?',now),stmt(db,'DELETE FROM sandboxes WHERE expires<?',now),stmt(db,'DELETE FROM rate_limits WHERE expires<?',now)]);
  const id=crypto.randomUUID(),expires=now+86400000,data=seedData();
  const accounts=await Promise.all(data.people.map(async p=>{
    const password=randomKey();p.credentialHash=await credentialHash(id,p.id,password);
    return {id:p.id,name:p.name,email:p.email,role:p.role,password};
  }));
  const result=await stmt(db,'INSERT INTO sandboxes(id,expires,data) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM sandboxes)<100',id,expires,JSON.stringify(data)).run();
  if(!result.meta.changes)fail(429,'Sandbox capacity reached. Try again later.');
  return {workspace:id,expires,accounts};
}
async function login(db,input){
  let w;try{w=await workspace(db,input.workspace);}catch{fail(401,'Invalid credentials.');}
  const p=w.data.people.find(p=>p.email===input.email);
  const actual=await credentialHash(input.workspace,p?.id||'invalid',input.password);
  // Keys are random 192-bit sandbox credentials, never user-selected passwords.
  let mismatch=0;const expected=p?.credentialHash||'0'.repeat(64);
  for(let i=0;i<64;i++)mismatch|=actual.charCodeAt(i)^expected.charCodeAt(i);
  if(!p||mismatch)fail(401,'Invalid credentials.');
  const token=randomKey(),expires=Math.min(Date.now()+3600000,w.expires);
  await stmt(db,'INSERT INTO sessions VALUES(?,?,?,?)',await digest(token),w.id,p.id,expires).run();
  return {token,expires,identity:actorFor(w.data,w.id,p.id)};
}
async function authenticate(db,request){
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith('Bearer ')||header.length>200)fail(401,'Sign in to your sandbox.');
  const token=await digest(header.slice(7));
  const session=await stmt(db,'SELECT workspace,employee FROM sessions WHERE token=? AND expires>?',token,Date.now()).first();
  if(!session)fail(401,'Sign in to your sandbox.');
  return {...session,token};
}
async function events(db,session){return (await stmt(db,'SELECT channel,action,status,ms,created FROM events WHERE workspace=? AND employee=? ORDER BY id DESC LIMIT 100',session.workspace,session.employee).all()).results;}
async function record(db,session,channel,name,status,ms){
  await db.batch([
    stmt(db,'INSERT INTO events(workspace,employee,channel,action,status,ms,created) VALUES(?,?,?,?,?,?,?)',session.workspace,session.employee,channel,name,status,ms,new Date().toISOString()),
    stmt(db,'DELETE FROM events WHERE workspace=? AND employee=? AND id NOT IN (SELECT id FROM events WHERE workspace=? AND employee=? ORDER BY id DESC LIMIT 100)',session.workspace,session.employee,session.workspace,session.employee)
  ]);
}
async function action(db,session,name,input){
  const tool=tools.find(t=>t.name===name);if(!tool)fail(404,'Unknown action.');
  validate(tool.inputSchema,input);
  const {idempotencyKey,...args}=input;
  if(!tool.readOnly&&(typeof idempotencyKey!=='string'||idempotencyKey.length<8||idempotencyKey.length>128))fail(400,'Supply an idempotencyKey of 8 to 128 characters.');
  const fingerprint=await digest(JSON.stringify([name,args]));
  for(let attempt=0;attempt<4;attempt++){
    const w=await workspace(db,session.workspace),actor=actorFor(w.data,w.id,session.employee);
    // Current authorization precedes even cached retry responses.
    if(args.employee)employee(w.data,actor,args.employee);
    if(args.id)goalView(w.data,actor,args.id);
    if(!tool.readOnly){
      const prior=w.data.replays.find(p=>p.actor===actor.id&&p.key===idempotencyKey);
      if(prior){if(prior.fingerprint!==fingerprint)fail(409,'Idempotency key already used for a different request.');return prior.result;}
      if(w.data.replays.length>=500)fail(429,'Sandbox write limit reached. Create a fresh sandbox.');
    }
    const result=execute(w.data,actor,name,args);
    if(tool.readOnly)return result;
    w.data.replays.push({actor:actor.id,key:idempotencyKey,fingerprint,result});
    const serialized=JSON.stringify(w.data);
    if(new TextEncoder().encode(serialized).length>1000000)fail(429,'Sandbox storage limit reached. Create a fresh sandbox.');
    const updated=await stmt(db,'UPDATE sandboxes SET data=?,revision=revision+1 WHERE id=? AND revision=? AND expires>?',serialized,w.id,w.revision,Date.now()).run();
    if(updated.meta.changes)return result;
  }
  fail(409,'Sandbox changed concurrently. Retry using the same idempotency key.');
}
function openapi(){return {openapi:'3.1.0',info:{title:'Goalroom Cloudflare API',version:'2.0.0'},servers:[{url:prefix}],components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}},paths:Object.fromEntries(tools.map(t=>[`/actions/${t.name}`,{post:{operationId:t.name,summary:t.description,security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:t.inputSchema}}},responses:{200:{description:'Action result'},400:{description:'Invalid input'},401:{description:'Sign-in required'},403:{description:'Permission denied'},404:{description:'Record outside scope or missing'},409:{description:'Version or retry conflict'},429:{description:'Sandbox or free-tier protection limit'}}}}]))};}
export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('origin');
    const allowed=(env.GOALS_ALLOWED_ORIGINS||'https://www.joshcodes.ai,https://joshcodes.ai').split(',').map(x=>x.trim());
    if(env.ALLOW_LOCAL_PREVIEW==='true')allowed.push('http://localhost:3004','http://127.0.0.1:3004');
    const headers={};
    if(origin){
      if(origin!==url.origin&&!allowed.includes(origin))return json({error:'Origin not allowed.'},403);
      Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Goals-Channel, Idempotency-Key','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS'});
    }
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    let session,name,start;
    try{
      if(url.pathname==='/healthz')return json({ok:true,service:'goalroom',storage:'D1'},200,headers);
      if(!url.pathname.startsWith(prefix+'/'))fail(404,'Route not found.');
      if(!env.DB)fail(503,'Database binding is not configured.');
      const db=env.DB,path=url.pathname.slice(prefix.length),method=request.method;
      const ip=request.headers.get('CF-Connecting-IP')||'local';
      if(path==='/openapi.json'&&method==='GET')return json(openapi(),200,headers);
      if(path==='/workspaces'&&method==='POST'){await limited(db,ip,'create',10);validate({properties:{},required:[]},await body(request));return json(await createWorkspace(db),201,headers);}
      if(path==='/login'&&method==='POST'){await limited(db,ip,'login',100);return json(await login(db,validate(authSchema,await body(request))),200,headers);}
      session=await authenticate(db,request);
      await limited(db,ip,'actions',5000);
      if(path==='/logout'&&method==='POST'){await stmt(db,'DELETE FROM sessions WHERE token=?',session.token).run();return json({ok:true},200,headers);}
      if(path==='/events'&&method==='GET')return json(await events(db,session),200,headers);
      if(['/me','/employees','/snapshot'].includes(path)&&method==='GET'){
        const w=await workspace(db,session.workspace),actor=actorFor(w.data,w.id,session.employee);
        if(path==='/me')return json(actor,200,headers);
        const people=execute(w.data,actor,'list_employees',{});
        if(path==='/employees')return json(people,200,headers);
        return json({identity:actor,employees:people,goals:execute(w.data,actor,'list_goals',{}),events:await events(db,session)},200,headers);
      }
      let input;
      if(path.startsWith('/actions/')&&method==='POST'){name=path.slice(9);input=await body(request);}
      else if(path==='/goals'&&method==='GET'){name='list_goals';input=Object.fromEntries(url.searchParams);}
      else if(path==='/goals'&&method==='POST'){name='create_goal';input={...await body(request),idempotencyKey:request.headers.get('Idempotency-Key')};}
      else {
        const match=path.match(/^\/goals\/([^/]+)(?:\/(progress|feedback))?$/);
        if(!match)fail(404,'Route not found.');
        if(!match[2]&&method==='GET'){name='get_goal';input={id:decodeURIComponent(match[1])};}
        else if((match[2]==='progress'&&method==='PATCH')||(match[2]==='feedback'&&method==='POST')){name=match[2]==='progress'?'update_progress':'add_feedback';input={...await body(request),id:decodeURIComponent(match[1]),idempotencyKey:request.headers.get('Idempotency-Key')};}
        else fail(405,'Method not allowed.');
      }
      start=performance.now();const result=await action(db,session,name,input);
      await record(db,session,['browser','webmcp','api'].includes(request.headers.get('X-Goals-Channel'))?request.headers.get('X-Goals-Channel'):'api',name,200,performance.now()-start);
      return json(result,200,headers);
    }catch(error){
      const status=error instanceof AppError?error.status:500;
      if(session&&name&&start!==undefined)try{await record(env.DB,session,request.headers.get('X-Goals-Channel')||'api',name,status,performance.now()-start);}catch{}
      if(status===500)console.error('Goalroom request failed:',error.message);
      return json({error:status===500?'Unable to complete request.':error.message},status,headers);
    }
  }
};
