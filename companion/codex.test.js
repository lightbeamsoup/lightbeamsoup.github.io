import test from 'node:test';
import assert from 'node:assert/strict';
import {executeTool,API} from './codex.js';
test('host rejects unknown tools, writes in read-only mode, and malformed inputs before network access',async()=>{
  const options={token:'synthetic',fetcher:()=>{throw new Error('Network must not be reached.');}};
  await assert.rejects(executeTool('exec_command',{},options),/Unknown/);
  await assert.rejects(executeTool('update_progress',{},options),/disabled/);
  await assert.rejects(executeTool('get_goal',{id:'x',url:'https://example.com'},options),/Unknown field/);
  await assert.rejects(executeTool('get_goal',{},options),/Missing/);
});
test('host forwards only to the fixed API, keeps bearer out of model output, and preserves denied status',async()=>{
  const result=await executeTool('get_goal',{id:'alex-c-1'},{token:'synthetic-secret',fetcher:async(url,options)=>{
    assert.equal(url,API+'/actions/get_goal');assert.equal(options.headers.Authorization,'Bearer synthetic-secret');
    assert.equal(options.body,'{"id":"alex-c-1"}');
    return new Response(JSON.stringify({error:'Goal not found.'}),{status:404});
  }});
  assert.equal(result.status,404);assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
});
