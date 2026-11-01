import { fail, fixtures, canSee, manages } from '../server/goals/shared.js';
const today=()=>new Date().toISOString().slice(0,10);
const dateOffset=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
export const publicPerson=({credentialHash,...p})=>p;
export function seedData(){
  const people=fixtures.map(([id,name,department,role,manager])=>({id,name,department,role,manager,email:`${id}@example.test`}));
  const goals=people.filter(p=>p.role!=='admin').flatMap(p=>[0,1].map(i=>({id:`${p.id}-${i+1}`,employee:p.id,title:p.department==='Engineering'?(i?'Complete security training':'Improve release reliability'):(i?'Publish account playbook':'Improve customer onboarding'),target:i?'Complete all 4 modules':'Deliver 3 documented improvements',due:dateOffset(i?14:-3),progress:i?25:60,version:1,notes:[]})));
  return {people,goals,replays:[]};
}
export function actorFor(data,workspace,id){
  const person=data.people.find(p=>p.id===id);
  if(!person)fail(401,'Sign in to your sandbox.');
  return {workspace,...publicPerson(person)};
}
export function employee(data,actor,id){
  const person=data.people.find(p=>p.id===id);
  if(!person||!canSee(data.people,actor,id))fail(404,'Employee not found in your scope.');
  return {...publicPerson(person),canManage:manages(data.people,actor,id)};
}
export function goalView(data,actor,id){
  const g=data.goals.find(g=>g.id===id);
  if(!g||!canSee(data.people,actor,g.employee))fail(404,'Goal not found in your scope.');
  return {...g,status:g.progress===100?'complete':g.due<today()?'overdue':'in_progress',canUpdate:g.employee===actor.id,canManage:manages(data.people,actor,g.employee)};
}
// Pure domain operations run against one D1 snapshot. Mutations are persisted with a revision CAS.
export function execute(data,actor,name,input){
  if(input.employee)employee(data,actor,input.employee);
  if(input.id)goalView(data,actor,input.id);
  if(name==='get_identity')return actor;
  if(name==='list_employees')return data.people.filter(p=>canSee(data.people,actor,p.id)).map(p=>employee(data,actor,p.id));
  if(name==='get_goal')return goalView(data,actor,input.id);
  if(name==='list_goals')return data.goals.filter(g=>canSee(data.people,actor,g.employee)&&(!input.employee||input.employee===g.employee)&&(!input.query||g.title.toLowerCase().includes(input.query.toLowerCase())))
    .map(g=>goalView(data,actor,g.id)).filter(g=>!input.status||g.status===input.status).sort((a,b)=>a.due.localeCompare(b.due)||a.id.localeCompare(b.id));
  if(name==='create_goal'){
    if(!manages(data.people,actor,input.employee))fail(403,'Only an authorized supervisor can assign goals.');
    if(data.goals.length>=200)fail(429,'Sandbox goal limit reached.');
    const g={id:crypto.randomUUID(),employee:input.employee,title:input.title,target:input.target,due:input.due,progress:0,version:1,notes:[]};
    data.goals.push(g);return goalView(data,actor,g.id);
  }
  if(name==='update_progress'||name==='add_feedback'){
    const g=data.goals.find(g=>g.id===input.id);
    if(name==='update_progress'&&g.employee!==actor.id)fail(403,'Only the employee can update their progress.');
    if(name==='add_feedback'&&!manages(data.people,actor,g.employee))fail(403,'Only an authorized supervisor can add feedback.');
    if(g.version!==input.version)fail(409,'This goal changed. Read it again before updating.');
    if(data.goals.reduce((n,g)=>n+g.notes.length,0)>=1000)fail(429,'Sandbox note limit reached.');
    if(name==='update_progress')g.progress=input.progress;
    g.version++;g.notes.push({id:crypto.randomUUID(),author:actor.id,kind:name==='update_progress'?'progress':'feedback',text:input.note,created:new Date().toISOString()});
    return goalView(data,actor,g.id);
  }
  if(name==='set_manager'){
    if(actor.role!=='admin')fail(403,'Administrator access required.');
    const p=data.people.find(p=>p.id===input.employee);
    if(p.role==='admin')fail(400,'Administrator has no reporting relationship.');
    const manager=input.manager?employee(data,actor,input.manager):null;
    if(manager&&(!['head','supervisor'].includes(manager.role)||manager.department!==p.department))fail(400,'Choose a supervisor in the same department.');
    let cursor=manager;const seen=new Set([p.id]);
    while(cursor){if(seen.has(cursor.id))fail(400,'Reporting relationships cannot form a cycle.');seen.add(cursor.id);cursor=data.people.find(p=>p.id===cursor.manager);}
    p.manager=input.manager||null;return employee(data,actor,p.id);
  }
  fail(404,'Unknown action.');
}
