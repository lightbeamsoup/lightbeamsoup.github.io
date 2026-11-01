import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStore } from './store.js';
import { createGoalsRouter } from './router.js';

function fixture(t,filename=':memory:') {
  const store=createStore(filename);t.after(()=>store.close());
  const workspace=store.createWorkspace();
  const actors=Object.fromEntries(workspace.accounts.map(p=>[p.id,store.authenticate(store.login(workspace.workspace,p.email,p.password).token)]));
  return {store,workspace,actors};
}
test('scope isolates employee, direct supervisor, reporting subtree, admin, and other sandboxes',t=>{
  const {store,actors:a}=fixture(t);
  assert.deepEqual(store.listEmployees(a['alex-r']).map(p=>p.id),['alex-r']);
  assert.deepEqual(new Set(store.listEmployees(a.evan).map(p=>p.id)),new Set(['evan','alex-r','priya']));
  assert.deepEqual(new Set(store.listEmployees(a.maya).map(p=>p.id)),new Set(['maya','evan','alex-r','priya']));
  assert.equal(store.listEmployees(a.admin).length,9);
  assert.throws(()=>store.goal(a.evan,'alex-c-1'),{status:404});
  assert.throws(()=>store.listGoals(a.evan,{employee:'alex-c'}),{status:404});
  const other=store.createWorkspace();
  const own=store.createGoal(a.evan,{employee:'priya',title:'Private goal',target:'One result',due:'2027-01-01'});
  const p=other.accounts.find(p=>p.id==='admin');
  assert.throws(()=>store.goal(store.authenticate(store.login(other.workspace,p.email,p.password).token),own.id),{status:404});
});
test('all writes enforce roles, versions, and transactional idempotency',t=>{
  const {store,actors:a}=fixture(t);
  const input={employee:'priya',title:'Ship documentation',target:'3 guides',due:'2027-01-01'};
  assert.throws(()=>store.createGoal(a['alex-r'],{...input,employee:'alex-r'}),{status:403});
  assert.throws(()=>store.createGoal(a.evan,{...input,employee:'alex-c'}),{status:404});
  const first=store.mutate(a.evan,'create-key-123','create_goal',input,()=>store.createGoal(a.evan,input));
  const replay=store.mutate(a.evan,'create-key-123','create_goal',input,()=>assert.fail('Replay performed mutation'));
  assert.deepEqual(first,replay);
  assert.equal(store.listGoals(a.evan).filter(g=>g.title===input.title).length,1);
  assert.throws(()=>store.mutate(a.evan,'create-key-123','create_goal',{...input,title:'Different'},()=>{}),{status:409});
  assert.throws(()=>store.updateProgress(a.evan,{id:'priya-1',progress:80,version:1,note:'Wrong actor'}),{status:403});
  const updated=store.updateProgress(a.priya,{id:'priya-1',progress:80,version:1,note:'Delivered two improvements'});
  assert.equal(updated.version,2);assert.equal(updated.notes.length,1);
  assert.throws(()=>store.updateProgress(a.priya,{id:'priya-1',progress:90,version:1,note:'Stale'}),{status:409});
  assert.throws(()=>store.addFeedback(a.priya,{id:'priya-1',version:2,note:'Self approval'}),{status:403});
  assert.equal(store.addFeedback(a.evan,{id:'priya-1',version:2,note:'Good progress'}).version,3);
});
test('hierarchy updates prevent cycles and immediately change existing session access',t=>{
  const {store,actors:a}=fixture(t);
  assert.throws(()=>store.setManager(a.evan,{employee:'priya',manager:'maya'}),{status:403});
  assert.throws(()=>store.setManager(a.admin,{employee:'maya',manager:'evan'}),{status:400});
  assert.throws(()=>store.setManager(a.admin,{employee:'priya',manager:'lena'}),{status:400});
  store.setManager(a.admin,{employee:'priya',manager:'maya'});
  assert.throws(()=>store.goal(a.evan,'priya-1'),{status:404});
  assert.equal(store.goal(a.maya,'priya-1').employee,'priya');
});
test('SQLite data persists across process-style reopen',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'goalroom-'));const filename=path.join(dir,'goals.sqlite');
  let store=createStore(filename);
  try {
    const w=store.createWorkspace();const p=w.accounts.find(p=>p.id==='alex-r');
    const session=store.login(w.workspace,p.email,p.password);const actor=store.authenticate(session.token);
    store.updateProgress(actor,{id:'alex-r-1',progress:85,version:1,note:'Persist me'});
    store.close();store=createStore(filename);
    assert.equal(store.goal(store.authenticate(session.token),'alex-r-1').progress,85);
    store.logout(session.token);assert.throws(()=>store.authenticate(session.token),{status:401});
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
test('HTTP contract rejects identity spoofing, cross-origin cookie writes, invalid values, expired sessions and scope leaks',async t=>{
  const {store,workspace,actors:a}=fixture(t);
  const app=express();app.use('/api',createGoalsRouter({store,secureCookies:false}).router);
  const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.once('listening',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const call=async(route,body,token,headers={})=>{
    const response=await fetch(origin+'/api'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
  };
  const account=workspace.accounts.find(p=>p.id==='evan');
  assert.equal((await call('/login',{workspace:workspace.workspace,email:account.email,password:'wrong'})).status,401);
  const login=await call('/login',{workspace:workspace.workspace,email:account.email,password:account.password});
  const token=login.data.token;const cookie=login.cookie.split(';')[0];
  assert.equal((await call('/login',{workspace:workspace.workspace,email:account.email,password:account.password},null,{Origin:'https://www.joshcodes.ai'})).status,200);
  const preflight=await fetch(origin+'/api/actions/list_goals',{method:'OPTIONS',headers:{Origin:'https://www.joshcodes.ai','Access-Control-Request-Headers':'authorization,content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://www.joshcodes.ai');
  assert.equal((await call('/actions/list_goals',{},token,{Origin:'https://www.joshcodes.ai'})).status,200);
  assert.equal((await call('/actions/list_goals',{},token,{Origin:'https://evil.example'})).status,403);
  assert.equal((await call('/actions/list_goals',{})).status,401);
  assert.equal((await call('/actions/list_goals',{role:'admin'},token)).status,400);
  assert.equal((await call('/actions/get_goal',{id:'alex-c-1'},token)).status,404);
  assert.equal((await call('/actions/create_goal',{employee:'priya',title:'X',target:'Y',due:'2026-02-30',idempotencyKey:'long-key-123'},token)).status,400);
  assert.equal((await call('/actions/list_goals',{},null,{Cookie:cookie,Origin:'https://evil.example'})).status,403);
  assert.equal((await call('/actions/list_goals',{},null,{Cookie:cookie})).status,403);
  const allowed=await call('/actions/list_goals',{},null,{Cookie:cookie,Origin:origin,'X-Goals-Channel':'webmcp'});
  assert.equal(allowed.status,200);assert.equal(allowed.data.length,6);
  assert.equal(store.events(a.evan)[0].channel,'webmcp');
  const assignment={employee:'priya',title:'API assignment',target:'One verified operation',due:'2027-01-10',idempotencyKey:'http-retry-create-001'};
  const created=await call('/actions/create_goal',assignment,token);
  assert.equal(created.status,200);
  assert.deepEqual((await call('/actions/create_goal',assignment,token)).data,created.data);
  assert.equal((await call('/goals/'+created.data.id,undefined,token)).data.title,'API assignment');
  assert.equal((await call('/actions/add_feedback',{id:created.data.id,version:1,note:'Supervisor API feedback',idempotencyKey:'http-feedback-001'},token)).status,200);
  const priya=workspace.accounts.find(p=>p.id==='priya');
  const priyaLogin=await call('/login',{workspace:workspace.workspace,email:priya.email,password:priya.password});
  const progress={id:created.data.id,version:2,progress:80,note:'Employee API update',idempotencyKey:'http-progress-001'};
  assert.equal((await call('/actions/update_progress',progress,priyaLogin.data.token)).data.progress,80);
  assert.equal((await call('/actions/update_progress',{...progress,progress:101,idempotencyKey:'bad-progress-001'},priyaLogin.data.token)).status,400);
  assert.equal((await call('/actions/update_progress',{...progress,idempotencyKey:'stale-progress-001'},priyaLogin.data.token)).status,409);
  store.setManager(a.admin,{employee:'priya',manager:'maya'});
  assert.equal((await call('/actions/get_goal',{id:'priya-1'},token)).status,404);
  assert.equal((await call('/actions/create_goal',assignment,token)).status,404);
  store.db.prepare('UPDATE sessions SET expires=0').run();
  assert.equal((await call('/me',undefined,token)).status,401);
});
