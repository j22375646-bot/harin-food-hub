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
  assert.match(page,/일정과 판매 이벤트/);
  assert.match(page,/CREATE_ENTRY/);
  assert.match(page,/UPDATE_ENTRY/);
  assert.match(page,/TOGGLE_ENTRY/);
  assert.match(page,/ARCHIVE_ENTRY/);
  assert.match(api,/hub_work_items/);
  assert.match(api,/context_href','\/calendar'/);
  assert.match(api,/revalidatePath\('\/orders'\)/);
  assert.match(home,/오늘 일정과 판매 이벤트/);
  assert.match(home,/onNavigate\('calendar'\)/);
  assert.match(page,/form\.type==='EVENT'/);
  assert.match(page,/giftTiers/);
  assert.match(page,/금액대별 사은품/);
  assert.match(page,/자동 판정 미리보기/);
  assert.match(page,/가장 높은 구간 하나/);
  assert.match(home,/item\.type==='EVENT'/);
});

test('주문 화면은 캘린더 이벤트 개정값을 가볍게 확인해 열린 화면도 자동 갱신한다',()=>{
  const revisionApi=read('app/api/calendar/events/revision/route.js');
  const orders=read('app/_phase28/pages/orders-page.js');
  assert.match(revisionApi,/isAuthorized/);
  assert.match(revisionApi,/context_label','캘린더 이벤트%'/);
  assert.match(revisionApi,/updated_at/);
  assert.match(revisionApi,/force-dynamic/);
  assert.match(orders,/CALENDAR_EVENT_REFRESH_INTERVAL_MS/);
  assert.match(orders,/\/api\/calendar\/events\/revision/);
  assert.match(orders,/router\.refresh\(\)/);
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

test('월간 날짜 칸은 큰 화면에서도 충분한 높이와 일정별 색상 띠를 유지한다',()=>{
  const page=read('app/_phase28/pages/calendar-page.js');
  const css=read('app/_phase28/pages/calendar-page.css');
  assert.match(page,/function calendarEntryTone/);
  assert.match(page,/data-tone=\{calendarEntryTone\(item\)\}/);
  assert.match(css,/\.calendarPage \.calendarDay\{[^}]*min-height:clamp\(168px,10vw,210px\)/);
  assert.match(css,/\.calendarDayEntries i\[data-tone="BLUE"\]/);
  assert.match(css,/\.calendarDayEntries i\[data-tone="CORAL"\]/);
  assert.match(css,/\.calendarDayEntries i\[data-tone="MINT"\]/);
  assert.match(css,/\.calendarDayEntries i\[data-tone="VIOLET"\]/);
  assert.match(css,/\.calendarDayEntries i\[data-tone="AMBER"\]/);
});

test('캘린더는 주말과 공식 공휴일, 시작일과 종료일을 잇는 띠를 표시한다',()=>{
  const page=read('app/_phase28/pages/calendar-page.js');
  const css=read('app/_phase28/pages/calendar-page.css');
  const api=read('app/api/calendar/entries/route.js');
  assert.match(page,/name="endDate"/);
  assert.match(page,/data-weekend=/);
  assert.match(page,/data-holiday=/);
  assert.match(page,/data-range-position=\{item\.rangePosition\}/);
  assert.match(page,/holiday\.name/);
  assert.match(css,/\.calendarDay\[data-weekend="SUNDAY"\]/);
  assert.match(css,/\.calendarDayEntries i\[data-range-position="MIDDLE"\]/);
  assert.match(api,/shipping_reference_snapshots/);
  assert.match(api,/buildHolidayCalendar/);
});

test('이벤트 입력석은 이상·이하 금액 구간과 고정 중요도를 깨지지 않게 표시한다',()=>{
  const page=read('app/_phase28/pages/calendar-page.js');
  const css=read('app/_phase28/pages/calendar-page.css');
  assert.match(page,/minimumAmount/);
  assert.match(page,/maximumAmount/);
  assert.match(page,/이상 금액/);
  assert.match(page,/이하 금액/);
  assert.match(page,/calendarPriorityLocked/);
  assert.match(page,/판매 이벤트는 중요로 고정/);
  assert.match(page,/className="eventGiftAdd"/);
  assert.match(css,/\.eventGiftAdd\{[^}]*min-width:84px[^}]*white-space:nowrap/);
});
