'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const calendar=require('../lib/calendar/calendar-center.js');

test('캘린더는 한국 날짜와 시간으로 저장 입력을 정규화한다',()=>{
  const entry=calendar.normalizeEntryInput({type:'SCHEDULE',title:'택배 마감',body:'송장 확인',date:'2026-08-31',time:'14:30',priority:'HIGH'});
  assert.deepEqual(entry,{type:'SCHEDULE',title:'택배 마감',body:'송장 확인',date:'2026-08-31',endDate:'2026-08-31',time:'14:30',priority:'HIGH',dueAt:'2026-08-31T05:30:00.000Z',contextLabel:'캘린더'});
  assert.equal(calendar.decorateEntry({id:'1',item_type:'TASK',title:'택배 마감',due_at:entry.dueAt}).time,'14:30');
});

test('일정은 시작일과 종료일을 함께 저장하고 다시 같은 범위로 연다',()=>{
  const entry=calendar.normalizeEntryInput({type:'SCHEDULE',title:'추석 기획전',date:'2026-09-21',endDate:'2026-09-27',time:'09:00'});
  assert.equal(entry.endDate,'2026-09-27');
  assert.equal(entry.contextLabel,'캘린더 · 종료 2026-09-27');
  const decorated=calendar.decorateEntry({id:'range-1',item_type:'TASK',title:'추석 기획전',due_at:entry.dueAt,context_label:entry.contextLabel,status:'OPEN'});
  assert.equal(decorated.date,'2026-09-21');
  assert.equal(decorated.endDate,'2026-09-27');
  assert.throws(()=>calendar.normalizeEntryInput({type:'SCHEDULE',title:'역순 일정',date:'2026-09-27',endDate:'2026-09-21'}),/종료일은 시작일보다 빠를 수 없/);
});

test('이벤트는 기간과 금액대별 사은품 규칙을 서버 저장 형식으로 왕복한다',()=>{
  const entry=calendar.normalizeEntryInput({
    type:'EVENT',title:'추석 감사 이벤트',body:'결제 금액에 맞춰 사은품을 동봉합니다.',
    date:'2026-09-14',endDate:'2026-09-30',eventColor:'CORAL',
    giftTiers:[
      {minimumAmount:50000,giftName:'작두콩차 1봉',quantity:1},
      {minimumAmount:30000,giftName:'보리차 티백',quantity:2}
    ]
  });
  assert.equal(entry.contextLabel,'캘린더 이벤트 · 종료 2026-09-30');
  assert.deepEqual(entry.giftTiers,[
    {minimumAmount:30000,giftName:'보리차 티백',quantity:2},
    {minimumAmount:50000,giftName:'작두콩차 1봉',quantity:1}
  ]);
  const storedBody=calendar.encodeEventBody(entry);
  const restored=calendar.decorateEntry({
    id:'event-1',item_type:'TASK',title:entry.title,body:storedBody,due_at:entry.dueAt,
    context_label:entry.contextLabel,status:'OPEN',priority:'HIGH'
  });
  assert.equal(restored.type,'EVENT');
  assert.equal(restored.body,'결제 금액에 맞춰 사은품을 동봉합니다.');
  assert.equal(restored.eventColor,'CORAL');
  assert.deepEqual(restored.giftTiers,entry.giftTiers);
});

test('이벤트 자동화는 행사 기간에 주문금액이 충족한 가장 높은 사은품 한 구간을 고른다',()=>{
  const event={
    id:'event-1',type:'EVENT',title:'추석 감사 이벤트',status:'OPEN',date:'2026-09-14',endDate:'2026-09-30',
    giftTiers:[
      {minimumAmount:30000,giftName:'보리차 티백',quantity:2},
      {minimumAmount:50000,giftName:'작두콩차 1봉',quantity:1}
    ]
  };
  assert.deepEqual(calendar.resolveEventGift(event,{orderAmount:54000,date:'2026-09-20'}),{
    eventId:'event-1',eventTitle:'추석 감사 이벤트',minimumAmount:50000,giftName:'작두콩차 1봉',quantity:1
  });
  assert.equal(calendar.resolveEventGift(event,{orderAmount:54000,date:'2026-10-01'}),null);
  assert.equal(calendar.resolveEventGift(event,{orderAmount:20000,date:'2026-09-20'}),null);
});

