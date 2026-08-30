'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const calendar=require('../lib/calendar/calendar-center.js');

test('캘린더는 한국 날짜와 시간으로 저장 입력을 정규화한다',()=>{
  const entry=calendar.normalizeEntryInput({type:'SCHEDULE',title:'택배 마감',body:'송장 확인',date:'2026-08-31',time:'14:30',priority:'HIGH'});
  assert.deepEqual(entry,{type:'SCHEDULE',title:'택배 마감',body:'송장 확인',date:'2026-08-31',time:'14:30',priority:'HIGH',dueAt:'2026-08-31T05:30:00.000Z'});
  assert.equal(calendar.decorateEntry({id:'1',item_type:'TASK',title:'택배 마감',due_at:entry.dueAt}).time,'14:30');
});

test('메모는 선택 날짜의 하루 기록으로 저장된다',()=>{
  const entry=calendar.normalizeEntryInput({type:'MEMO',title:'사장님 메모',date:'2026-08-31',time:'17:30'});
  assert.equal(entry.time,'');
  assert.equal(entry.dueAt,'2026-08-30T15:00:00.000Z');
  const decorated=calendar.decorateEntry({id:'2',item_type:'NOTE',title:'사장님 메모',due_at:entry.dueAt,status:'OPEN'});
  assert.equal(decorated.type,'MEMO');
  assert.equal(decorated.allDay,true);
});

test('월 화면은 앞뒤 주까지 포함하고 오늘 항목만 메인으로 분리한다',()=>{
  assert.deepEqual(calendar.visibleMonthRange('2026-08'),{month:'2026-08',start:'2026-07-26',end:'2026-09-05',endExclusive:'2026-09-06'});
  const rows=[
    {id:'1',item_type:'TASK',title:'일정',due_at:'2026-08-31T01:00:00.000Z',status:'OPEN'},
    {id:'2',item_type:'NOTE',title:'메모',due_at:'2026-08-30T15:00:00.000Z',status:'OPEN'},
    {id:'3',item_type:'TASK',title:'내일',due_at:'2026-08-31T15:00:00.000Z',status:'OPEN'}
  ];
  const today=calendar.buildTodayCalendar(rows,'2026-08-31T10:00:00+09:00');
  assert.deepEqual(today.items.map(item=>item.title),['메모','일정']);
  assert.deepEqual(today.summary,{total:2,schedules:1,memos:1,open:1,done:0});
});

test('잘못된 날짜와 빈 제목은 저장 전에 거절한다',()=>{
  assert.throws(()=>calendar.normalizeEntryInput({title:'',date:'2026-02-30'}),/날짜를 확인/);
  assert.throws(()=>calendar.normalizeEntryInput({title:'',date:'2026-08-31'}),/제목을 입력/);
});
