'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createAppUpdates,createConfiguredUpdater,registerAppUpdates}=require('../app-updates.cjs');
const {createUpdateGate,guardWorkIpc}=require('../update-gate.cjs');
function fixture(){const backend=new EventEmitter();let checks=0,downloads=0,installs=0;backend.checkForUpdates=async()=>{checks++;return {updateInfo:{version:'0.53.0'}};};backend.downloadUpdate=async()=>{downloads++;backend.emit('download-progress',{percent:55.8});backend.emit('update-downloaded',{version:'0.53.0'});return ['private-path'];};backend.quitAndInstall=()=>{installs++;};const gate=createUpdateGate();let scheduled,busy=false;const updates=createAppUpdates({updater:backend,currentVersion:'0.52.1',gate,isBusy:()=>busy,schedule:fn=>scheduled=fn});return {backend,gate,updates,counts:()=>({checks,downloads,installs}),install:()=>scheduled(),setBusy:value=>busy=value};}
test('unconfigured release creates no updater, reads no network configuration and cannot restart',async()=>{
 let loads=0;assert.equal(createConfiguredUpdater({app:{isPackaged:true},config:{enabled:false},load:()=>{loads++;}}),null);assert.equal(loads,0);
 const u=createAppUpdates({gate:createUpdateGate(),currentVersion:'0.52.1'});assert.equal((await u.check()).status,'SETUP_REQUIRED');assert.equal((await u.download()).status,'SETUP_REQUIRED');assert.equal(u.restart().status,'SETUP_REQUIRED');
});
test('check download and explicit restart follow verified version states without install on quit',async()=>{
 const f=fixture();assert.equal(f.backend.autoInstallOnAppQuit,false);assert.equal(f.backend.autoDownload,false);assert.equal(f.backend.allowDowngrade,false);
 assert.equal((await f.updates.check()).status,'AVAILABLE');assert.equal(f.updates.restart().status,'AVAILABLE');
 assert.equal((await f.updates.download()).status,'READY');assert.deepEqual(f.counts(),{checks:1,downloads:1,installs:0});
 assert.equal(f.updates.restart().status,'INSTALLING');await assert.rejects(f.gate.run(()=>{}),/UPDATE_RESTART_PENDING/);f.install();assert.equal(f.counts().installs,1);
});
test('work already in flight and child dialogs prevent restart; queued new work is blocked atomically',async()=>{
 const f=fixture();await f.updates.check();await f.updates.download();let release;
 const handlers=new Map(),work=guardWorkIpc({handle:(name,fn)=>handlers.set(name,fn)},f.gate);
 work.handle('credential-save',()=>new Promise(resolve=>release=resolve));const pending=handlers.get('credential-save')();
 assert.equal(f.updates.restart().blocked,true);assert.equal(f.counts().installs,0);release();await pending;
 f.setBusy(true);assert.equal(f.updates.restart().blocked,true);f.setBusy(false);assert.equal(f.updates.restart().status,'INSTALLING');
 await assert.rejects(handlers.get('credential-save')(),/UPDATE_RESTART_PENDING/);
});
test('same or older release is current, malformed release and wrong downloaded version never install',async()=>{
 for(const version of ['0.52.1','0.52.0','garbage']){const f=fixture();f.backend.checkForUpdates=async()=>({updateInfo:{version}});assert.equal((await f.updates.check()).status,version==='garbage'?'ERROR':'CURRENT');assert.notEqual(f.updates.restart().status,'INSTALLING');}
 const f=fixture();await f.updates.check();f.backend.downloadUpdate=async()=>f.backend.emit('update-downloaded',{version:'0.54.0'});assert.equal((await f.updates.download()).status,'ERROR');assert.equal(f.counts().installs,0);
});
test('duplicate requests, private failures, late events and failed installer never enable unsafe restart',async()=>{
 const f=fixture();let release;f.backend.checkForUpdates=()=>new Promise(resolve=>release=resolve);const check=f.updates.check();await f.updates.check();release({updateInfo:{version:'0.53.0'}});await check;
 f.backend.downloadUpdate=async()=>{throw Error('private-host/path');};assert.equal((await f.updates.download()).status,'ERROR');assert.doesNotMatch(JSON.stringify(f.updates.read()),/private/);f.backend.emit('update-downloaded',{version:'0.53.0'});assert.equal(f.updates.read().status,'ERROR');
 const next=fixture();await next.updates.check();await next.updates.download();next.backend.quitAndInstall=()=>{throw Error('private-install');};next.updates.restart();next.install();assert.equal(next.updates.read().status,'ERROR');await next.gate.run(()=>{});
});
test('update IPC verifies sender and rejects renderer-supplied URLs, versions and extra arguments',async()=>{
 const handlers=new Map(),f=fixture();registerAppUpdates({ipcMain:{handle:(k,v)=>handlers.set(k,v)},getMainWindow:()=>({}),isTrustedRenderer:event=>event==='trusted',updates:f.updates});
 for(const handler of handlers.values()){assert.throws(()=>handler('untrusted'),/INVALID_UPDATE_REQUEST/);assert.throws(()=>handler('trusted','https://evil.example'),/INVALID_UPDATE_REQUEST/);}
 assert.equal(handlers.get('moaon-hub:update-state')('trusted').status,'IDLE');
});
test('an error before scheduled installation cancels it, and failed work releases the gate',async()=>{
 const f=fixture();await f.updates.check();await f.updates.download();f.updates.restart();
 f.backend.emit('error',Error('private'));f.install();assert.equal(f.counts().installs,0);assert.equal(f.updates.read().status,'ERROR');
 await assert.rejects(f.gate.run(()=>{throw Error('work failed');}),/work failed/);assert.equal(f.gate.busy(),false);
 f.updates.dispose();assert.doesNotThrow(()=>f.backend.emit('error',Error('late error')));
});
test('release adapter requires exact generated feed and signer metadata before constructing transport',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-update-config-')),file=path.join(dir,'app-update.yml');
 const config={enabled:true,url:'https://updates.example.test/moaon/stable',publisherName:'Moaon Test Publisher'};
 let created=0;
 const load=name=>name==='js-yaml'?{load:JSON.parse}:{NsisUpdater:class{constructor(){created++;}}};
 const run=()=>createConfiguredUpdater({app:{isPackaged:true},config,resourcesPath:dir,load});
 for(const metadata of [{provider:'generic',url:config.url},{provider:'generic',url:config.url,publisherName:'Wrong Publisher'},{provider:'generic',url:'https://other.example.test',publisherName:config.publisherName}]){fs.writeFileSync(file,JSON.stringify(metadata));assert.equal(run(),null);}
 assert.equal(created,0);
 fs.writeFileSync(file,JSON.stringify({provider:'generic',url:config.url,publisherName:[config.publisherName]}));
 const updater=run();assert.ok(updater);assert.equal(created,1);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);
 fs.unlinkSync(file);fs.rmdirSync(dir);
});

test('automatic checks never download without consent and stop after disposal',async()=>{const {startAutomaticUpdates}=require('../app-updates.cjs');const timers=[];let checks=0,downloads=0,cleared;const stop=startAutomaticUpdates({updates:{check:async()=>{checks++;return {status:'AVAILABLE'};},download:async()=>{downloads++;}},setTimer:(fn,delay)=>{const t={fn,delay};timers.push(t);return t;},clearTimer:t=>cleared=t});assert.equal(timers[0].delay,3000);await timers[0].fn();assert.equal(checks,1);assert.equal(downloads,0);assert.equal(timers[1].delay,21600000);stop();assert.equal(cleared,timers[1]);});

test('startup network failure retries in one minute instead of six hours',async()=>{const {startAutomaticUpdates}=require('../app-updates.cjs');const timers=[];let calls=0;const stop=startAutomaticUpdates({updates:{check:async()=>({status:++calls===1?'ERROR':'CURRENT'})},setTimer:(fn,delay)=>{const t={fn,delay};timers.push(t);return t;},clearTimer:()=>{}});await timers[0].fn();assert.equal(timers[1].delay,60000);await timers[1].fn();assert.equal(timers[2].delay,21600000);stop();});
