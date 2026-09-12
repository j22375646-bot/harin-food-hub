'use strict';
const {app,Tray,session,Notification}=require('electron');
const notify=Notification.prototype.show;
Notification.prototype.show=function(){this.once('show',()=>globalThis.nativeNotice='SHOWN');this.once('failed',()=>globalThis.nativeNotice='FAILED');return notify.call(this);};
const set=Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu=function(menu){globalThis.testTray={tray:this,menu};return set.call(this,menu);};
app.on('ready',()=>{
 globalThis.testCalls={team:0,orders:0,cs:0};
 const id='10000000-0000-4000-8000-000000000001';
 session.fromPartition('persist:moaon-harin-readonly').fetch=async(url,options={})=>{
  if(url.endsWith('/api/moaon/team')){globalThis.testCalls.team++;return Response.json({ok:true,value:{me:id,members:[{id,name:'백그라운드 자동 검증',notifications:!!globalThis.testAssignment}],tasks:globalThis.testAssignment?[{id,created_by:id,assigned_to:id,title:'모아온 백그라운드 알림 시험',status:'OPEN',revision:1,checklist:[]}]:[],events:globalThis.testAssignment?[{id:1,task_id:id}]:[]}});}
  if(url.endsWith('/api/orders/live-refresh')){globalThis.testCalls.orders++;return Response.json({ok:true,cafe24:{status:'SUCCESS'},requests:{}});}
  if(url.endsWith('/api/customer-service/sync')){globalThis.testCalls.cs++;return Response.json({ok:true,jobs:[]},{status:202});}
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };
});
require('./isolated-bootstrap.cjs');
