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

test('known virtual destinations are separated from devices needing physical confirmation',async()=>{
 const f=fixture(async()=>[
  {name:'Microsoft Print to PDF',isDefault:true,status:0},
  {name:'Hancom PDF',status:0},{name:'Fax',status:0},
  {name:'Microsoft XPS Document Writer',status:0},{name:'OneNote (Desktop)',status:0},
 ]);
 await f.inspect();
 assert.match(f.dialogs[0].message,/실제 송장 프린터를 확인하세요/);
 assert.match(f.dialogs[0].detail,/가상 출력으로 추정: 5개/);
 assert.match(f.dialogs[0].detail,/장비 확인 대상: 0개/);
 assert.match(f.dialogs[0].detail,/출고용 컴퓨터/);
});

test('unknown names and zero driver status never imply a working physical printer',async()=>{
 const f=fixture(async()=>[{name:'Zebra ZD421',status:0},{name:'Office PDF label',status:0}]);
 await f.inspect();
 assert.match(f.dialogs[0].detail,/장비 확인 대상: 2개/);
 assert.match(f.dialogs[0].detail,/코드 0.*실물 확인 필요/);
 assert.doesNotMatch(f.dialogs[0].message,/준비 완료|출력 가능/);
});

test('bad driver entries do not discard the remaining printer list',async()=>{
 const f=fixture(async()=>[null,{},'bad',{name:'LABEL\nINJECT\u202e',status:0}]);
 assert.deepEqual(await f.inspect(),{status:'SHOWN'});
 assert.match(f.dialogs[0].detail,/LABEL INJECT/);
 assert.doesNotMatch(f.dialogs[0].detail,/\u202e/);
 assert.match(f.dialogs[0].detail,/이름 확인 필요/);
});
