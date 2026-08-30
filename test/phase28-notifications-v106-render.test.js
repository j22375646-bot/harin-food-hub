'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 알림은 전용 경량 로더와 공통 셸로 canonical route를 소유한다',()=>{
  const route=read('app/notifications/page.js');
  const layout=read('app/notifications/layout.js');
  assert.match(route,/loadPhase28NotificationSnapshot/);
  assert.match(route,/buildPhase28NotificationsModel/);
  assert.match(route,/Phase28NotificationsPage/);
  assert.match(route,/phase28RuntimeConfig/);
  assert.match(layout,/Phase28RouteShell/);
  assert.match(layout,/routeId="notifications"/);
});

test('V106 알림은 발견·확인·처리·기록과 다섯 상태 필터를 렌더링한다',()=>{
  const page=read('app/_phase28/pages/notifications-page.js');
  for(const label of ['발견','확인','처리','기록'])assert.match(page,new RegExp(label));
  for(const label of ['열림','1시간 숨김','확인','해결','전체'])assert.match(page,new RegExp(label));
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/Phase28ChannelLogo/);
  assert.match(page,/\/api\/alerts\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(page,/\/api\/notifications\/settings/);
  assert.match(page,/\/api\/notifications\/send/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/detailsCache|deliveryCache/);
  assert.match(page,/dataUnavailable\?'확인 필요'/);
  assert.match(page,/알림 목록을 확인할 수 없습니다/);
  assert.doesNotMatch(page,/useEffect\([^]*\/api\/notifications\/settings/);
});

test('알림 CSS는 고정 읽기 크기, 균형 선택, 모바일과 절제된 동작을 지킨다',()=>{
  const css=read('app/_phase28/pages/notifications-page.css');
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.match(css,/border:\s*1px solid transparent/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
