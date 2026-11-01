import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';

test('loopback service enforces pairing, origin, host and bounded API routes',async()=>{
  const port=3491,base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['companion/server.js'],{env:{...process.env,GOALROOM_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stderr.resume();
  try{
    const pairing=await new Promise((resolve,reject)=>{
      let text='';const timer=setTimeout(()=>reject(new Error('Companion did not start.')),5000);
      child.on('error',reject);child.stdout.on('data',chunk=>{text+=chunk;const match=text.match(/#pair=([a-f0-9]{64})/);if(match){clearTimeout(timer);resolve(match[1]);}});
    });
    assert.equal((await fetch(base+'/companion/status')).status,401);
    assert.equal((await fetch(base+'/companion/status',{headers:{Authorization:'Bearer wrong'}})).status,401);
    assert.equal((await fetch(base+'/companion/status',{headers:{Authorization:`Bearer ${pairing}`,Origin:'https://evil.example'}})).status,403);
    const headers={Authorization:`Bearer ${pairing}`};
    assert.deepEqual(await (await fetch(base+'/companion/status',{headers})).json(),{ready:true,busy:false});
    assert.equal((await fetch(base+'/companion/run',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,400);
    assert.equal((await fetch(base+'/api/agent-lab/v1/arbitrary/path')).status,404);
    assert.equal((await fetch(base+'/.env')).status,401);
    const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(base+'/companion/status',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
    assert.equal(hostStatus,403);
    const page=await fetch(base+'/agent-lab/');assert.equal(page.status,200);assert.match(await page.text(),/id="ai-form"/);
  }finally{const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}
});
