import express from 'express';
import { performance } from 'node:perf_hooks';
import { createStore, AppError, fail } from './store.js';
import { tools } from '../../agent-lab/contracts.js';

import { validate, authSchema } from './shared.js';
export { validate } from './shared.js';
const cookieName='goals_session';
const bearer = req => req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
const cookie = req => { try { return decodeURIComponent((req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)||''); } catch { return ''; } };

export function createGoalsRouter({filename, store=createStore(filename), secureCookies=process.env.NODE_ENV==='production'||Boolean(process.env.RAILWAY_ENVIRONMENT_ID), allowedOrigins=(process.env.GOALS_ALLOWED_ORIGINS||'https://www.joshcodes.ai,https://joshcodes.ai').split(',').map(x=>x.trim()).filter(Boolean)}={}) {
  const router=express.Router();
  const limits=new Map();
  router.use((req,res,next)=>{
    const origin=req.get('origin');
    const sameOrigin=origin===`${req.protocol}://${req.get('host')}`;
    if(origin && !sameOrigin && !allowedOrigins.includes(origin)) return res.status(403).json({error:'Origin not allowed.'});
    if(origin){
      res.set('Access-Control-Allow-Origin',origin);
      res.vary('Origin');
      res.set('Access-Control-Allow-Headers','Content-Type, Authorization, X-Goals-Channel, Idempotency-Key');
      res.set('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
    }
    if(req.method==='OPTIONS') return res.sendStatus(204);
    next();
  });
  router.use(express.json({limit:'16kb'}));
  router.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    // Cookie-based writes must originate from the same site. API clients use bearer tokens.
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !bearer(req) && cookie(req)) {
      const expected=`${req.protocol}://${req.get('host')}`;
      if (req.get('origin') ? req.get('origin')!==expected : cookie(req)) return res.status(403).json({error:'Same-origin request required.'});
    }
    next();
  });
  const limited=(req,category,max)=>{
    const now=Date.now();
    for (const [key,v] of limits) if (v.reset<now) limits.delete(key);
    const key=`${category}:${req.ip}`;
    const entry=limits.get(key)||{count:0,reset:now+3600000};
    entry.count++; limits.set(key,entry);
    if(entry.count>max) fail(429,'Too many attempts. Try again in an hour.');
  };
  router.post('/workspaces',(req,res,next)=>{try { limited(req,'sandbox',10); res.status(201).json(store.createWorkspace()); } catch(e){next(e);} });
  router.post('/login',(req,res,next)=>{try {
    limited(req,'login',100);
    const {workspace,email,password}=validate(authSchema,req.body);
    const session=store.login(workspace,email,password);
    res.cookie(cookieName,session.token,{httpOnly:true,secure:secureCookies,sameSite:'strict',path:'/api/agent-lab',maxAge:session.expires-Date.now()});
    res.json({...session,identity:store.authenticate(session.token)});
  } catch(e){next(e);} });
  router.get('/openapi.json',(_req,res)=>res.json({openapi:'3.1.0',info:{title:'Employee Goals Sandbox',version:'1.0.0'},servers:[{url:'/api/agent-lab/v1'}],
    components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'}}},
    paths:Object.fromEntries(tools.map(t=>[`/actions/${t.name}`,{post:{operationId:t.name,summary:t.description,security:[{bearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:t.inputSchema}}},responses:{200:{description:'Action result'},400:{description:'Invalid input'},401:{description:'Sign in required'},403:{description:'Permission denied'},404:{description:'Record outside scope or missing'},409:{description:'Version or idempotency conflict'}}}}]))}));
  router.use((req,res,next)=>{try {req.goalsActor=store.authenticate(bearer(req)||cookie(req)); next();}catch(e){next(e);} });
  router.post('/logout',(req,res)=>{store.logout(bearer(req)||cookie(req));res.clearCookie(cookieName,{path:'/api/agent-lab'});res.json({ok:true});});
  router.get('/events',(req,res)=>res.json(store.events(req.goalsActor)));
  router.get('/me',(req,res)=>res.json(req.goalsActor));
  router.get('/employees',(req,res)=>res.json(store.listEmployees(req.goalsActor)));
  router.get('/snapshot',(req,res)=>res.json({identity:req.goalsActor,employees:store.listEmployees(req.goalsActor),goals:store.listGoals(req.goalsActor),events:store.events(req.goalsActor)}));
  const execute=(req,name,input)=>{
    const tool=tools.find(t=>t.name===name);
    if(!tool) fail(404,'Unknown action.');
    validate(tool.inputSchema,input);
    const actor=req.goalsActor;
    const {idempotencyKey,...args}=input;
    // Recheck current scope before returning an idempotent replay after hierarchy changes.
    if (args.employee) store.employee(actor,args.employee);
    if (args.id) store.goal(actor,args.id);
    const operations={
      get_identity:()=>actor,
      list_employees:()=>store.listEmployees(actor),
      list_goals:()=>store.listGoals(actor,args),
      get_goal:()=>store.goal(actor,args.id),
      create_goal:()=>store.createGoal(actor,args),
      update_progress:()=>store.updateProgress(actor,args),
      add_feedback:()=>store.addFeedback(actor,args),
      set_manager:()=>store.setManager(actor,args)
    };
    if (tool.readOnly) return operations[name]();
    return store.mutate(actor,idempotencyKey,name,args,operations[name]);
  };
  const measured=(req,res,next,name,input)=>{
    const start=performance.now();
    let status=200;
    try {res.json(execute(req,name,input));}catch(e){status=e.status||500;next(e);}finally {
      const ms=performance.now()-start;
      const channel=['browser','webmcp','api'].includes(req.get('X-Goals-Channel'))?req.get('X-Goals-Channel'):'api';
      store.record(req.goalsActor,channel,name,status,ms);
    }
  };
  router.use((req,_res,next)=>{try{limited(req,'actions',5000);next();}catch(e){next(e);}});
  router.post('/actions/:name',(req,res,next)=>measured(req,res,next,req.params.name,req.body));
  router.get('/goals',(req,res,next)=>measured(req,res,next,'list_goals',req.query));
  router.get('/goals/:id',(req,res,next)=>measured(req,res,next,'get_goal',{id:req.params.id}));
  router.post('/goals',(req,res,next)=>measured(req,res,next,'create_goal',{...req.body,idempotencyKey:req.get('Idempotency-Key')}));
  router.patch('/goals/:id/progress',(req,res,next)=>measured(req,res,next,'update_progress',{...req.body,id:req.params.id,idempotencyKey:req.get('Idempotency-Key')}));
  router.post('/goals/:id/feedback',(req,res,next)=>measured(req,res,next,'add_feedback',{...req.body,id:req.params.id,idempotencyKey:req.get('Idempotency-Key')}));
  router.use((error,_req,res,_next)=>{
    const status=error instanceof AppError?error.status:error.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;
    if(status===500) console.error('Goals tracker request failed:',error.message);
    res.status(status).json({error:status===500?'Unable to complete request.':error.message});
  });
  return {router,store};
}
