import {setupChat} from './chat.js';
import {setupStock} from './stock-controls.js';
import {setupHistory} from './history-view.js';
import {bottlePhotoUrl,findBottlePhoto} from './bottle-photos.js';

const $ = id => document.getElementById(id);
const hostedOnPages = ['https://www.joshcodes.ai','https://joshcodes.ai'].includes(location.origin);
const api = new URL('/api/',hostedOnPages ? 'https://wine-rack.joshcodes-ai.workers.dev' : location.origin);
function requestApi(path,options) {
  return fetch(new URL(path,api),{...options,credentials:'include',redirect:'error'});
}
let wines = [], visible = [], synced = '', loadNumber = 0;
let sessionActive = false, sessionGeneration = 0;
const filters = {location:'Location',color:'Color',type:'Type',grape:'Varietal',year:'Vintage'};
const controls = {};
const availability=document.createElement('select');

function el(tag,text,style) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (style) node.className = style;
  return node;
}
function bottle(producer,year,tone='') {
  const shape = el('span',null,'bottle ' + tone);
  shape.setAttribute('aria-hidden','true');
  const label = el('span',null,'paper');
  label.append(el('b',producer),el('small',year));
  shape.append(el('span',null,'neck'),el('span',null,'glass'),el('span',null,'foil'),label);
  return shape;
}
$('still-life').append(bottle('Rouge','VIN ROUGE'),bottle('Réserve','CUVÉE','gold'),bottle('Rosé','VIN ROSÉ','rose'));

function tone(wine) {
  if (wine.color === 'Rosé') return 'rose';
  if (wine.color === 'White') return 'white';
  return /dessert|fortified/i.test(wine.type) ? 'gold' : '';
}
const stockLabel=el('label','Stock');
availability.append(new Option('On hand','on'),new Option('Out of stock','out'));
availability.onchange=()=>{fillFilters();renderRack();};
stockLabel.append(availability);$('filters').append(stockLabel);
function availableWines(){return wines.filter(w=>availability.value==='out'?w.quantity===0:w.quantity>0);}
for (const [key,label] of Object.entries(filters)) {
  const wrapper = el('label',label);
  controls[key] = el('select');
  controls[key].onchange = renderRack;
  wrapper.append(controls[key]);
  $('filters').append(wrapper);
}

