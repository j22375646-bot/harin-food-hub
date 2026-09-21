'use strict';
const {performance}=require('node:perf_hooks'),Module=require('node:module');
const start=performance.now();globalThis.startupProfile={loads:[],events:[],maxLagMs:0};const mark=name=>globalThis.startupProfile.events.push({name,ms:Math.round(performance.now()-start)});
const original=Module._load;Module._load=function(id,...args){const t=performance.now();const result=original.call(this,id,...args);const ms=performance.now()-t;if(ms>30)globalThis.startupProfile.loads.push({id,ms:Math.round(ms)});if(id==='./app-updates.cjs')result.startAutomaticUpdates=()=>()=>{};return result;};
let prev=performance.now();setInterval(()=>{const now=performance.now();globalThis.startupProfile.maxLagMs=Math.max(globalThis.startupProfile.maxLagMs,Math.round(now-prev-100));prev=now;},100).unref();
const {app}=require('electron');Object.defineProperty(app,'isPackaged',{value:true});
app.on('ready',()=>mark('app-ready'));app.on('browser-window-created',(_,win)=>{mark('window-created');win.on('ready-to-show',()=>mark('ready-to-show'));win.on('unresponsive',()=>mark('unresponsive'));win.webContents.on('did-finish-load',()=>mark('did-finish-load'));});
require('./isolated-bootstrap.cjs');mark('main-required');
