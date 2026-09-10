'use strict';
const fs=require('node:fs'),path=require('node:path');
const versionParts=value=>typeof value==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value)?value.split('.').map(Number):null;
function newer(next,current){const a=versionParts(next),b=versionParts(current);if(!a||!b)return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
function createConfiguredUpdater({app,config,resourcesPath=process.resourcesPath,load=require}={}){
 if(!app.isPackaged||process.platform!=='win32'||config?.enabled!==true)return null;
 try{
  if(config.mode==='ed25519')return require('./signed-updates.cjs').createSignedUpdater({config,load});
  const url=new URL(config.url);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.includes('.')||!config.publisherName||typeof config.publisherName!=='string')return null;
  // Require build-generated metadata and an explicit trusted Windows publisher.
  // Do not let a missing publisher silently disable signature verification.
  const yaml=load('js-yaml');
  const metadata=yaml.load(fs.readFileSync(path.join(resourcesPath,'app-update.yml'),'utf8'));
  const publishers=Array.isArray(metadata?.publisherName)?metadata.publisherName:[metadata?.publisherName];
  if(metadata?.provider!=='generic'||metadata.url!==config.url||publishers.length!==1||publishers[0]!==config.publisherName)return null;
  const {NsisUpdater}=load('electron-updater');
  const updater=new NsisUpdater();
  updater.logger={info(){},warn(){},error(){},debug(){}};
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;
  updater.allowDowngrade=false;updater.allowPrerelease=false;
  return updater;
 }catch{return null;}
}
function createAppUpdates({updater=null,currentVersion,gate,isBusy=()=>false,schedule=setImmediate}={}){
 let state={status:updater?'IDLE':'SETUP_REQUIRED',version:null,percent:null,blocked:false},disposed=false;
 const read=()=>Object.freeze({...state});
 const set=(status,fields={})=>{state={...state,status,blocked:false,...fields};return read();};
 const fail=()=>{gate.resume();return set('ERROR',{version:null,percent:null});};
 const onError=()=>{if(!disposed)fail();};
 const onProgress=info=>{if(!disposed&&state.status==='DOWNLOADING'&&Number.isFinite(info?.percent))state.percent=Math.max(0,Math.min(100,Math.floor(info.percent)));};
 const onDownloaded=info=>{if(!disposed&&state.status==='DOWNLOADING'){if(info?.version!==state.version)fail();else set('READY',{percent:100});}};
 if(updater){updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;updater.on('error',onError);updater.on('download-progress',onProgress);updater.on('update-downloaded',onDownloaded);}
 let operation=null;
 function perform(work){if(operation)return operation;operation=work().finally(()=>{operation=null;});return operation;}
 return Object.freeze({
  read,
  check(){
   if(disposed||!updater||!['IDLE','CURRENT','ERROR','AVAILABLE'].includes(state.status))return Promise.resolve(read());
   return perform(async()=>{set('CHECKING',{version:null,percent:null});try{const result=await updater.checkForUpdates();if(disposed||state.status!=='CHECKING')return read();const v=result?.updateInfo?.version;if(!versionParts(v)||!versionParts(currentVersion))return fail();return newer(v,currentVersion)?set('AVAILABLE',{version:v}):set('CURRENT');}catch{return fail();}});
  },
  download(){
   if(disposed||!updater||state.status!=='AVAILABLE')return Promise.resolve(read());
   return perform(async()=>{set('DOWNLOADING',{percent:0});try{await updater.downloadUpdate();if(disposed)return read();return state.status==='READY'?read():fail();}catch{return fail();}});
  },
  restart(){
   if(disposed||!updater||state.status!=='READY')return read();
   try{if(isBusy()||!gate.pause()){state.blocked=true;return read();}}catch{state.blocked=true;return read();}
   set('INSTALLING');
   schedule(()=>{if(disposed||state.status!=='INSTALLING'){gate.resume();return;}try{updater.quitAndInstall(true,true);}catch{fail();}});
   return read();
  },
  dispose(){disposed=true;for(const [event,fn] of [['download-progress',onProgress],['update-downloaded',onDownloaded]])updater?.removeListener(event,fn);gate.resume();},
 });
}
function startAutomaticUpdates({updates,setTimer=setTimeout,clearTimer=clearTimeout,initialDelay=10000,interval=6*60*60*1000}){
 let stopped=false,timer;
 const plan=delay=>{timer=setTimer(async()=>{try{await updates.check();}catch{}finally{if(!stopped)plan(interval);}},delay);timer?.unref?.();};
 plan(initialDelay);return ()=>{stopped=true;clearTimer(timer);};
}
function registerAppUpdates({ipcMain,getMainWindow,isTrustedRenderer,updates}){
 for(const [channel,method] of [['update-state','read'],['update-check','check'],['update-download','download'],['update-restart','restart']]){
  ipcMain.handle(`moaon-hub:${channel}`,(event,...args)=>{if(args.length||!isTrustedRenderer(event,getMainWindow()))throw Error('INVALID_UPDATE_REQUEST');return updates[method]();});
 }
}
module.exports={startAutomaticUpdates,createConfiguredUpdater,createAppUpdates,registerAppUpdates,newer};
