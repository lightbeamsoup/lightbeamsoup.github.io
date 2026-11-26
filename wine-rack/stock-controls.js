const label=w=>[w.producer,w.name,w.year,w.location,w.shelf].filter(Boolean).join(' · ');

export function setupStock({el,requestApi,session,onExpired,onSaved}) {
  let busy=false;
  const receipts=new Map();
  async function save(w,action,amount) {
    if(busy)throw Error('A bottle update is already being saved.');
    if(!Number.isSafeInteger(amount)||amount<0 || (action==='open' && (amount<1 || amount>w.quantity)))throw Error('Enter a valid whole number of bottles.');
    if(action==='set' && amount===w.quantity)throw Error('The count already matches.');
    const generation=session();
    if(generation===null)throw Error('Refresh and sign in before editing.');
    const change={wineId:w.id,identity:JSON.stringify([w.producer,w.name,w.year,w.location,w.shelf]),expected:w.quantity,action,amount};
    busy=true;
    try {
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(change)));
      const key='wine-stock:'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      let id=receipts.get(key);
      try{id??=sessionStorage.getItem(key);}catch{}
      id||=crypto.randomUUID();receipts.set(key,id);
      try{sessionStorage.setItem(key,id);}catch{}
      if(session()!==generation)throw Error('Open the cellar again before editing.');
      const res=await requestApi('stock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...change,requestId:id}),signal:AbortSignal.timeout(75000)});
      const result=await res.json();
      if(!res.ok){
        if(res.status===401 && session()===generation)onExpired();
        throw Error(result.error || 'Could not save this change.');
      }
      if(!result.saved)throw Error('Could not confirm the transaction. Retry the same change.');
      if(session()===generation)await onSaved();
      receipts.delete(key);
      try{sessionStorage.removeItem(key);}catch{}
    } finally {busy=false;}
  }
  function applyButton(w,action,getAmount,caption,done) {
    const group=el('div',null,'stock-action'), button=el('button',caption), msg=el('p');
    button.type='button';msg.setAttribute('role','status');
    button.onclick=async()=>{
      button.disabled=true;msg.textContent='Saving…';
      try {
        await save(w,action,getAmount());
        msg.textContent='Saved to the tracker.';done?.();
      } catch(error){msg.textContent=error.message;button.disabled=false;}
    };
    group.append(button,msg);return group;
  }
  return {
    clear(){receipts.clear();},
    controls(w,done){
      const panel=el('section',null,'stock-panel');
      panel.append(el('h3','Bottle count'));
      if(w.quantity>0)panel.append(applyButton(w,'open',()=>1,'Mark 1 bottle opened',done));
      const details=el('details'), summary=el('summary','Correct on-hand count'),input=el('input');
      input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.value=String(w.quantity);
      const field=el('label','Actual bottles on hand');field.append(input);
      details.append(summary,field,applyButton(w,'set',()=>input.valueAsNumber,'Save corrected count',done));
      panel.append(details);return panel;
    },
    proposal(w,action,amount,done){
      const box=el('div',null,'stock-panel');
      const target=action==='open'?w.quantity-amount:amount;
      box.append(el('strong',label(w)),el('p','On hand: '+w.quantity+' → '+target+' bottles.'),
        applyButton(w,action,()=>amount,action==='open'?'Confirm opening '+amount:'Confirm count of '+amount,done));
      return box;
    }
  };
}
