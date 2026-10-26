'use strict';
const path=require('node:path'),{EventEmitter}=require('node:events');
const root=process.env.MOAON_TEST_RUNTIME_ROOT;
const {createUpdateGate}=require(path.join(root,'update-gate.cjs'));
const {createAppUpdates}=require(path.join(root,'app-updates.cjs'));
globalThis.setupUpdateDrainFixture=async ipcMain=>{
 const backend=new EventEmitter();backend.checkForUpdates=async()=>({updateInfo:{version:'0.210.0'}});backend.downloadUpdate=async()=>{backend.emit('update-downloaded',{version:'0.210.0'});};globalThis.installs=0;backend.quitAndInstall=()=>globalThis.installs++;
 const gate=createUpdateGate(),updates=createAppUpdates({updater:backend,currentVersion:'0.209.0',gate,isBusy:()=>globalThis.childWindow===true});globalThis.updateDrain=updates;globalThis.drainGate=gate;
 await updates.check();await updates.download();globalThis.work=gate.run(()=>new Promise(resolve=>globalThis.endWork=resolve));
 for(const [name,fn] of [['update-state',()=>updates.read()],['update-restart',()=>updates.restart()]]){ipcMain.removeHandler('moaon-hub:'+name);ipcMain.handle('moaon-hub:'+name,fn);}
};
require('./read-budget-bootstrap.cjs');
