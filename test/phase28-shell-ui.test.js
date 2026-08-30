'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('V106 shell owns navigation without legacy shell imports',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  assert.match(shell,/Phase28IntentLink/);
  assert.match(shell,/오늘 회사 활력/);
  assert.match(shell,/운영 확인 항목 기준/);
  assert.match(shell,/aria-label="허브 메뉴"/);
  assert.match(shell,/aria-label="모바일 주요 메뉴"/);
  assert.match(shell,/<Phase28IntentLink href="\/" className=\{styles\.brand\} aria-label="하린식품 홈\(오늘\)으로 이동">/);
  assert.match(shell,/aria-current=\{active\?'page':undefined\}/);
  assert.doesNotMatch(shell,/HarinAppShell|HarinSidebar|HarinMobileNavigation/);
});

test('V106 shell retains command search and evidence access',()=>{
  const palette=read('app/_phase28/phase28-command-palette.js');
  const evidence=read('app/_phase28/phase28-evidence-drawer.js');
  assert.match(palette,/role="dialog"/);
  assert.match(palette,/aria-modal="true"/);
  assert.match(palette,/item\.description/);
  assert.match(evidence,/자료 근거/);
  assert.match(evidence,/generatedAt/);
  assert.match(evidence,/role="dialog"/);
});

test('shared top bar clock follows live Korea time without polling operational APIs',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  assert.match(shell,/const \[liveTime,setLiveTime\]=useState\(null\)/);
  assert.match(shell,/timeZone:'Asia\/Seoul'/);
  assert.match(shell,/delayUntilNextMinute=60000-\(Date\.now\(\)%60000\)\+50/);
  assert.match(shell,/window\.setInterval\(tick,60000\)/);
  assert.match(shell,/window\.clearInterval\(intervalId\)/);
  assert.match(shell,/aria-label="현재 한국시간"/);
  assert.match(shell,/formatLiveTime\(liveTime\)/);
  assert.doesNotMatch(shell,/setInterval\([^)]*router\.refresh/);
});

test('shared evidence control stays a horizontal single-line chip on every desktop route',()=>{
  const css=read('app/_phase28/phase28-shell.module.css');
  assert.match(css,/\.evidenceButton\{[^}]*min-width:128px[^}]*display:inline-flex[^}]*align-items:center[^}]*white-space:nowrap/);
  assert.doesNotMatch(css,/\.evidenceButton\{[^}]*display:grid/);
  assert.match(css,/\.evidenceButton span::after\{[^}]*width:1px[^}]*height:14px/);
});

test('V106 shell reuses the newest authoritative Main snapshot across routes',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/page.js');
  assert.match(shell,/operation-snapshot\.js/);
  assert.match(shell,/NAVIGATION_SNAPSHOT_KEY/);
  assert.match(shell,/parseNavigationOperationSnapshot\(window\.localStorage\.getItem\(NAVIGATION_SNAPSHOT_KEY\)\)/);
  assert.match(shell,/NAVIGATION_SNAPSHOT_COOKIE/);
  assert.match(shell,/serializeNavigationOperationSnapshotCookie\(incomingSnapshot\)/);
  assert.match(shell,/document\.cookie=/);
  assert.match(shell,/selectNavigationOperationSnapshot/);
  assert.match(page,/parseNavigationOperationSnapshotCookie\(\s*cookieStore\.get\(operationSnapshotModule\.NAVIGATION_SNAPSHOT_COOKIE\)\?\.value\s*\)/);
  assert.match(page,/fallbackNavigationSnapshot/);
  assert.match(app,/navigationSnapshot=\{navigationSnapshot\}/);
  assert.doesNotMatch(app,/navigationSnapshot\?\.badges\|\|\{\}/);
});

test('standalone lightweight routes receive the same verified navigation snapshot',()=>{
  const routeShell=read('app/_phase28/phase28-route-shell.js');
  assert.match(routeShell,/await cookies\(\)/);
  assert.match(routeShell,/parseNavigationOperationSnapshotCookie/);
  assert.match(routeShell,/navigationSnapshot=\{navigationSnapshot\}/);
  for(const directory of ['notifications','diagnoses','approvals','execution-validation','ab-tests','ai-knowledge','data-collection','market-intelligence','product-analysis']){
    const layout=read(`app/${directory}/layout.js`);
    assert.match(layout,/Phase28RouteShell/);
    assert.doesNotMatch(layout,/navigationSnapshot=\{null\}|<Phase28Shell/);
  }
});

