'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createTeamNotifications}=require('../team-notifications.cjs');
test('assignment notifications deduplicate across restart and logout invalidates clicks',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'team-notify-')),shown=[],sent=[];
 class Notification extends EventEmitter{static isSupported(){return true;} show(){shown.push(this);this.emit('show');}close(){this.closed=true;}}
 const getWindow=()=>({isDestroyed:()=>false,isMinimized:()=>false,show(){},focus(){},webContents:{send(...args){sent.push(args);}}});
 const value={me:'10000000-0000-4000-8000-000000000001',members:[{id:'10000000-0000-4000-8000-000000000001',notifications:true}],events:[{id:1,task_id:'task'}],tasks:[{id:'task',assigned_to:'10000000-0000-4000-8000-000000000001',status:'OPEN',title:'Fixture'}]};
 const a=createTeamNotifications({Notification,directory,getWindow});a.receive(value);a.receive(value);assert.equal(shown.length,1);shown[0].emit('click');assert.equal(sent.length,1);a.reset();shown[0].emit('click');assert.equal(sent.length,1);assert.equal(shown[0].closed,true);
 createTeamNotifications({Notification,directory,getWindow}).receive(value);assert.equal(shown.length,1);
 value.events=[{id:2,task_id:'task'}];value.members[0].notifications=false;a.receive(value);assert.equal(shown.length,1);
 fs.rmSync(directory,{recursive:true,force:true});
});
test('failed display does not consume assignment and stale final event does not hide a valid task',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'team-notify-failure-')),me='10000000-0000-4000-8000-000000000001';let fail=true,count=0;
 class Notification extends EventEmitter{static isSupported(){return true;}show(){count++;this.emit(fail?'failed':'show');}close(){}}
 const value={me,members:[{id:me,notifications:true}],events:[{id:1,task_id:'open'},{id:2,task_id:'done'}],tasks:[{id:'open',assigned_to:me,status:'OPEN',title:'Fixture'},{id:'done',assigned_to:me,status:'DONE',title:'Old'}]};
 const a=createTeamNotifications({Notification,directory,getWindow:()=>null});a.receive(value);a.receive(value);assert.equal(count,1);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,me+'.json'))),[2]);
 fail=false;createTeamNotifications({Notification,directory,getWindow:()=>null}).receive(value);assert.equal(count,2);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,me+'.json'))).sort(),[1,2]);
 fs.rmSync(directory,{recursive:true,force:true});
});
