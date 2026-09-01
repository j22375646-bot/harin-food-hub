'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const loaderProfiles=require('../lib/dashboard/page-loader-profiles.js');

test('insight landing queries only the latest Naver weekly reports before limiting',()=>{
  const calls=[];
  let query;
  query=new Proxy({}, {
    get(_target,key){
      if(key==='then')return undefined;
      return (...args)=>{calls.push([key,...args]);return query;};
    }
  });

  assert.equal(typeof loaderProfiles.scopeInsightReportQuery,'function');
  assert.equal(loaderProfiles.scopeInsightReportQuery(query),query);
  assert.deepEqual(calls,[
    ['eq','report_type','WEEKLY'],
    ['eq','is_latest',true],
    ['eq','platform','NAVER'],
    ['order','period_end',{ascending:false}],
    ['order','created_at',{ascending:false}],
    ['limit',24]
  ]);
});

test('V106 insights owns the canonical route and server adapter',()=>{
  const route=read('app/insights/[workspace]/page.js');
  const page=read('app/dashboard-route.js');
  const registry=read('lib/ui/phase28-route-registry.js');
  assert.match(route,/renderDashboardRoute\('insight'/);
  assert.match(route,/workspace==='causes'/);
  assert.match(route,/redirect\('\/insights\/overview'\)/);
  assert.match(registry,/id:'analysis'.*href:'\/insights\/overview'.*adapterId:'insights'/);
  assert.match(page,/activePages\.includes\('analysis'\)&&initialState\.view==='insight'/);
  assert.match(page,/buildPhase28InsightsModel\(dashboardData/);
  assert.match(page,/reports:\[\]/,'V106 초기 클라이언트 페이로드는 원본 보고서 본문을 제거해야 합니다.');
});

test('V106 insights renders a Naver-only owner weekly brief, saved weekly reports, and accumulated weekly diagnoses',()=>{
  const app=read('app/_phase28/phase28-app.js');
  const page=read('app/_phase28/pages/insights-page.js');
  assert.match(app,/Phase28InsightsPage/);
  assert.match(app,/routeId==='analysis'/);
  assert.match(page,/data-phase28-page="insights"/);
  assert.match(page,/return <section className="p28Insights"/,'공통 셸 안에 중첩 main을 만들면 구형 전역 여백이 다시 적용됩니다.');
  assert.doesNotMatch(page,/return <main className="p28Insights"/);
  assert.match(page,/네이버 주간 인사이트/);
  assert.match(page,/사장님 주간 판단/);
  assert.match(page,/\['사장님 브리프','저장 주간 진단','누적 주간 진단'\]/);
  assert.match(page,/이번 주 결정/);
  assert.match(page,/광고 효율/);
  assert.match(page,/위험 신호/);
  assert.match(page,/7일 확인/);
  assert.match(page,/NAVER OWNER DESK/);
  assert.match(page,/Phase28RightRailLayout/);
  assert.match(page,/Phase28ChannelLogo/);
  assert.doesNotMatch(page,/채널 비교|주간·월간 자동 생성/);
  assert.match(page,/window\.history\.pushState/);
  assert.doesNotMatch(page,/useRouter|pushPhase28Route/);
  assert.match(page,/model\.initialWorkspace==='saved'/);
  assert.match(page,/model\.initialWorkspace==='diagnostics'/);
});

test('saved report detail is authenticated, one-report-only, lazy, and cached in the browser',()=>{
  const page=read('app/_phase28/pages/insights-page.js');
  const api=read('app/api/insights/reports/[id]/route.js');
  assert.match(page,/fetch\(`\/api\/insights\/reports\/\$\{encodeURIComponent\(reportId\)\}`/);
  assert.match(page,/detailCache/);
  assert.match(page,/if\(detailCache\[reportId\]\)/);
  assert.match(api,/await params/);
  assert.match(api,/validateSession/);
  assert.match(api,/\.eq\('id',id\)/);
  assert.match(api,/\.in\('report_type',\['WEEKLY','ADHOC','MONTHLY','PRODUCT_ANALYSIS'\]\)/);
  assert.match(api,/maybeSingle\(\)/);
  assert.match(api,/normalizeInsightReportDetail/);
  assert.doesNotMatch(api,/report_html|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_/);
});

test('saved report detail route rejects guests and returns one normalized channel report',async()=>{
  const auth=require('../lib/dashboard-auth.js');
  const supabase=require('../lib/cafe24/supabase.js');
  const originalValidate=auth.validateSession,originalCookie=auth.cookieValue,originalDb=supabase.getSupabase;
  try{
    auth.cookieValue=()=>'';
    auth.validateSession=async()=>null;
    const route=await import(`${pathToFileURL(path.join(root,'app/api/insights/reports/[id]/route.js')).href}?test=${Date.now()}`);
    const denied=await route.GET(new Request('https://hub.example/api/insights/reports/nv-1'),{params:Promise.resolve({id:'nv-1'})});
    assert.equal(denied.status,401);
    assert.match(denied.headers.get('cache-control'),/no-store/);

    auth.validateSession=async()=>({id:'owner-session',role:'OWNER'});
    const calls=[];
    supabase.getSupabase=()=>({from(table){calls.push(['from',table]);const query={select(fields){calls.push(['select',fields]);return query;},eq(field,value){calls.push(['eq',field,value]);return query;},in(field,value){calls.push(['in',field,value]);return query;},async maybeSingle(){calls.push(['maybeSingle']);return {data:{id:'nv-1',platform:'NAVER',report_type:'WEEKLY',period_start:'2026-08-24',period_end:'2026-08-30',status:'FINAL',summary_json:{naver:{revenue:1000,contribution_profit:300},insights:[{title:'브랜드 검색 증가'}],recommendations:[{title:'브랜드 입찰 유지'}]}},error:null};}};return query;}});
    const response=await route.GET(new Request('https://hub.example/api/insights/reports/nv-1'),{params:Promise.resolve({id:'nv-1'})});
    const payload=await response.json();
    assert.equal(response.status,200);
    assert.equal(payload.detail.platform,'NAVER');
    assert.equal(payload.detail.flow.cause,'브랜드 검색 증가');
    assert.equal('summary_json' in payload.detail,false);
    assert.deepEqual(calls.filter(call=>call[0]==='from'),[['from','reports']]);
    assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='id'&&call[2]==='nv-1'));
  }finally{
    auth.validateSession=originalValidate;auth.cookieValue=originalCookie;supabase.getSupabase=originalDb;
  }
});

test('insights CSS keeps fixed readable sizing, balanced selection, responsive layout, and restrained motion',()=>{
  const css=read('app/_phase28/pages/insights-page.css');
  assert.match(css,/--ops-surface:var\(--p28-surface\)/,'인사이트 페이지가 공통 Phase 28 표면 토큰을 사용해야 합니다.');
  assert.match(css,/--ops-line:var\(--p28-line\)/);
  assert.match(css,/--ops-soft:var\(--p28-soft\)/);
  assert.match(css,/max-width:2300px/);
  assert.match(css,/padding-bottom:110px/);
  assert.match(css,/min-height:112px/);
  assert.match(css,/min-height:78px/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:16px/);
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
  assert.match(
    css,
    /\.inOwnerBrief>\*\{min-width:0;max-width:100%\}/,
    '모바일 사장님 브리프의 직접 자식이 넓은 내부 표 때문에 문서 폭을 늘리면 안 됩니다.'
  );
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
  assert.doesNotMatch(css,/font-size:(?:[0-9]|1[01])px/);
});

test('weekly insight automation remains scheduled and uses the shared scheduler',()=>{
  const weekly=read('lib/reports/weekly.js');
  const scheduler=read('lib/automation/report-scheduler.js');
  const cron=read('app/api/cron/weekly-report/route.js');
  const vercel=read('vercel.json');
  assert.match(weekly,/\['ALL', 'NAVER', 'CAFE24', 'COUPANG'\]/);
  assert.match(scheduler,/async function generateWeekly/);
  assert.match(scheduler,/cleanupDuplicateDiagnosisReports/);
  assert.match(cron,/scheduleModule\.generateWeekly/);
  assert.match(cron,/guardedRun|idempotency/i);
  assert.match(vercel,/\/api\/cron\/weekly-report/);
  assert.match(vercel,/30 22 \* \* 0/);
});
