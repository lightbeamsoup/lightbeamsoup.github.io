import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoalsRouter } from './router.js';

// Standalone Railway service: no Lifetree/Google configuration or scheduler.
const app=express();
app.set('trust proxy',1);
const dataDir=process.env.DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');
const {router,store}=createGoalsRouter({filename:path.join(dataDir,'employee-goals.sqlite')});
app.get('/healthz',(_req,res)=>res.json({ok:true,service:'goalroom'}));
app.use('/api/agent-lab/v1',router);
const server=app.listen(Number(process.env.PORT||3004),()=>console.log(`Goalroom API listening on port ${process.env.PORT||3004}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