test('V106 shell carries per-route prefetch policy through every navigation surface',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  const palette=read('app/_phase28/phase28-command-palette.js');
  const intentLink=read('app/_phase28/phase28-intent-link.js');
  assert.ok((shell.match(/prefetchPolicy=\{item\.prefetch\}/g)||[]).length>=3);
  assert.match(palette,/prefetchPolicy=\{item\.prefetch\}/);
  assert.match(intentLink,/prefetch=\{canPrefetch\?\(intentDetected\?true:false\):false\}/);
  assert.match(intentLink,/onMouseEnter=\{event=>\{prepareRoute\(\)/);
  assert.match(intentLink,/onFocus=\{event=>\{prepareRoute\(\)/);
  assert.match(intentLink,/onTouchStart=\{event=>\{prepareRoute\(\)/);
  assert.match(intentLink,/const canPrefetch=prefetchPolicy!==false/);
});

test('shared shell shows delayed non-blocking route feedback without a fullscreen overlay',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  const css=read('app/_phase28/phase28-shell.module.css');
  const layout=read('app/layout.js');
  assert.match(shell,/onClickCapture=\{beginRouteNavigation\}/);
  assert.match(shell,/role="status" aria-live="polite"/);
  assert.match(shell,/페이지 이동 중/);
  assert.match(shell,/window\.setTimeout\(finishRouteNavigation,15000\)/);
  assert.match(shell,/window\.location\.href!==startingUrl/);
  assert.match(shell,/PHASE28_NAVIGATION_START_EVENT/);
  assert.match(css,/\.routeProgress\{[^}]*position:fixed[^}]*height:3px[^}]*pointer-events:none/);
  assert.match(css,/routeProgressReveal 1ms 120ms both/);
  assert.match(css,/@media \(max-width:980px\)\{[\s\S]*\.routeProgress\{[^}]*left:0/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*\.routeProgress\[data-active="true"\]\{[^}]*opacity:1/);
  assert.doesNotMatch(css,/\.routeProgress\{[^}]*inset:0/);
  assert.match(layout,/data-scroll-behavior="smooth"/);
});

test('button-driven Phase 28 route changes share the same feedback event',()=>{
  const feedback=read('app/_phase28/phase28-navigation-feedback.js');
  assert.match(feedback,/window\.dispatchEvent\(new Event\(PHASE28_NAVIGATION_START_EVENT\)\)/);
  assert.match(feedback,/destination\.pathname===current\.pathname&&destination\.search===current\.search&&destination\.hash===current\.hash/);
  assert.match(feedback,/router\.push\(href\)/);
  for(const file of ['phase28-app.js','pages/experiments-page.js','pages/inventory-products-page.js','pages/keywords-page.js','pages/settlement-page.js']){
    const source=read(`app/_phase28/${file}`);
    assert.match(source,/pushPhase28Route/);
    assert.doesNotMatch(source,/router\.push\(/);
  }
});

test('record workflow links do not warm sibling low-frequency pages',()=>{
  for(const file of ['diagnoses-page.js','changes-page.js','validation-page.js','experiments-page.js']){
    const source=read(`app/_phase28/pages/${file}`);
    assert.match(source,/prefetch=\{false\}/);
  }
});

test('V106 shell preserves readable responsive and balanced-selection rules',()=>{
  const css=[read('app/_phase28/phase28-shell.module.css'),read('app/_phase28/phase28-tokens.module.css')].join('\n');
  assert.match(css,/--p28-gutter:clamp\(34px,3vw,72px\)/);
  assert.match(css,/@media \(max-width:980px\)/);
  assert.match(css,/@media \(max-width:620px\)/);
  assert.match(css,/min-height:44px/);
  assert.doesNotMatch(css,/border-left\s*:/);
});

test('V106 desktop navigation keeps scrolling without exposing a draggable rail',()=>{
  const shell=read('app/_phase28/phase28-shell.js');
  const css=read('app/_phase28/phase28-shell.module.css');
  assert.match(shell,/className=\{styles\.sidebarScrollArea\}/);
  assert.match(shell,/data-can-scroll-down/);
  assert.match(css,/\.sidebarScrollArea\{[^}]*overflow-y:auto/);
  assert.match(css,/\.sidebarScrollArea\{[^}]*scrollbar-width:none/);
  assert.match(css,/\.sidebarScrollArea::-webkit-scrollbar\{display:none/);
  assert.match(css,/\.sidebar\{[^}]*overflow:hidden/);
});
