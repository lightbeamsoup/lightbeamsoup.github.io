const bridge='http://127.0.0.1:3491';

export function setupChat({getData,el,stock}) {
  const $=id=>document.getElementById(id);
  const isIPad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let pairing=null,popup,selected=null,controller,history=[];
  function status() {
    $('pair-controls').hidden=Boolean(pairing);
    $('send').disabled=!pairing || Boolean(controller);
    $('chat-context').textContent=selected ? [selected.producer,selected.name,selected.year].filter(Boolean).join(' · ') : 'Ask about the whole cellar or the bottles in your current filter.';
    if (isIPad) {
      $('pair-controls').hidden=true;
      $('question-form').hidden=true;
      $('chat-status').textContent='Ask Codex runs on the computer with the paired companion. Open Wine Rack on that computer to ask about this cellar.';
    }
  }
  $('pair').onclick=()=>{
    popup=window.open(bridge+'/pair?origin='+encodeURIComponent(location.origin),'wine-rack-companion','popup,width=480,height=440');
    $('chat-status').textContent=popup?'Approve the connection in the local companion window. If it cannot open, start the companion on this computer.':'Allow pop-ups to connect your local Codex.';
  };
  window.addEventListener('message',e=>{
    if (e.origin!==bridge || !popup || e.source!==popup || e.data?.type!=='wine-rack-pair' || !e.ports[0])return;
    pairing?.close();pairing=e.ports[0];pairing.start();$('chat-status').textContent='Connected to local Codex. Keep the pairing window open.';status();
  });
  function askLocal(payload,signal) {
    const port=pairing,id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      function finish(error,value) {
        clearInterval(timer);port.removeEventListener('message',receive);signal.removeEventListener('abort',cancel);
        if(error)reject(error);else resolve(value);
      }
      function cancel(){finish(Error('Question cancelled.'));}
      function receive({data}){
        if(data.id!==id)return;
        if(data.reconnect || data.error==='Reconnect your local Codex companion.'){port.close();pairing=null;}
        finish(data.error ? Error(data.error) : null,data);
      }
      const started=Date.now();
      const timer=setInterval(()=>{
        if(!popup || popup.closed || Date.now()-started>165000){
          pairing?.close();pairing=null;finish(Error('Reconnect the local Codex window and try again.'));
        }
      },750);
      signal.addEventListener('abort',cancel,{once:true});port.addEventListener('message',receive);port.postMessage({id,payload});
    });
  }
  function add(role,text) {
    const p=el('p');p.append(el('b',role),document.createTextNode(text));$('conversation').append(p);
  }
  $('question-form').onsubmit=async e=>{
    e.preventDefault();const question=$('question').value.trim();
    if (!question || !pairing || controller)return;
    const run=controller=new AbortController();
    status();$('chat-status').textContent='Codex is reading your cellar…';
    try {
      const {wines,visibleIds}=getData();
      const result=await askLocal({question,selectedId:selected?.id || null,visibleIds,wines,history},run.signal);
      if(run.signal.aborted)return;
      add('You',question);add('Codex',result.answer);history.push({question,answer:result.answer});history=history.slice(-3);
      if(result.change) {
        const {wineId,action,amount}=result.change;
        const w=wines.find(item=>item.id===wineId);
        if(w && ['open','set'].includes(action) && Number.isSafeInteger(amount) && amount>=0 &&
          (action==='set'?amount!==w.quantity:amount>0 && amount<=w.quantity)) {
          const proposal=stock.proposal(w,action,amount,()=>{
            proposal.replaceWith(el('p','Saved the change to '+(w.name||w.producer)+' in '+(w.location||'the rack')+'.'));
            history.push({question:'Confirmed the proposed edit.',answer:'The tracker saved the change for '+wineId+'.'});history=history.slice(-3);
          });
          $('conversation').append(proposal);
        } else add('Wine Rack','The suggested change does not match the current stock. Check the wine and bottle count.');
      }
      $('question').value='';$('chat-status').textContent=result.version===2?'':'Restart the Wine Rack companion and reconnect to enable quantity changes.';
    } catch(error) {
      if(!run.signal.aborted)$('chat-status').textContent=error instanceof TypeError?'Could not reach local Codex. Check that the companion is running and allow local network access if prompted.':error.message;
    } finally {if(controller===run){controller=null;status();}}
  };
  return {
    open(wine=null){selected=wine;status();$('chat').showModal();},
    clear(){controller?.abort();controller=null;pairing?.close();pairing=null;popup?.close();popup=null;selected=null;history=[];$('chat').close();$('conversation').replaceChildren();$('question').value='';$('chat-status').textContent='';status();}
  };
}
