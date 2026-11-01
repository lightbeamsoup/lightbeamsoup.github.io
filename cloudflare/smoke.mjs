import assert from 'node:assert/strict';
const base='https://goalroom-api.joshcodes-ai.workers.dev/api/agent-lab/v1';
async function call(path,body,token){
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
}
const workspace=await call('/workspaces',{});assert.equal(workspace.status,201,JSON.stringify(workspace.data));
const tokens={};
for(const id of ['evan','alex-r']){
  const p=workspace.data.accounts.find(p=>p.id===id);
  const login=await call('/login',{workspace:workspace.data.workspace,email:p.email,password:p.password});
  assert.equal(login.status,200);tokens[id]=login.data.token;
}
assert.equal((await call('/actions/list_goals',{},tokens.evan)).data.length,6);
assert.equal((await call('/actions/get_goal',{id:'alex-c-1'},tokens.evan)).status,404);
const input={id:'alex-r-1',version:1,progress:80,note:'Hosted Cloudflare smoke test',idempotencyKey:crypto.randomUUID()};
const update=await call('/actions/update_progress',input,tokens['alex-r']);assert.equal(update.status,200,JSON.stringify(update.data));assert.equal(update.data.progress,80);
assert.deepEqual((await call('/actions/update_progress',input,tokens['alex-r'])).data,update.data);
assert.equal((await call('/goals/alex-r-1',undefined,tokens['alex-r'])).data.notes.length,1);
assert.equal((await call('/actions/update_progress',{...input,idempotencyKey:crypto.randomUUID()},tokens.evan)).status,403);
console.log('Hosted D1 smoke test passed: sign-in, hierarchy scope, denied access, progress update, retry deduplication, and readback.');
