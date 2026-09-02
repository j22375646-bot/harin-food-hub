'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const removal=require('../lib/calendar/calendar-entry-removal.js');

test('캘린더 항목 삭제는 화면에서 먼저 제거하고 실패하면 중복 없이 복원한다',()=>{
  const entries=[
    {id:'schedule-1',title:'출고 일정'},
    {id:'memo-1',title:'포장 메모'},
    {id:'event-1',title:'사은품 이벤트'}
  ];
  const transition=removal.beginCalendarEntryRemoval(entries,'memo-1');
  assert.deepEqual(transition.entries.map(item=>item.id),['schedule-1','event-1']);
  assert.deepEqual(transition.removed,{entry:entries[1],index:1});

  const restored=removal.rollbackCalendarEntryRemoval(transition.entries,transition.removed);
  assert.deepEqual(restored,entries);
  assert.deepEqual(removal.rollbackCalendarEntryRemoval(restored,transition.removed),entries);
});
