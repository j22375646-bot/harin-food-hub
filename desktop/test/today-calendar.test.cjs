'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('today calendar uses Korean day and projects bounded display fields only',()=>{
 const {calendarDay,projectCalendar}=require('../today-calendar.cjs');
 assert.equal(calendarDay(new Date('2026-09-09T16:00:00Z')),'2026-09-10');
 const result=projectCalendar({ok:true,range:{from:'2026-09-10',to:'2026-09-10'},entries:[{id:'a',type:'SCHEDULE',title:'발주 확인',date:'2026-09-09',endDate:'2026-09-11',time:'09:00',status:'DONE',body:'private'}]},'2026-09-10');
 assert.equal(result.status,'READY');assert.equal(result.entries.length,1);assert.equal(result.entries[0].status,'DONE');assert.equal(result.entries[0].body,undefined);
 assert.equal(projectCalendar({ok:true,range:{from:'2026-09-09',to:'2026-09-09'},entries:[]},'2026-09-10').status,'UNAVAILABLE');
});
test('malformed or duplicate calendar rows never appear as an empty success',()=>{
 const {projectCalendar}=require('../today-calendar.cjs');
 const base={ok:true,range:{from:'2026-09-10',to:'2026-09-10'}};
 const row={id:'a',type:'MEMO',title:'메모',date:'2026-09-10',endDate:'2026-09-10',time:'',status:'OPEN'};
 for(const entries of [[row,row],[{...row,status:'UNKNOWN'}],[{...row,date:'bad'}]])assert.equal(projectCalendar({...base,entries},'2026-09-10').status,'UNAVAILABLE');
 assert.deepEqual(projectCalendar({...base,entries:[]},'2026-09-10'),{status:'READY',date:'2026-09-10',entries:[]});
});
test('calendar network access requires exact active main-process permit',()=>{
 const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
 const url='https://harin-cafe24-sync.vercel.app/api/calendar/entries?from=2026-09-10&to=2026-09-10';
 assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:0},{calendarPermit:url}),true);
 for(const details of [{url,method:'POST',webContentsId:0},{url,method:'GET',webContentsId:12},{url:url+'&x=1',method:'GET',webContentsId:0}])assert.equal(isAllowedRemoteRequest(details,{calendarPermit:url}),false);
 assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:0}),false);
});