function fillFilters() {
  for (const [key,select] of Object.entries(controls)) {
    const old = select.value;
    const values = [...new Set(availableWines().map(w => w[key] || 'Unspecified'))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if (key === 'year') values.reverse();
    select.replaceChildren(new Option('All',''),...values.map(v=>new Option(v,v)));
    if (values.includes(old)) select.value=old;
  }
}
const sum = items => items.reduce((n,w) => n + w.quantity,0);
const count = (n,word) => n+' '+word+(n===1?'':'s');
function renderRack() {
  const search = $('search').value.trim().toLocaleLowerCase();
  const onHand=wines.filter(w => w.quantity>0);
  visible = availableWines().filter(w => Object.entries(controls).every(([k,c])=>!c.value || (w[k] || 'Unspecified')===c.value)
    && [w.producer,w.name,w.year,w.type,w.grape,w.region,w.country,w.appellation,w.location,w.shelf].join(' ').toLocaleLowerCase().includes(search));
  $('summary').textContent=count(sum(onHand),'bottle')+' on hand · '+count(onHand.length,'wine');
  $('result').textContent=(availability.value==='out'?count(visible.length,'out-of-stock wine'):count(sum(visible),'bottle'))+' shown';
  const rack=$('rack');
  rack.replaceChildren();
  const groups=new Map();
  for (const wine of visible) {
    const location=wine.location || 'Unspecified location';
    if (!groups.has(location)) groups.set(location,[]);
    groups.get(location).push(wine);
  }
  for (const [location,items] of [...groups].sort(([a],[b])=>a.localeCompare(b))) {
    const shelf=el('section',null,'shelf'), heading=el('h2',location), slots=el('div',null,'slots');
    heading.append(el('small',count(sum(items),'bottle')));
    for (const w of items) {
      const slot=el('button',null,'slot'), stage=el('span',null,'stage');
      const illustration = bottle(w.producer || 'Unknown winery', w.year || '—',tone(w));
      stage.append(illustration);
      const photo = findBottlePhoto(w);
      if (photo) {
        const image = el('img',null,'bottle-photo');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('load',()=>{
          illustration.hidden=true;
          image.classList.add('loaded');
        },{once:true});
        image.addEventListener('error',()=>image.remove(),{once:true});
        image.src = bottlePhotoUrl(photo);
        stage.append(image);
      }
      slot.setAttribute('aria-label',[w.producer,w.name,w.year,count(w.quantity,'bottle')].filter(Boolean).join(', '));
      slot.append(stage,el('strong',w.name || w.producer || w.id),el('span',[w.type,w.year,count(w.quantity,'bottle')].filter(Boolean).join(' · '),'caption'));
      slot.onclick=()=>showWine(w);
      slots.append(slot);
    }
    shelf.append(heading,slots);rack.append(shelf);
  }
  if (!visible.length) rack.append(el('p',onHand.length?'No bottles match these filters.':'There are no bottles on hand in the inventory.','empty'));
}
function showWine(w) {
  const content=$('detail-content'),facts=el('dl',null,'facts');
  content.replaceChildren(el('p',w.producer || 'Unknown winery','kicker'),el('h2',[w.name,w.year].filter(Boolean).join(' ') || w.id),el('p',[w.type,w.grape,w.appellation,w.region,w.country].filter(Boolean).join(' · ')));
  const photo = findBottlePhoto(w);
  if (photo) {
    const credit = el('p',null,'photo-credit');
    const vintage = photo.vintage && photo.vintage !== String(w.year ?? '').trim().toUpperCase()
      ? ` (${photo.vintage === 'NV' ? 'non-vintage release' : photo.vintage + ' vintage'})` : '';
    const source = el('a',`Bottle photo${vintage}`);
    source.href = photo.source;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    credit.append(source);
    content.append(credit);
  }
  const fields={'On hand':w.quantity,'Pending pickup':w.pending,'Storage':[w.location,w.shelf].filter(Boolean).join(' · '),'Bottle size':w.size,'Average purchase price':w.price || 'Unrecorded','Acquisition cost':w.cost || 'Unrecorded','Value per bottle':w.value,'Drink from':w.from,'Peak year':w.peak,'Drink by':w.until,'Personal rating':w.rating,'Buy again':w.rebuy};
  for (const [label,value] of Object.entries(fields)) if (value || value===0) {
    const pair=el('div');pair.append(el('dt',label,'field-name'),el('dd',value));facts.append(pair);
  }
  content.append(facts,stock.controls(w,()=>{if($('details').open)$('details').close();}),el('h3','Notes'),el('p',w.notes || 'No personal notes recorded.','note'));
  for (const t of w.tastings) content.append(el('h3',t['Date Opened'] || 'Tasting'),el('p',Object.entries(t).filter(([k])=>k!=='Date Opened').map(([k,v])=>k+' · '+v).join('\n') || 'No tasting notes recorded.'));
  if (w.source) content.append(el('h3','Inventory notes'),el('p',w.source));
  const ask=el('button','Ask about this wine');ask.style.marginTop='1rem';
  ask.onclick=()=>{$('details').close();chat.open(w);};content.append(ask);
  $('details').showModal();
}
const stock=setupStock({el,requestApi,session:()=>sessionActive ? sessionGeneration : null,onExpired:()=>lock('Enter the cellar password to continue.'),onSaved:async()=>{
  await load();
  if(!$('collection').hidden)$('update').textContent='Bottle change saved. '+$('update').textContent;
}});
const chat=setupChat({getData:()=>({wines,visibleIds:visible.map(w=>w.id)}),el,stock});
const historyView=setupHistory({el,$});
const showingHistory=()=>location.hash==='#history';
const refreshButton=() => $(showingHistory() ? 'history-refresh' : 'refresh');
const statusLine=() => $(showingHistory() ? 'history-status' : 'update');
let historySynced='';
function showPage() {
  const history=showingHistory();
  if (!sessionActive) document.querySelector('#welcome .lead').textContent = history
    ? 'Enter the cellar password to view transactions and tasting notes.'
    : 'Open your cellar to explore bottles by winery, vintage, and where you keep them.';
  $('welcome').hidden=sessionActive;
  $('collection').hidden=!sessionActive || history;
  $('history-page').hidden=!sessionActive || !history;
  $('cellar-nav').hidden=$('account').hidden=!sessionActive;
  document.title=history ? 'Cellar history · Wine Rack' : 'Wine Rack · joshcodes';
  for (const link of $('cellar-nav').querySelectorAll('a')) {
    if (link.hash===(history?'#history':'#rack')) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange',()=>{showPage();void load(!sessionActive);});
$('ask').onclick=()=>chat.open();
$('search').oninput=renderRack;
$('clear').onclick=()=>{availability.value='on';fillFilters();for (const c of Object.values(controls)) c.value='';$('search').value='';renderRack();};
for (const d of document.querySelectorAll('dialog')) d.querySelector('.close').onclick=()=>d.close();
function lock(message='') {
  sessionActive=false;sessionGeneration++;wines=[];visible=[];loadNumber++;
  availability.value='on';stock.clear();
  chat.clear();$('details').close();$('detail-content').replaceChildren();$('rack').replaceChildren();
  $('search').value='';fillFilters();historyView.clear();synced='';historySynced='';showPage();
  $('password').value='';$('login-message').textContent=message;
}
async function postSession(path,body) {
  return requestApi(path,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
}
$('account').onclick=async()=>{
  $('account').disabled=true;
  try {
    const response=await postSession('logout',{});
    if (!response.ok) throw Error();
    lock('Signed out.');
  } catch {
    const message='Could not sign out. Check your connection and try again.';
    statusLine().textContent=message;$('login-message').textContent=message;
  } finally { $('account').disabled=false; }
};
async function load(restore=false) {
  if (!sessionActive && !restore) return;
  const current=++loadNumber;
  const history=showingHistory(), refresh=refreshButton(), status=statusLine();
  refresh.disabled=true;
  status.textContent=history ? 'Loading cellar history…' : 'Loading the rack…';
  try {
    const r=await requestApi(history?'history':'inventory',{cache:'no-store',signal:AbortSignal.timeout(24000)});
    const data=await r.json();
    if(current!==loadNumber)return;
    if(r.status===401){lock(restore?'':data.error);return;}
    if(!r.ok)throw Error(data.error);
    sessionActive=true;
    const time=new Date(data.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    if (history) {
      historyView.update({transactions:data.transactions,tastings:data.tastings});
      historySynced=time;
    } else {
      wines=data.wines;synced=time;fillFilters();renderRack();
    }
    status.textContent='Synced with Google Sheets at '+time+'.';
    showPage();
  } catch (error) {
    if(current!==loadNumber)return;
    const msg=error.message || 'Could not reach Google Sheets.';
    const last=history ? historySynced : synced;
    if (!sessionActive) $('login-message').textContent=msg;
    else {showPage();status.textContent=msg+(last?' Showing the last sync from '+last+'.':'');}
  } finally {if(current===loadNumber || !sessionActive || refresh!==refreshButton()) refresh.disabled=false;}
}
$('history-refresh').onclick=$('refresh').onclick=()=>load();
setInterval(()=>{if(!document.hidden && !refreshButton().disabled)void load();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && !refreshButton().disabled)void load();});
$('login-form').onsubmit=async event=>{
  event.preventDefault();
  if ($('signin').disabled) return;
  ++loadNumber;
  $('signin').disabled=true;$('login-message').textContent='Opening your cellar…';
  try {
    const response=await postSession('login',{password:$('password').value});
    if (!response.ok) throw Error((await response.json()).error);
    $('password').value='';sessionActive=true;sessionGeneration++;
    $('account').hidden=false;
    await load();
    if (!sessionActive && hostedOnPages) $('login-message').textContent='The password was accepted, but the browser did not keep the cellar session. Use a browser that supports partitioned cookies.';
  } catch(error) {
    $('login-message').textContent=error.message || 'Could not open the cellar.';
  } finally { $('signin').disabled=false; }
};
void load(true);
