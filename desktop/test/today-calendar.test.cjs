'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('monthly scan completeness is explicit and incomplete today reads are rejected',()=>{
 const {projectMonth,projectCalendar}=require('../today-calendar.cjs');
 const p={ok:true,entries:[],range:{from:'2026-09-01',to:'2026-09-30'}};
 assert.equal(projectMonth({...p,complete:true},'2026-09').complete,true);
 assert.equal(projectMonth({...p,complete:false},'2026-09').complete,false);
 assert.equal(projectMonth(p,'2026-09').complete,null);
 assert.equal(projectCalendar({...p,complete:false},p.range.from,p.range.to).status,'UNAVAILABLE');
});
test('monthly projection exposes bounded body and distinguishes missing holiday data',()=>{
 const {projectMonth}=require('../today-calendar.cjs');
 const p={ok:true,range:{from:'2026-09-01',to:'2026-09-30'},entries:[{id:'a',title:'일정',type:'MEMO',status:'OPEN',date:'2026-09-02',time:'',body:'첫 줄\n<img src=x>'}],holidays:[{date:'2026-09-03',name:'시험 휴일',private:'SECRET'}],holidayReady:true};
 const result=projectMonth(p,'2026-09');
 assert.equal(result.entries[0].body,'첫 줄\n<img src=x>');assert.equal(result.holidayReady,true);
 assert.deepEqual(result.holidays,[{date:'2026-09-03',name:'시험 휴일'}]);
 assert.equal(projectMonth({...p,holidayReady:false},'2026-09').holidayReady,false);
 assert.equal(projectMonth({...p,holidays:[{date:'bad',name:'시험'}]},'2026-09').holidayReady,false);
 assert.equal(projectMonth({...p,entries:[{...p.entries[0],body:{private:true}}]},'2026-09').status,'UNAVAILABLE');
});
test('month range covers leap year and rejects arbitrary ranges',()=>{
 const {monthRange,projectMonth}=require('../today-calendar.cjs');
 assert.deepEqual(monthRange('2024-02'),{from:'2024-02-01',to:'2024-02-29'});
 for(const value of ['2024-13','2024-2','2024-02&x=1',null])assert.equal(monthRange(value),null);
 const range=monthRange('2026-09'),row={id:'a',title:'월말 일정',type:'EVENT',status:'OPEN',time:'',date:'2026-09-29',endDate:'2026-10-02'};
 const result=projectMonth({ok:true,range,entries:[row]},'2026-09');assert.equal(result.status,'READY');assert.equal(result.entries.length,1);
 assert.equal(projectMonth({ok:true,range,entries:Array(500).fill(row)},'2026-09').status,'UNAVAILABLE');
});
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
test('monthly network permit rejects arbitrary day ranges and renderer requests',()=>{
 const {isAllowedRemoteRequest}=require('../connection-policy.cjs');
 const url='https://harin-cafe24-sync.vercel.app/api/calendar/entries?from=2024-02-01&to=2024-02-29';
 assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:0},{monthPermit:url}),true);
 for(const other of [url+'&x=1',url.replace('02-29','02-28')])assert.equal(isAllowedRemoteRequest({url:other,method:'GET',webContentsId:0},{monthPermit:other}),false);
 assert.equal(isAllowedRemoteRequest({url,method:'GET',webContentsId:2},{monthPermit:url}),false);
});
