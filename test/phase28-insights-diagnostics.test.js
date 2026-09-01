'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const insightsAdapter=require('../lib/ui/phase28-adapters/insights.js');

test('insights exposes only the latest weekly automation run without inventing success',()=>{
  const model=insightsAdapter.buildPhase28InsightsModel({
    generatedAt:'2026-08-31T04:40:00.000Z',
    reports:[],
    automationRuns:[
      {id:'daily-ok',job_name:'DAILY_PLATFORM_REPORTS',status:'SUCCESS',finished_at:'2026-08-30T22:11:00.000Z'},
      {id:'weekly-failed',job_name:'WEEKLY_PLATFORM_REPORTS',status:'FAILED',finished_at:'2026-08-30T22:32:00.000Z',error_message:'report failed'}
    ]
  });

  assert.deepEqual(model.automation.items.map(item=>item.id),['weekly']);
  assert.equal(model.automation.items[0].state,'FAILED');
  assert.equal(model.automation.items[0].lastRunId,'weekly-failed');
});

test('insights keeps workspace and channel changes in the mounted page and lazy loads accumulated diagnoses',()=>{
  const page=read('app/_phase28/pages/insights-page.js');
  const route=read('app/insights/[workspace]/page.js');
  const hubRoutes=read('lib/navigation/hub-routes.js');

  assert.match(page,/\['week','saved','diagnostics'\]/);
  assert.match(page,/누적 주간 진단/);
  assert.match(page,/fetch\('\/api\/insights\/diagnostics'/);
  assert.match(page,/window\.history\.pushState/);
  assert.doesNotMatch(page,/router\.push\(/);
  assert.match(page,/상세보기/);
  assert.match(page,/DiagnosticsPanel/);
  assert.match(route,/HUB_WORKSPACES\.insight/);
  assert.match(hubRoutes,/id:'saved'.*href:'\/insights\/saved'/);
  assert.match(hubRoutes,/id:'diagnostics'.*href:'\/insights\/diagnostics'/);
});

test('the old diagnoses page redirects to the accumulated insights workspace and leaves no duplicate sidebar item',()=>{
  const route=read('app/diagnoses/page.js');
  const navigation=read('lib/ui/phase28-navigation.js');
  assert.match(route,/redirect\('\/insights\/diagnostics'\)/);
  assert.doesNotMatch(navigation,/items:\['diagnoses','changes'/);
});

test('insight diagnostics API is authenticated and returns compact accumulated reports',async()=>{
  const auth=require('../lib/dashboard-auth.js');
  const supabase=require('../lib/cafe24/supabase.js');
  const snapshot=require('../lib/reports/phase28-diagnosis-snapshot.js');
  const originalValidate=auth.validateSession,originalCookie=auth.cookieValue,originalDb=supabase.getSupabase,originalLoad=snapshot.loadPhase28DiagnosisSnapshot;
  try{
    auth.cookieValue=()=>'';
    auth.validateSession=async()=>null;
    let route=await import(`${pathToFileURL(path.join(root,'app/api/insights/diagnostics/route.js')).href}?guest=${Date.now()}`);
    const denied=await route.GET(new Request('https://hub.example/api/insights/diagnostics'));
    assert.equal(denied.status,401);

    auth.validateSession=async()=>({id:'owner-session',role:'OWNER'});
    supabase.getSupabase=()=>({from(){}});
    snapshot.loadPhase28DiagnosisSnapshot=async options=>{
      assert.equal(options.latestLimit,96);
      assert.equal(options.versionLimit,0);
      assert.equal(options.platform,'NAVER');
      assert.deepEqual(options.reportTypes,['WEEKLY']);
      return {
        generatedAt:'2026-08-31T04:40:00.000Z',versionHeaders:[],latestReports:[{
          id:'weekly-naver',platform:'NAVER',report_type:'WEEKLY',period_start:'2026-08-24',period_end:'2026-08-30',
          title:'네이버 자동진단',status:'FINAL',version:1,is_latest:true,created_at:'2026-08-30T22:11:00.000Z',
          summary_json:{score:82,data_coverage:{naver:'READY'},insights:[{title:'매출 흐름 확인'}],recommendations:[]}
        }]
      };
    };
    route=await import(`${pathToFileURL(path.join(root,'app/api/insights/diagnostics/route.js')).href}?owner=${Date.now()}`);
    const response=await route.GET(new Request('https://hub.example/api/insights/diagnostics'));
    const payload=await response.json();
    assert.equal(response.status,200);
    assert.equal(payload.ok,true);
    assert.equal(payload.diagnostics.items.length,1);
    assert.equal(payload.diagnostics.items[0].platform,'NAVER');
    assert.equal('summary_json' in payload.diagnostics.items[0],false);
  }finally{
    auth.validateSession=originalValidate;
    auth.cookieValue=originalCookie;
    supabase.getSupabase=originalDb;
    snapshot.loadPhase28DiagnosisSnapshot=originalLoad;
  }
});

test('saved detail API keeps legacy report compatibility while the page exposes only Naver weekly reports',()=>{
  const route=read('app/api/insights/reports/[id]/route.js');
  assert.match(route,/\.in\('report_type',\['WEEKLY','ADHOC','MONTHLY','PRODUCT_ANALYSIS'\]\)/);
  assert.doesNotMatch(route,/\.eq\('report_type','WEEKLY'\)/);
});
