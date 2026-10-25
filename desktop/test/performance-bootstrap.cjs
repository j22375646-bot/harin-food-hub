'use strict';
// This is test-only instrumentation. No real credentials, network or mutations.
const {performance}=require('node:perf_hooks'),Module=require('node:module');
setTimeout(()=>process.exit(70),90000).unref();
const origin=performance.now();
const metrics=globalThis.performanceBaseline={events:[],modules:[],requests:[],lag:[],native:[],factories:[]};
const mark=name=>metrics.events.push({name,ms:performance.now()-origin});
const load=Module._load;
const wrapped=new WeakSet();
Module._load=function(id,...args){const start=performance.now();let value=load.call(this,id,...args);const ms=performance.now()-start;if(ms>=20)metrics.modules.push({id,ms});if(id==='./app-updates.cjs')value.startAutomaticUpdates=()=>()=>{};
 if(['./tray-lifecycle.cjs','./hub-connection.cjs','./blog-workspace.cjs','./app-updates.cjs'].includes(id)&&value&&typeof value==='object'){value={...value};for(const key of Object.keys(value)){const original=value[key];if(typeof original==='function'&&/^(create|register)/.test(key)&&!wrapped.has(original)){const instrumented=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{metrics.factories.push({name:id+':'+key,ms:performance.now()-t});}};wrapped.add(instrumented);value[key]=instrumented;}}}
 return value;};
const {app,session,BrowserWindow}=require('electron');
for(const name of ['setIcon','setAppDetails']){const original=BrowserWindow.prototype[name];if(typeof original==='function')BrowserWindow.prototype[name]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{metrics.native.push({name,at:t-origin,ms:performance.now()-t});}};}
let previous=performance.now();const heartbeat=setInterval(()=>{const current=performance.now();metrics.lag.push(Math.max(0,current-previous-100));previous=current;},100);heartbeat.unref();
app.on('ready',()=>{
 mark('app-ready');
 const remote=session.fromPartition('persist:moaon-harin-readonly');
 remote.fetch=async(url,options={})=>{const start=performance.now(),method=options.method||'GET';if(method!=='GET')throw Error('Performance probe prohibits remote writes');const delay=Number(process.env.MOAON_PERF_NETWORK_DELAY||0);if(delay)await new Promise(resolve=>setTimeout(resolve,delay));metrics.requests.push({path:new URL(url).pathname,method,ms:performance.now()-start,status:401});return new Response('',{status:401});};
});
app.on('browser-window-created',(_event,window)=>{mark('window-created');window.on('ready-to-show',()=>mark('ready-to-show'));window.on('unresponsive',()=>mark('unresponsive'));window.webContents.on('did-finish-load',()=>mark('did-finish-load'));});
require('./isolated-bootstrap.cjs');mark('main-required');
