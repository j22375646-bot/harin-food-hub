'use strict';
// Opt-in network acceptance test. No installer execution or user profile access.
process.on('uncaughtException',e=>{process.stderr.write('LIVE_UPDATE_TEST_FAILED: '+e.message+'\n');process.exit(1);});process.on('unhandledRejection',e=>{process.stderr.write('LIVE_UPDATE_TEST_FAILED: '+e.message+'\n');process.exit(1);});
const path=require('node:path'),fs=require('node:fs'),{app}=require('electron');
if(!process.env.MOAON_LIVE_UPDATE_ACCEPTANCE||!/^D:[\\/]/i.test(process.env.MOAON_TEST_RUNTIME_ROOT||''))throw Error('Explicit isolated acceptance configuration required');
const resources=path.dirname(process.env.MOAON_TEST_RUNTIME_ROOT);if(!fs.existsSync(path.join(resources,'app-update.yml')))throw Error('Packaged update metadata required');
Object.defineProperty(app,'isPackaged',{value:true});app.getVersion=()=> '0.104.0';const modulePath=path.join(process.env.MOAON_TEST_RUNTIME_ROOT,'node_modules/electron-updater/out/NsisUpdater.js');const nsis=require(modulePath),Base=nsis.NsisUpdater;nsis.NsisUpdater=class extends Base{constructor(...args){super(...args);this.updateConfigPath=path.join(resources,'app-update.yml');}};
require('./isolated-bootstrap.cjs');
