'use strict';
const Module=require('node:module'),load=Module._load;
Module._load=function(id,...args){const value=load.call(this,id,...args);return id==='./app-updates.cjs'?{...value,startAutomaticUpdates:()=>()=>{}}:value;};
const {app,session}=require('electron');
app.on('ready',()=>{
 const me='10000000-0000-4000-8000-000000000001';
 globalThis.budgetFixture={me,members:[{id:me,name:'조회 자동 검증',notifications:false,revision:1}],tasks:[],events:[]};globalThis.budgetCalls={team:0,orders:0,cs:0};
 session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options={})=>{
  if(url.endsWith('/api/moaon/team')){if((options.method||'GET')!=='GET')throw Error('Test permits team reads only');globalThis.budgetCalls.team++;await new Promise(resolve=>setTimeout(resolve,100));return Response.json({ok:true,value:globalThis.budgetFixture});}
  if(url.endsWith('/api/orders/live-refresh')){globalThis.budgetCalls.orders++;return Response.json({ok:true,cafe24:{status:'SUCCESS'},requests:{}});}
  if(url.endsWith('/api/customer-service/sync')){globalThis.budgetCalls.cs++;return Response.json({ok:true,jobs:[]},{status:202});}
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };
});
require('./isolated-bootstrap.cjs');
