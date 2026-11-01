import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {askCodex,API} from './codex.js';

async function call(path,body,token){
  const response=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;
}
const workspace=await call('/workspaces',{});
const cases=[
  {role:'alex-r',name:'Employee progress update',writes:true,prompt:'Set my release reliability goal to 80 percent and add the note "Benchmark: release checks complete". Verify the saved progress and note before reporting success.',verify:s=>{const g=s.goals.find(g=>g.id==='alex-r-1');assert.equal(g.progress,80);assert.equal(g.version,2);assert.equal(g.notes.length,1);assert.ok(g.notes.some(n=>n.text==='Benchmark: release checks complete'));}},
  {role:'evan',name:'Supervisor assignment and feedback',writes:true,prompt:'Assign Priya Shah a goal titled "Benchmark training" with target "Complete 3 modules" due 2026-12-15. Then add feedback "Benchmark: keep the release checklist current" to her release reliability goal. Verify both changes before reporting success.',verify:s=>{assert.equal(s.goals.length,7);assert.equal(s.goals.find(g=>g.id==='priya-1').version,2);assert.equal(s.goals.find(g=>g.id==='priya-1').notes.length,1);assert.equal(s.goals.filter(g=>g.title==='Benchmark training'&&g.employee==='priya').length,1);assert.ok(s.goals.find(g=>g.id==='priya-1').notes.some(n=>n.text==='Benchmark: keep the release checklist current'));}},
  {role:'maya',name:'Department scope and permission boundary',writes:false,prompt:'List overdue goals in my reporting subtree and count them. Then try to read goal alex-c-1 to check the permission boundary. Report the count and whether access to that goal was denied. Do not change anything.',verify:(s,r)=>{assert.equal(s.goals.filter(g=>g.status==='overdue').length,4);assert.ok(r.toolCalls.some(t=>t.name==='get_goal'&&t.input.id==='alex-c-1'&&t.status===404));assert.ok(r.toolCalls.every(t=>['get_identity','list_employees','list_goals','get_goal'].includes(t.name)));}}
];
const results=[];
for(const c of cases){
  const account=workspace.accounts.find(p=>p.id===c.role);
  const session=await call('/login',{workspace:workspace.workspace,email:account.email,password:account.password});
  console.log('Starting:',c.name);
  const result=await askCodex({prompt:c.prompt,token:session.token,allowWrites:c.writes,onEvent:e=>{if(e.type==='tool')console.log(e.name,e.status,e.elapsedMs);if(e.type==='started')console.log('Model:',e.model);}});
  const snapshot=await call('/snapshot',undefined,session.token);let success=true,error;
  try{c.verify(snapshot,result);}catch(e){success=false;error=e.message;}
  results.push({scenario:c.name,role:c.role,success,...(error?{error}:{}),...result});
  if(!success)process.exitCode=1;
  await writeFile(new URL('../agent-lab/benchmarks.json',import.meta.url),JSON.stringify({measuredAt:new Date().toISOString(),methodology:'Single real Codex run per scenario, low reasoning effort; hosted Cloudflare/D1; one synthetic sandbox with independent employee/supervisor changes. Elapsed time includes app-server startup, model reasoning, tool and network latency. Success checked independently via snapshot. Not a statistical latency estimate. No browser/WebMCP speedup inferred.',runs:results},null,2));
  console.log(success?'PASS':'FAIL',c.name,result.elapsedMs,result.toolCalls.length,result.text);
}
