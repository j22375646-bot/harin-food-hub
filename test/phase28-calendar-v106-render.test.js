'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('캘린더 화면은 실제 저장 CRUD와 메인 오늘 연동을 연결한다',()=>{
  const page=read('app/_phase28/pages/calendar-page.js');
  const api=read('app/api/calendar/entries/route.js');
  const home=read('app/_phase28/pages/home-page.js');
  assert.match(page,/한 달의 일정과 메모/);
  assert.match(page,/CREATE_ENTRY/);
  assert.match(page,/UPDATE_ENTRY/);
  assert.match(page,/TOGGLE_ENTRY/);
  assert.match(page,/ARCHIVE_ENTRY/);
  assert.match(api,/hub_work_items/);
  assert.match(api,/context_href','\/calendar'/);
  assert.match(home,/오늘 일정과 메모/);
  assert.match(home,/onNavigate\('calendar'\)/);
});

test('캘린더는 선택 달만 지연 조회하고 고정 UI 규칙을 지킨다',()=>{
  const page=read('app/_phase28/pages/calendar-page.js');
  const css=read('app/_phase28/pages/calendar-page.css');
  assert.match(page,/\/api\/calendar\/entries\?from=/);
  assert.match(page,/loadedMonths/);
  assert.match(css,/max-width:2300px/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/);
});
