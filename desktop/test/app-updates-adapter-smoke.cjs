'use strict';
// Real electron-updater construction only. Never queries a feed or installs.
const {app}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createConfiguredUpdater}=require('../app-updates.cjs');
const load=process.env.MOAON_UPDATE_TEST_DEPENDENCIES?require('node:module').createRequire(path.join(process.env.MOAON_UPDATE_TEST_DEPENDENCIES,'package.json')):require;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-update-adapter-'));
app.setPath('userData',profile);
app.whenReady().then(()=>{
 const config={enabled:true,url:'https://updates.example.test/moaon/stable',publisherName:'Moaon Test Publisher'};
 fs.writeFileSync(path.join(profile,'app-update.yml'),JSON.stringify({provider:'generic',url:config.url,publisherName:[config.publisherName]}));
 const updater=createConfiguredUpdater({app:{isPackaged:true},config,resourcesPath:profile,load});
 assert.ok(updater);assert.equal(updater.constructor.name,'NsisUpdater');
 assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);
 console.log(JSON.stringify({status:'PASS',scope:'actual NsisUpdater construction; no network/download/install',version:load('electron-updater/package.json').version}));
 app.quit();
}).catch(()=>{console.error('UPDATE_ADAPTER_SMOKE_FAILED');app.exit(1);});
