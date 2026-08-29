'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 시스템은 전용 경량 로더와 공통 셸로 canonical route를 소유한다',()=>{
  const page=read('app/data-collection/page.js');
  const layout=read('app/data-collection/layout.js');
  assert.match(page,/loadPhase28SystemSnapshot/);
  assert.match(page,/buildPhase28SystemModel/);
  assert.match(page,/Phase28SystemPage/);
  assert.match(page,/phase28RuntimeConfig/);
  assert.match(layout,/Phase28Shell/);
  assert.match(layout,/routeId="system"/);
  assert.doesNotMatch(page,/renderDashboardRoute\('collection'.*activePages\.includes\('system'/s);
  const legacyWorkspaces=['advertising','execution-paths','naver-api','operations-health','optional-providers','owned-site','provider-fallback','provider-runtime','shipping-reference'];
  for(const workspace of legacyWorkspaces)assert.match(read(`app/data-collection/${workspace}/page.js`),/redirectLegacySystemWorkspace/);
});

test('V106 시스템은 네 작업공간, 다섯 흐름, 핵심 여섯 연결과 지연 상세를 렌더링한다',()=>{
  const page=read('app/_phase28/pages/system-page.js');
  for(const label of ['핵심 연결','받는 자료','작업·스케줄','오류·복구'])assert.match(page,new RegExp(label));
  for(const label of ['외부 API','읽기 검증','수집 작업','Supabase 저장','허브 반영'])assert.match(page,new RegExp(label));
  for(const label of ['Cafe24','네이버 검색광고','네이버 커머스','쿠팡','우체국택배','Supabase'])assert.match(page,new RegExp(label));
  for(const label of ['Vercel Cron','서울 고정 IP 워커','systemd','Supabase 워치독'])assert.match(page,new RegExp(label));
  for(const label of ['이전 성공 자료','재시도 대기','DEAD_LETTER','읽기 전용 점검'])assert.match(page,new RegExp(label));
  assert.match(page,/fetch\(`\/api\/system\/providers\/\$\{encodeURIComponent\(serviceId\)\}`/);
  assert.match(page,/detailCache/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/Phase28ChannelLogo/);
  assert.doesNotMatch(page,/Brave Search|Clova OCR|Semrush|DeepL|Google Trends Alpha|공공조달|썸트렌드/);
});

test('시스템 상세 API는 인증·허용목록·단건 정규화를 지킨다',()=>{
  const route=read('app/api/system/providers/[providerId]/route.js');
  assert.match(route,/validateSession/);
  assert.match(route,/await params/);
  assert.match(route,/CORE_SERVICE_IDS/);
  assert.match(route,/loadPhase28SystemSnapshot/);
  assert.match(route,/buildPhase28SystemProviderDetail/);
  assert.doesNotMatch(route,/SUPABASE_SERVICE_ROLE_KEY|access_token|refresh_token/);
});

test('시스템 CSS는 고정 읽기 크기, 균형 선택, 모바일과 절제된 동작을 지킨다',()=>{
  const css=read('app/_phase28/pages/system-page.css');
  assert.match(css,/max-width:\s*2300px/);
  assert.match(css,/min-height:\s*(?:44|46|48)px/);
  assert.match(css,/@media\s*\(max-width:\s*760px\)/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/i);
  assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/i);
});
