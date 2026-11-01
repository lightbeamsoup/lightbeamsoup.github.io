export function setupAskAI({getSession,refresh}){
  const $=s=>document.querySelector(s);
  const local=location.hostname==='127.0.0.1';
  const params=new URLSearchParams(location.hash.slice(1));
  if(local&&params.has('pair')){sessionStorage.setItem('goalroom.pair',params.get('pair'));history.replaceState(null,'',location.pathname+location.search);}
  const pairing=()=>sessionStorage.getItem('goalroom.pair');
  $('#ai-local-info').hidden=!local;$('#ai-setup').hidden=local&&!!pairing();
  $('#ai-form').hidden=!local||!pairing();
  let running=false;
  $('#ai-cancel').onclick=async()=>{await fetch('/companion/cancel',{method:'POST',headers:{Authorization:`Bearer ${pairing()}`}});};
  $('#ai-form').onsubmit=async e=>{
    e.preventDefault();if(running)return;
    const session=getSession();if(!session){$('#ai-output').textContent='Sign in to a synthetic tracker account first.';return;}
    running=true;$('#ai-submit').disabled=true;$('#ai-cancel').hidden=false;$('#ai-output').textContent='Connecting to your local Codex…';$('#ai-log').textContent='';
    try{
      const response=await fetch('/companion/run',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${pairing()}`},body:JSON.stringify({prompt:$('#ai-prompt').value,token:session.token,allowWrites:$('#ai-writes').checked})});
      if(!response.ok)throw new Error((await response.json()).error);
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      while(true){const {done,value}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
        let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line)continue;const event=JSON.parse(line);
          if(event.type==='started')$('#ai-output').textContent=`Working with ${event.model}…`;
          if(event.type==='tool')$('#ai-log').textContent+=`${event.name} · ${event.status} · ${event.elapsedMs} ms\n`;
          if(event.type==='answer')$('#ai-output').textContent=event.text;
          if(event.type==='error')throw new Error(event.error);
          if(event.type==='done'){$('#ai-output').textContent=event.result.text;$('#ai-log').textContent+=`\n${event.result.model} · ${(event.result.elapsedMs/1000).toFixed(1)} s · ${event.result.toolCalls.length} tool calls`;}
        }if(done)break;
      }
    }catch(error){$('#ai-output').textContent=error.message;}
    finally{running=false;$('#ai-submit').disabled=false;$('#ai-cancel').hidden=true;await refresh().catch(()=>{});}
  };
  fetch('benchmarks.json').then(r=>r.ok?r.json():null).then(data=>{
    if(!data)return;
    const root=$('#benchmark-results');root.replaceChildren();
    const add=(tag,text,parent=root)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
    add('p',`Measured ${new Date(data.measuredAt).toLocaleDateString()}`).className='fine';
    const table=(title,headers,rows)=>{add('h3',title);const t=add('table',''),head=add('thead','',t),hr=add('tr','',head),body=add('tbody','',t);headers.forEach(h=>add('th',h,hr));rows.forEach(row=>{const tr=add('tr','',body);row.forEach(v=>add('td',v,tr));});};
    table('Ask AI · reasoning included',['Scenario','Time','Calls','Result'],data.runs.map(r=>[r.scenario,`${(r.elapsedMs/1000).toFixed(2)} s`,String(r.toolCalls.length),r.success?'Pass':'Fail']));
    add('p',`${data.runs[0]?.model||'Codex'} · low reasoning effort`).className='fine';
    table('Read, update, verify · reasoning excluded',['Interface','Time','Result'],(data.transport||[]).map(r=>[{'direct-api':'Direct API',browser:'Browser','native-webmcp':'Native WebMCP'}[r.mode]||r.mode,`${(r.elapsedMs/1000).toFixed(2)} s`,r.success?'Pass':'Fail']));
    add('p','Single runs. Login excluded. UI paths include local proxy and page refreshes; native WebMCP includes bridge overhead. Initial measurements, not general speed guarantees.').className='fine';
  }).catch(()=>{});
}