test('여러 날 일정은 월간 날짜마다 이어지는 띠 위치를 만든다',()=>{
  const entry={id:'range-1',type:'SCHEDULE',title:'기획전',date:'2026-09-04',endDate:'2026-09-08',time:'09:00',status:'OPEN'};
  const byDate=calendar.expandEntriesByDate([entry]);
  assert.equal(byDate['2026-09-04'][0].rangePosition,'START');
  assert.equal(byDate['2026-09-05'][0].rangePosition,'END');
  assert.equal(byDate['2026-09-06'][0].rangePosition,'START');
  assert.equal(byDate['2026-09-07'][0].rangePosition,'MIDDLE');
  assert.equal(byDate['2026-09-08'][0].rangePosition,'END');
});

test('저장된 공식 공휴일은 달력 날짜 키와 이름으로 정리한다',()=>{
  const calendarModel=calendar.buildHolidayCalendar({
    snapshots:[
      {provider:'HOLIDAY_CALENDAR',status:'SUCCESS',reference_year:2026,fetched_at:'2026-01-01T00:00:00Z',source_data:{holidays:[{date:'20260815',name:'광복절'}]}},
      {provider:'HOLIDAY_CALENDAR',status:'SUCCESS',reference_year:2026,fetched_at:'2026-08-01T00:00:00Z',source_data:{holidays:[{date:'20260925',name:'추석'}]}}
    ],
    from:'2026-08-30',to:'2026-10-03'
  });
  assert.deepEqual(calendarModel.holidays,[{date:'2026-09-25',name:'추석'}]);
  assert.equal(calendarModel.ready,true);
  assert.deepEqual(calendarModel.missingYears,[]);
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
  assert.deepEqual(today.summary,{total:2,schedules:1,memos:1,events:0,open:1,done:0});
});

test('메인 오늘 캘린더에는 기간 중인 이벤트가 자동으로 포함된다',()=>{
  const event=calendar.normalizeEntryInput({type:'EVENT',title:'가을 사은품',date:'2026-08-28',endDate:'2026-09-05',giftTiers:[{minimumAmount:30000,giftName:'티백',quantity:1}]});
  const today=calendar.buildTodayCalendar([{id:'event-1',item_type:'TASK',title:event.title,body:calendar.encodeEventBody(event),due_at:event.dueAt,context_label:event.contextLabel,status:'OPEN'}],'2026-08-31T10:00:00+09:00');
  assert.equal(today.items[0].type,'EVENT');
  assert.equal(today.items[0].eventState,'ACTIVE');
  assert.deepEqual(today.summary,{total:1,schedules:0,memos:0,events:1,open:0,done:0});
});

test('메인 오늘 항목은 중요도가 높은 메모를 대표로 먼저 표시한다',()=>{
  const rows=[
    {id:'normal',item_type:'NOTE',title:'보통 메모',priority:'NORMAL',due_at:'2026-08-30T15:00:00.000Z',status:'OPEN'},
    {id:'low',item_type:'NOTE',title:'낮은 메모',priority:'LOW',due_at:'2026-08-30T15:00:00.000Z',status:'OPEN'},
    {id:'high',item_type:'NOTE',title:'중요 메모',priority:'HIGH',due_at:'2026-08-30T15:00:00.000Z',status:'OPEN'}
  ];
  const today=calendar.buildTodayCalendar(rows,'2026-08-31T10:00:00+09:00');
  assert.deepEqual(today.items.map(item=>item.title),['중요 메모','보통 메모','낮은 메모']);
});

test('잘못된 날짜와 빈 제목은 저장 전에 거절한다',()=>{
  assert.throws(()=>calendar.normalizeEntryInput({title:'',date:'2026-02-30'}),/날짜를 확인/);
  assert.throws(()=>calendar.normalizeEntryInput({title:'',date:'2026-08-31'}),/제목을 입력/);
});
