import { tools } from './contracts.js';
import { apiOrigin } from './config.js';
const $=selector=>document.querySelector(selector);
const base=apiOrigin+'/api/agent-lab/v1';
$('#openapi-link').href=base+'/openapi.json';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const load=(key,fallback)=>{try{return JSON.parse(sessionStorage.getItem(key))??fallback;}catch{return fallback;}};
let credentials=load('goalroom.credentials',null);
let session=load('goalroom.session',null);
if(session?.expires<Date.now()){session=null;sessionStorage.removeItem('goalroom.session');}
let runs=load('goalroom.runs',[]);
let state=null, selectedGoal=null, filteredGoals=null, registration=null, timerStart=null, runStartEvents=[];
const save=(key,value)=>sessionStorage.setItem(key,JSON.stringify(value));
function message(text,error=false){$('#message').hidden=!text;$('#message').textContent=text;$('#message').classList.toggle('error',error);}
async function request(path,{method='GET',body,channel='browser'}={}){
  const start=performance.now();
  let response;
  try{response=await fetch(base+path,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...(session?{Authorization:`Bearer ${session.token}`}:{ }),'X-Goals-Channel':channel},...(body?{body:JSON.stringify(body)}:{})});}
  catch{throw new Error('The tracker API is not reachable yet. The separate backend must be connected at '+(apiOrigin||location.origin)+'.');}
  if(!response.headers.get('content-type')?.includes('application/json')){
    const error=new Error('The tracker API returned an unexpected response. Please try again shortly.');error.status=503;throw error;
  }
  const result=await response.json();
  if(!response.ok){const error=new Error(result.error||'Request failed.');error.status=response.status;throw error;}
  window.dispatchEvent(new CustomEvent('goalroom:request',{detail:{path,channel,status:response.status,roundTripMs:performance.now()-start}}));
  return result;
}
async function action(name,input={},channel='browser'){
  const result=await request(`/actions/${name}`,{method:'POST',body:input,channel});
  await refresh();
  return result;
}
function names(id){return state?.employees.find(p=>p.id===id)?.name||id;}
const initials=name=>name.split(' ').map(s=>s[0]).slice(0,2).join('');
const options=people=>people.map(p=>`<option value="${escape(p.id)}">${escape(p.name)} · ${escape(p.id)}</option>`).join('');
function fillCredentials(){
  $('#account').innerHTML='<option value="">Enter credentials manually</option>'+(credentials?.accounts||[]).map(p=>`<option value="${escape(p.id)}">${escape(p.name)} · ${escape(p.role)}</option>`).join('');
  $('#workspace').value=credentials?.workspace||'';
  $('#credentials-list').innerHTML=(credentials?.accounts||[]).map(p=>`<div class="credentials-row"><b>${escape(p.name)}</b> · ${escape(p.role)}<br>${escape(p.email)}<br><code>${escape(p.password)}</code></div>`).join('')||'<p>No locally saved credentials. Use the copy from sandbox creation.</p>';
}
function showTab(name){
  for(const tab of ['goals','people','compare']){$(`#tab-${tab}`).hidden=tab!==name;document.querySelector(`[data-tab="${tab}"]`).classList.toggle('active',tab===name);}
  const labels={goals:['Goals overview','A shared direction, with room for individual growth.'],people:['People & hierarchy','The right access, grounded in reporting relationships.'],compare:['Agent playground','Compare the journey. Keep the destination the same.']};
  $('#page-title').textContent=labels[name][0];$('#page-description').textContent=labels[name][1];
  $('#new-goal').hidden=!state||name!=='goals'||!state.employees.some(p=>p.canManage);
}
function renderGoals(goals){
  $('#goals-grid').innerHTML=goals.map(g=>`<button class="goal-card" data-goal="${escape(g.id)}"><div class="card-top"><span class="person"><span class="avatar">${escape(initials(names(g.employee)))}</span>${escape(names(g.employee))}</span><span class="status ${escape(g.status)}">${escape(g.status.replace('_',' '))}</span></div><h3>${escape(g.title)}</h3><p>${escape(g.target)}</p><div><div class="progress-label"><span>PROGRESS</span><span>${g.progress}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${g.progress}%"></div></div></div><div class="card-bottom"><span>Due ${escape(g.due)}</span><span>View goal ↗</span></div></button>`).join('')||'<div class="empty">No goals match this view.</div>';
}
function renderEvents(){
  $('#events').innerHTML=state.events.map(e=>`<tr><td>${escape(new Date(e.created).toLocaleTimeString())}</td><td>${escape(e.channel)}</td><td>${escape(e.action)}</td><td>${e.status}</td><td>${e.ms.toFixed(1)} ms</td></tr>`).join('')||'<tr><td colspan="5">Action requests will appear here.</td></tr>';
  $('#channel-stats').innerHTML=['browser','webmcp','api'].map(channel=>{const items=state.events.filter(e=>e.channel===channel);return `<span><b>${channel}</b> &nbsp; ${items.length} requests · ${items.reduce((a,e)=>a+e.ms,0).toFixed(1)} ms server</span>`;}).join('');
}
function render(){
  $('#auth').hidden=!!state;$('#workspace-view').hidden=!state;$('#signout').hidden=!state;
  if(!state){$('#identity-label').textContent='Not signed in';$('#new-goal').hidden=true;return;}
  const identity=state.identity;
  $('#identity-label').textContent=`${identity.name} · ${identity.role}`;
  $('#stat-total').textContent=state.goals.length;$('#stat-complete').textContent=state.goals.filter(g=>g.status==='complete').length;$('#stat-overdue').textContent=state.goals.filter(g=>g.status==='overdue').length;
  $('#stat-role').textContent=identity.role==='head'?'Department head':identity.role;
  $('#scope-description').textContent={admin:'All sandbox employees',head:'Your reporting subtree',supervisor:'You and your direct reports',employee:'Your own goals'}[identity.role];
  $('#visible-people').textContent=`${state.employees.length} ${state.employees.length===1?'person':'people'} in scope`;
  const prior=$('#employee-filter').value;
  $('#employee-filter').innerHTML='<option value="">All visible employees</option>'+options(state.employees);$('#employee-filter').value=prior;
  $('#assign-employee').innerHTML=options(state.employees.filter(p=>p.canManage));
  const filters=Object.fromEntries(new FormData($('#filters')));
  const visible=filteredGoals??state.goals.filter(g=>(!filters.employee||g.employee===filters.employee)&&(!filters.status||g.status===filters.status)&&(!filters.query||g.title.toLowerCase().includes(filters.query.toLowerCase())));
  renderGoals(visible);
  $('#people-list').innerHTML=state.employees.map(p=>`<div class="person-row"><span class="person"><span class="avatar">${escape(initials(p.name))}</span><span><b>${escape(p.name)}</b><small>${escape(p.id)} · ${escape(p.department)}</small></span></span><span class="status">${escape(p.role)}</span><span>Reports to ${escape(p.manager?names(p.manager):'—')}</span></div>`).join('');
  $('#manager-form').hidden=identity.role!=='admin';$('#manager-employee').innerHTML=options(state.employees.filter(p=>p.role!=='admin'));$('#manager-target').innerHTML='<option value="">No manager</option>'+options(state.employees.filter(p=>['head','supervisor'].includes(p.role)));
  $('#api-example').textContent=`POST ${apiOrigin||location.origin}/api/agent-lab/v1/login\nContent-Type: application/json\n\n{"workspace":"${identity.workspace}",\n "email":"${identity.email}",\n "password":"YOUR_TEST_PASSWORD"}\n\nPOST ${base}/actions/list_goals\nAuthorization: Bearer YOUR_TOKEN\nContent-Type: application/json\n\n{"status":"overdue"}`;
  renderEvents();
  $('#new-goal').hidden=!$('#tab-goals').hidden? !state.employees.some(p=>p.canManage):true;
}
async function refresh(){state=await request('/snapshot');filteredGoals=null;render();}
async function registerTools(){
  registration?.abort();registration=null;
  const registry=document.modelContext||navigator.modelContext;
  if(!registry?.registerTool){$('#webmcp-status').textContent='WebMCP is not available in this browser. Browser navigation and direct API remain available.';return;}
  if(!state){$('#webmcp-status').textContent='WebMCP detected. Sign in to enable tools.';return;}
  registration=new AbortController();
  try{
    for(const tool of tools) await registry.registerTool({name:tool.name,description:tool.description,inputSchema:tool.inputSchema,
      annotations:{readOnlyHint:!!tool.readOnly},
      execute:async input=>{
        try{const result=await action(tool.name,input,'webmcp');if(selectedGoal && state.goals.some(g=>g.id===selectedGoal.id))renderDetail(state.goals.find(g=>g.id===selectedGoal.id));return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:{result}};}
        catch(error){message(error.message,true);return {isError:true,content:[{type:'text',text:error.message}]};}
      }
    },{signal:registration.signal});
    $('#webmcp-status').textContent=`${tools.length} tools registered for ${state.identity.name}. Every call is checked by the server.`;
  }catch(error){registration.abort();$('#webmcp-status').textContent=`Tool registration unavailable: ${error.message}`;}
}
function renderDetail(g){
  selectedGoal=g;
  $('#goal-detail').innerHTML=`<div class="dialog-heading"><div><p class="eyebrow">${escape(names(g.employee))} · VERSION ${g.version}</p><h2>${escape(g.title)}</h2></div><button data-close="detail-dialog" aria-label="Close">×</button></div><p class="detail-target">${escape(g.target)}</p><p class="fine">Due ${escape(g.due)} · ${g.progress}% complete · ID <code>${escape(g.id)}</code></p><h3>Updates & feedback</h3>${g.notes.map(n=>`<div class="note"><small>${escape(names(n.author))} · ${escape(n.kind)} · ${escape(new Date(n.created).toLocaleString())}</small>${escape(n.text)}</div>`).join('')||'<p class="muted">A fresh start. No updates yet.</p>'}${g.canUpdate?'<form id="progress-form"><h3>Add your progress</h3><label>Progress (%)<input name="progress" type="number" min="0" max="100" step="1" required value="'+g.progress+'"></label><label>Progress note<textarea name="note" maxlength="2000" required></textarea></label><p class="dialog-error" role="alert"></p><button class="primary">Save progress</button></form>':''}${g.canManage?'<form id="feedback-form"><h3>Supervisor feedback</h3><label>Feedback<textarea name="note" maxlength="2000" required></textarea></label><p class="dialog-error" role="alert"></p><button class="primary">Add feedback</button></form>':''}${!g.canManage&&!g.canUpdate?'<p class="fine">You can read this goal.</p>':''}`;
}
async function busy(button,fn){button.disabled=true;try{await fn();}catch(e){message(e.message,true);}finally{button.disabled=button.id==='stop-timer'&&!timerStart;}}
$('#create-sandbox').onclick=e=>busy(e.currentTarget,async()=>{
  credentials=await request('/workspaces',{method:'POST',body:{}});save('goalroom.credentials',credentials);fillCredentials();$('#account').value='maya';$('#account').dispatchEvent(new Event('change'));message('Your sandbox is ready. Sign in with a generated test account.');
});
$('#account').onchange=()=>{const p=credentials?.accounts.find(p=>p.id===$('#account').value);if(p){$('#workspace').value=credentials.workspace;$('#email').value=p.email;$('#password').value=p.password;}};
$('#login-form').onsubmit=e=>{e.preventDefault();busy(e.submitter,async()=>{const body=Object.fromEntries(new FormData(e.currentTarget));session=await request('/login',{method:'POST',body});save('goalroom.session',session);await refresh();await registerTools();showTab('goals');message('Signed in. Your visible records follow your hierarchy permissions.');});};
$('#signout').onclick=e=>busy(e.currentTarget,async()=>{await request('/logout',{method:'POST',body:{}});session=null;sessionStorage.removeItem('goalroom.session');registration?.abort();state=null;timerStart=null;$('#start-timer').disabled=false;$('#stop-timer').disabled=true;render();await registerTools();message('Signed out. Select another test account to compare permissions.');});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(state)showTab(b.dataset.tab);});
$('#filters').onsubmit=async e=>{e.preventDefault();await busy(e.submitter,async()=>{const filters=Object.fromEntries([...new FormData($('#filters'))].filter(([,v])=>v));filteredGoals=await action('list_goals',filters);renderGoals(filteredGoals);});};
document.addEventListener('click',async e=>{
  const close=e.target.closest('[data-close]');if(close)$(`#${close.dataset.close}`).close();
  const card=e.target.closest('[data-goal]');if(card)await busy(card,async()=>{const g=await action('get_goal',{id:card.dataset.goal});renderDetail(g);$('#detail-dialog').showModal();});
});
$('#new-goal').onclick=()=>{$('#goal-form').reset();$('#goal-form .dialog-error').textContent='';$('#goal-dialog').showModal();};
$('#goal-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;const body={...Object.fromEntries(new FormData(form)),idempotencyKey:crypto.randomUUID()};e.submitter.disabled=true;try{await action('create_goal',body);$('#goal-dialog').close();message('Goal assigned.');}catch(error){form.querySelector('.dialog-error').textContent=error.message;}finally{e.submitter.disabled=false;}};
document.addEventListener('submit',async e=>{
  if(!['progress-form','feedback-form'].includes(e.target.id))return;
  e.preventDefault();const form=e.target;const button=e.submitter;button.disabled=true;
  const body={...Object.fromEntries(new FormData(form)),id:selectedGoal.id,version:selectedGoal.version,idempotencyKey:crypto.randomUUID()};if(form.id==='progress-form')body.progress=Number(body.progress);
  try{const g=await action(form.id==='progress-form'?'update_progress':'add_feedback',body);renderDetail(g);message('Goal updated.');}catch(error){form.querySelector('.dialog-error').textContent=error.message;if(error.status===409)message('The goal changed. Close and reopen it to load the current version.',true);}finally{button.disabled=false;}
});
$('#manager-form').onsubmit=e=>{e.preventDefault();const input=Object.fromEntries(new FormData(e.currentTarget));busy(e.submitter,async()=>{await action('set_manager',{...input,idempotencyKey:crypto.randomUUID()});message('Reporting relationship updated.');});};
$('#refresh-events').onclick=e=>busy(e.currentTarget,refresh);
$('#start-timer').onclick=()=>{timerStart=Date.now();runStartEvents=state.events.map(e=>JSON.stringify(e));$('#start-timer').disabled=true;$('#stop-timer').disabled=false;$('#run-summary').textContent='Run in progress. Complete the scenario, then finish the run.';};
$('#stop-timer').onclick=e=>busy(e.currentTarget,async()=>{await refresh();const elapsedMs=Date.now()-timerStart;const events=state.events.filter(e=>!runStartEvents.includes(JSON.stringify(e)));const result={label:$('#run-label').value||'Untitled run',identity:state.identity.id,role:state.identity.role,workspace:state.identity.workspace,elapsedMs,requests:events.length,serverMs:events.reduce((sum,e)=>sum+e.ms,0),events,completedAt:new Date().toISOString(),success:'not automatically evaluated'};runs.push(result);save('goalroom.runs',runs);timerStart=null;$('#start-timer').disabled=false;$('#stop-timer').disabled=true;$('#run-summary').textContent=`Saved: ${(elapsedMs/1000).toFixed(1)}s elapsed · ${events.length} action requests · ${result.serverMs.toFixed(1)}ms server. Task success is not automatically evaluated.`;});
setInterval(()=>{if(timerStart)$('#timer').textContent=`${((Date.now()-timerStart)/1000).toFixed(1)}s`;},100);
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export-results').onclick=()=>download('goalroom-comparisons.json',{runs,latestEvents:state.events,measurement:'Server action endpoints only. Channels are client supplied. Runs are manually timed; success is not automatically evaluated.'});
$('#download-credentials').onclick=()=>{if(credentials)download('goalroom-test-credentials.json',credentials);else message('Credentials are only available in the browser that created this sandbox.',true);};
fillCredentials();
try{await refresh();showTab('goals');}catch(error){state=null;render();if(error.status!==401)message(error.message,true);}
await registerTools();
window.addEventListener('pagehide',()=>registration?.abort());
