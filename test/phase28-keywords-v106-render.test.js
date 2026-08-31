'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('server owns the keywords adapter only on the real keyword route',()=>{
  const page=read('app/dashboard-route.js');
  assert.match(page,/phase28Runtime\.activePages\.includes\('keywords'\)&&initialState\.view==='keyword'/);
  assert.match(page,/buildPhase28KeywordsModel\(dashboardData,\{platform:initialState\.platform,workspace:initialState\.workspace\}\)/);
  assert.match(page,/keywords:null,adapter_status:'ERROR'/);
});

test('Phase 28 app renders the V106 keyword flow, workbench, and decision desk',()=>{
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/_phase28/pages/keywords-page.js');
  assert.match(app,/const Phase28KeywordsPage=dynamic\(\(\)=>import\('\.\/pages\/keywords-page\.js'\)/);
  assert.match(app,/routeId==='keywords'/);
  assert.match(page,/data-phase28-page="keywords"/);
  assert.match(page,/광고비가 주문으로 이어지는 흐름/);
  assert.match(page,/주문 없이 쓴 광고비/);
  assert.match(page,/키워드 운영표/);
  assert.match(page,/수정 입찰가/);
  assert.match(page,/KEYWORD DECISION DESK/);
  assert.match(page,/Phase28RightRailLayout/);
});

test('keyword page uses the fixed Phase 28 section canvas without inheriting legacy main padding',()=>{
  const page=read('app/_phase28/pages/keywords-page.js');
  const css=read('app/_phase28/pages/keywords-page.css');
  assert.match(page,/return <section className="p28Keywords"/);
  assert.doesNotMatch(page,/return <main className="p28Keywords"/);
  assert.match(page,/className="kpIntro"/);
  assert.match(css,/\.kpIntro\{/);
});

test('keyword channel mode card grows with its readable copy instead of clipping it',()=>{
  const css=read('app/_phase28/pages/keywords-page.css');
  const cardRule=css.match(/\.kpChannelMode\{([^}]+)\}/)?.[1]||'';
  const copyRule=css.match(/(?:^|})\.kpChannelMode>span p\{([^}]+)\}/)?.[1]||'';
  assert.match(cardRule,/(?:^|;)height:auto(?:;|$)/);
  assert.doesNotMatch(cardRule,/(?:^|;)height:112px(?:;|$)/);
  assert.doesNotMatch(cardRule,/overflow:hidden/);
  assert.match(copyRule,/word-break:keep-all/);
  assert.match(copyRule,/overflow-wrap:anywhere/);
});

test('keyword workbench progressively reveals large result sets like the orders page',()=>{
  const page=read('app/_phase28/pages/keywords-page.js');
  const css=read('app/_phase28/pages/keywords-page.css');
  assert.match(page,/visibleRows\.slice\(0,showCount\)/);
  assert.match(page,/키워드 .*건 더 보기/);
  assert.match(css,/\.kpMore\{/);
});

test('keyword workbench keeps the campaign column focused and omits product-link presentation',()=>{
  const page=read('app/_phase28/pages/keywords-page.js');
  assert.match(page,/<span>캠페인<\/span>/);
  assert.match(page,/className="kpCampaign"/);
  assert.match(page,/placeholder="키워드·캠페인 검색"/);
  assert.doesNotMatch(page,/캠페인·상품/);
  assert.doesNotMatch(page,/row\.product/);
  assert.doesNotMatch(page,/row\.adgroup\?/);
});

test('keyword table and decision desk keep their own layout boundaries',()=>{
  const css=read('app/_phase28/pages/keywords-page.css');
  assert.match(css,/\.kpCampaign/);
  assert.match(css,/\.kpTable\{min-width:1080px/);
  assert.match(css,/aside\[aria-label="키워드 판단 패널"\]\{max-height:calc/);
  assert.match(css,/scrollbar-gutter:stable/);
  assert.match(css,/@media \(max-width:1480px\)[\s\S]*order:-1/);
});

test('keyword bid changes preserve the existing owner-confirmed proposal and verification route',()=>{
  const page=read('app/_phase28/pages/keywords-page.js');
  assert.match(page,/fetch\('\/api\/naver\/bid-proposals'/);
  assert.match(page,/CONFIRM_EXECUTE/);
  assert.match(page,/snapshot_token/);
  assert.match(page,/owner_desired_bid/);
  assert.match(page,/idempotency-key/);
  assert.match(page,/external_execution_locked|실제 반영/);
  assert.doesNotMatch(page,/NEXT_PUBLIC_.*KEY/);
});

test('V106 keyword CSS keeps readable fixed UI and neutral balanced selection',()=>{
  const css=read('app/_phase28/pages/keywords-page.css');
  assert.match(css,/max-width:2300px/);
  assert.match(css,/min-height:104px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:17px/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});

test('keyword performance flow keeps its labels, values, and decision summary owner-readable',()=>{
  const css=read('app/_phase28/pages/keywords-page.css');
  assert.match(css,/\.kpFlow>header h2\{[^}]*font-size:28px[^}]*font-weight:900/);
  assert.match(css,/\.kpFlow>header p\{[^}]*font-size:15px/);
  assert.match(css,/\.kpFlowStages article>span\{[^}]*font-size:15px/);
  assert.match(css,/\.kpFlowStages article>strong\{[^}]*font-size:28px[^}]*font-weight:900/);
  assert.match(css,/\.kpFlowStages article>small\{[^}]*font-size:14px/);
  assert.match(css,/\.kpWaste span small\{[^}]*font-size:15px/);
  assert.match(css,/\.kpWaste span strong\{[^}]*font-size:26px[^}]*font-weight:900/);
  assert.match(css,/\.kpWaste span em\{[^}]*font-size:14px/);
  assert.match(css,/\.kpDistribution>header span strong\{font-size:16px/);
  assert.match(css,/\.kpDistribution>header>b\{[^}]*font-size:20px[^}]*font-weight:900/);
  assert.match(css,/\.kpDistribution>div small\{[^}]*font-size:14px/);
  assert.match(css,/\.kpDistribution>div strong\{[^}]*font-size:18px[^}]*font-weight:900/);
  assert.match(css,/@media \(max-width:760px\)\{[\s\S]*\.kpFlow>header h2\{font-size:26px\}[\s\S]*\.kpFlowStages article>strong\{font-size:26px;line-height:32px\}/);
});
