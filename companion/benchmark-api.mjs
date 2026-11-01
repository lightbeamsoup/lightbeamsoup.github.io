import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {API,executeTool} from './codex.js';
async function post(path,body){const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const workspace=await post('/workspaces',{});
const account=workspace.accounts.find(a=>a.id==='alex-r');
const session=await post('/login',{workspace:workspace.workspace,email:account.email,password:account.password});
const options={token:session.token,allowWrites:true};
const start=performance.now();
const before=await executeTool('get_goal',{id:'alex-r-1'},options);assert.equal(before.data.progress,60);assert.equal(before.data.version,1);
const write=await executeTool('update_progress',{id:'alex-r-1',version:before.data.version,progress:80,note:'Transport benchmark: release checks complete',idempotencyKey:crypto.randomUUID()},options);assert.equal(write.status,200);
const after=await executeTool('get_goal',{id:'alex-r-1'},options);
const elapsedMs=Math.round(performance.now()-start);
assert.equal(after.data.progress,80);assert.equal(after.data.version,2);assert.equal(after.data.notes.length,1);
const result={mode:'direct-api',elapsedMs,actionCalls:3,snapshotCalls:0,success:true};
const file=new URL('../agent-lab/benchmarks.json',import.meta.url),report=JSON.parse(await readFile(file));report.transport=[result];await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify(result));
