'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {registerAppInfo}=require('../app-info.cjs');
test('app info reports host version, without paths or secrets',async()=>{
 let handler;registerAppInfo({ipcMain:{handle:(_name,fn)=>{handler=fn;}},getMainWindow:()=>({}),isTrustedRenderer:e=>e.trusted,getVersion:()=> '0.15.1'});
 assert.deepEqual(await handler({trusted:true}),{version:'0.15.1'});
 await assert.rejects(handler({trusted:false}));await assert.rejects(handler({trusted:true},'anything'));
});
test('invalid host version is not exposed',async()=>{
 let handler;registerAppInfo({ipcMain:{handle:(_name,fn)=>{handler=fn;}},getMainWindow:()=>({}),isTrustedRenderer:()=>true,getVersion:()=> 'unexpected private value'});
 assert.deepEqual(await handler({}),{version:null});
});
