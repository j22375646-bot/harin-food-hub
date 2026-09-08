'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPrinterInspection,registerPrinterInspection}=require('../printer-inspection.cjs');
function fixture(read=async()=>[]){
 const dialogs=[];let dead=false;
 const win={isDestroyed:()=>dead,webContents:{getPrintersAsync:read}};
 return {win,dialogs,close:()=>{dead=true;},inspect:createPrinterInspection({getMainWindow:()=>win,dialog:{showMessageBox:async(_win,options)=>{dialogs.push(options);}}})};
}
test('empty printer list explains setup without printing',async()=>{
 const f=fixture();assert.deepEqual(await f.inspect(),{status:'SHOWN'});assert.match(f.dialogs[0].detail,/등록된 프린터가 없습니다/);
});
test('printer data stays in native dialog, with no physical-ready claim',async()=>{
 const f=fixture(async()=>[{name:'LABEL',isDefault:true,status:0},{name:'PDF',isDefault:false,status:2}]);
 assert.deepEqual(await f.inspect(),{status:'SHOWN'});assert.match(f.dialogs[0].detail,/LABEL.*기본/);assert.match(f.dialogs[0].detail,/출력 성공을 보장하지/);
});
test('failure is generic and closing app prevents a late dialog',async()=>{
 const f=fixture(async()=>{throw Error('PRIVATE DRIVER DETAIL');});assert.deepEqual(await f.inspect(),{status:'UNAVAILABLE'});assert.equal(f.dialogs.length,0);
 let finish;const g=fixture(()=>new Promise(resolve=>{finish=resolve;}));const pending=g.inspect();g.close();finish([]);assert.deepEqual(await pending,{status:'UNAVAILABLE'});assert.equal(g.dialogs.length,0);
});
test('concurrent inspection never opens two dialogs',async()=>{
 let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.inspect();assert.deepEqual(await f.inspect(),{status:'BUSY'});finish([]);await pending;assert.equal(f.dialogs.length,1);
});
test('IPC rejects foreign callers and extra arguments',async()=>{
 let handler,calls=0;const win={};registerPrinterInspection({ipcMain:{handle:(_name,fn)=>{handler=fn;}},getMainWindow:()=>win,isTrustedRenderer:event=>event.allowed===true,inspect:async()=>{calls++;return {status:'SHOWN'};}});
 await assert.rejects(handler({allowed:false}));await assert.rejects(handler({allowed:true},'device'));
 assert.equal(calls,0);assert.deepEqual(await handler({allowed:true}),{status:'SHOWN'});
});
test('stalled driver returns safely after deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture(()=>new Promise(()=>{}));
 const pending=f.inspect();t.mock.timers.tick(5000);assert.deepEqual(await pending,{status:'UNAVAILABLE'});assert.equal(f.dialogs.length,0);
});
