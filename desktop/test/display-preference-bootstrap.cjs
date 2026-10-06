'use strict';
const {app,BrowserWindow}=require('electron'),path=require('node:path');
process.on('uncaughtException',()=>{console.error('DISPLAY_TEST_FAILED');process.exit(1);});
process.on('unhandledRejection',()=>{console.error('DISPLAY_TEST_FAILED');process.exit(1);});
const profile=process.env.MOAON_TEST_PROFILE;
if(!profile||!path.isAbsolute(profile))throw Error('Expected isolated profile');
const original=app.setPath.bind(app);app.setPath=(name,value)=>original(name,name==='userData'?profile:value);
// Fail before stealing user focus. Do not override placement or showInactive:
// those must be provided by production code to pass the visible test.
BrowserWindow.prototype.show=function(){throw Error('Unexpected active show');};
BrowserWindow.prototype.focus=function(){throw Error('Unexpected focus');};
require('../main.cjs');
