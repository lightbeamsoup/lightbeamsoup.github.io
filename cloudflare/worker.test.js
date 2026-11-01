import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.js';

let platform,env;
before(async()=>{
  platform=await getPlatformProxy({configPath:'cloudflare/wrangler.jsonc',persist:false});
  env=platform.env;
  const migration=await fs.readFile(new URL('./migrations/0001_goalroom.sql',import.meta.url),'utf8');
  await env.DB.batch(migration.split(';').map(s=>s.trim()).filter(Boolean).map(s=>env.DB.prepare(s)));
});
after(async()=>{await platform?.dispose();});
async function call(path,{body,token,method=body===undefined?'GET':'POST',origin,channel='api',headers={}}={}){
  const response=await worker.fetch(new Request('https://goalroom.example/api/agent-lab/v1'+path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{ }),...(origin?{Origin:origin}:{}),'X-Goals-Channel':channel,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  return {status:response.status,data:response.status===204?null:await response.json(),headers:response.headers};
}
async function fixture(){
  const w=await call('/workspaces',{body:{}});assert.equal(w.status,201,JSON.stringify(w.data));
  const tokens={};
  for(const id of ['admin','maya','evan','alex-r','priya']){
    const p=w.data.accounts.find(p=>p.id===id);
    const login=await call('/login',{body:{workspace:w.data.workspace,email:p.email,password:p.password}});
    assert.equal(login.status,200,JSON.stringify(login.data));tokens[id]=login.data.token;
  }
  return {workspace:w.data,tokens};
}
test('D1 permissions match employee, supervisor, subtree and admin roles without exposing credential hashes',async()=>{
  const {tokens:t}=await fixture();
  assert.deepEqual((await call('/actions/list_employees',{token:t['alex-r'],body:{}})).data.map(p=>p.id),['alex-r']);
  assert.deepEqual(new Set((await call('/actions/list_employees',{token:t.evan,body:{}})).data.map(p=>p.id)),new Set(['evan','alex-r','priya']));
  assert.equal((await call('/actions/list_goals',{token:t.maya,body:{status:'overdue'}})).data.length,4);
  const snap=await call('/snapshot',{token:t.admin});assert.equal(snap.data.employees.length,9);
  assert(!JSON.stringify(snap.data).includes('credentialHash'));
  assert.equal((await call('/actions/get_goal',{token:t.evan,body:{id:'alex-c-1'}})).status,404);
  assert.equal((await call('/actions/list_goals',{token:t.evan,body:{role:'admin'}})).status,400);
});
test('concurrent identical retries commit one mutation, and competing versions cannot overwrite one another',async()=>{
  const {tokens:t}=await fixture();
  const input={id:'alex-r-1',version:1,progress:80,note:'Concurrent retry',idempotencyKey:'concurrent-retry-001'};
  const retries=await Promise.all([call('/actions/update_progress',{token:t['alex-r'],body:input}),call('/actions/update_progress',{token:t['alex-r'],body:input})]);
  assert.equal(retries[0].status,200);assert.equal(retries[1].status,200);
  assert.deepEqual(retries[0].data,retries[1].data);assert.equal(retries[0].data.notes.length,1);
  const competing=await Promise.all([90,95].map(progress=>call('/actions/update_progress',{token:t['alex-r'],body:{...input,version:2,progress,idempotencyKey:`competing-${progress}`}})));
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
  const read=await call('/goals/alex-r-1',{token:t['alex-r']});assert.equal(read.data.version,3);assert.equal(read.data.notes.length,2);
  assert.equal((await call('/actions/update_progress',{token:t.evan,body:{...input,idempotencyKey:'wrong-actor-001'}})).status,403);
});
test('hierarchy changes revoke existing sessions and retry visibility; cycles and cross-department moves fail',async()=>{
  const {tokens:t}=await fixture();
  const input={employee:'priya',title:'New API goal',target:'One result',due:'2027-01-01',idempotencyKey:'assigned-goal-001'};
  assert.equal((await call('/actions/create_goal',{token:t.evan,body:input})).status,200);
  const manager=body=>call('/actions/set_manager',{token:t.admin,body:{...body,idempotencyKey:crypto.randomUUID()}});
  assert.equal((await manager({employee:'maya',manager:'evan'})).status,400);
  assert.equal((await manager({employee:'priya',manager:'lena'})).status,400);
  assert.equal((await manager({employee:'priya',manager:'maya'})).status,200);
  assert.equal((await call('/actions/get_goal',{token:t.evan,body:{id:'priya-1'}})).status,404);
  assert.equal((await call('/actions/create_goal',{token:t.evan,body:input})).status,404);
});
test('API validates origins, generated credentials, body sizes, logout and workspace expiry',async()=>{
  const {workspace:w,tokens:t}=await fixture();
  assert.equal((await call('/actions/list_goals',{body:{}})).status,401);
  assert.equal((await call('/login',{body:{workspace:w.workspace,email:'alex-r@example.test',password:'wrong'}})).status,401);
  assert.equal((await call('/actions/list_goals',{token:t.evan,body:{},origin:'https://evil.example'})).status,403);
  const allowed=await call('/actions/list_goals',{token:t.evan,body:{},origin:'https://www.joshcodes.ai',channel:'webmcp'});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'https://www.joshcodes.ai');
  assert.equal((await call('/actions/list_goals',{method:'OPTIONS',origin:'https://www.joshcodes.ai'})).status,204);
  assert.equal((await call('/actions/create_goal',{token:t.evan,body:{employee:'priya',title:'X',target:'Y',due:'2026-02-30',idempotencyKey:'invalid-date-001'}})).status,400);
  assert.equal((await call('/actions/list_goals',{token:t.evan,body:{query:'x'.repeat(17000)}})).status,413);
  assert((await call('/events',{token:t.evan})).data.some(e=>e.channel==='webmcp'));
  assert.equal((await call('/logout',{token:t.evan,body:{}})).status,200);
  assert.equal((await call('/me',{token:t.evan})).status,401);
  await env.DB.prepare('UPDATE sandboxes SET expires=0 WHERE id=?').bind(w.workspace).run();
  assert.equal((await call('/snapshot',{token:t.admin})).status,401);
});
test('a different sandbox cannot access a newly generated goal ID',async()=>{
  const a=await fixture(),b=await fixture();
  const g=await call('/actions/create_goal',{token:a.tokens.evan,body:{employee:'priya',title:'Isolated record',target:'Private to sandbox',due:'2027-01-01',idempotencyKey:'isolated-goal-001'}});
  assert.equal(g.status,200);
  assert.equal((await call('/goals/'+g.data.id,{token:b.tokens.admin})).status,404);
});
