'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {registerHooks}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const {fileURLToPath,pathToFileURL}=require('node:url');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {transformSync}=require('next/dist/build/swc');

registerHooks({load(url,context,nextLoad){
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export default {};'};
  if(url.includes('/app/')&&url.endsWith('.js')){
    const filename=fileURLToPath(url);
    return {format:'module',shortCircuit:true,source:transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code};
  }
  return nextLoad(url,context);
}});

const root=path.resolve(__dirname,'..');
const moduleUrl=pathToFileURL(path.join(root,'app/_phase28/pages/system-ga4-measurement.js')).href;
const panelModuleUrl=pathToFileURL(path.join(root,'app/_phase28/pages/system-measurement-panel.js')).href;
const load=()=>import(moduleUrl);
const loadPanel=()=>import(panelModuleUrl);

const report={
  version:'ga4-ecommerce-v1',source:'GA4_DATA_API',host:'shop.example',fetchedAt:'2026-09-07T16:30:00.000Z',
  window:{startDate:'7daysAgo',endDate:'yesterday',timeZone:'Asia/Seoul'},currencyCode:'KRW',
  coverage:{events:'COMPLETE',transactions:'COMPLETE',reasons:[]},status:'OBSERVED',
  stages:[
    {eventName:'view_item',label:'상품 조회',eventCount:120,users:90,observed:true},
    {eventName:'add_to_cart',label:'장바구니',eventCount:18,users:12,observed:true},
    {eventName:'begin_checkout',label:'결제 시작',eventCount:9,users:7,observed:true},
    {eventName:'add_payment_info',label:'결제 정보',eventCount:null,users:null,observed:false},
    {eventName:'purchase',label:'구매',eventCount:3,users:2,observed:true},
    {eventName:'refund',label:'환불',eventCount:0,users:0,observed:false}
  ],
  money:{grossPurchaseRevenue:55000,refundAmount:0},
  diagnostics:{missingPurchaseIdEvents:0,missingRefundIdEvents:null,duplicatePurchaseIds:1,repeatedRefundIds:0},
  trackingVerification:'VERIFY_REQUIRED',notes:['GA4 관측값이며 Cafe24 주문·정산 합계가 아닙니다.']
};
function measurement(status='OBSERVED',overrides={}){
  return {status,missingFields:[],canRefresh:status!=='IN_FLIGHT',report,lastAttemptAt:'2026-09-07T16:31:00.000Z',lastSuccessAt:'2026-09-07T16:31:00.000Z',previousSuccess:false,error:null,trackingVerification:'VERIFY_REQUIRED',automation:{schedule:'매일 05:30 (한국시간)',status:'SCHEDULED'},...overrides};
}

test('GA4 inspection exposes the real client component and testable production boundaries',async()=>{
  const subject=await load().catch(()=>({}));
  assert.equal(typeof subject.default,'function');
  assert.equal(typeof subject.Ga4MeasurementView,'function');
  assert.equal(typeof subject.createGa4MeasurementRequestController,'function');
  assert.equal(typeof subject.ga4MeasurementReducer,'function');
  assert.equal(typeof subject.reportDateRange,'function');
});

test('setup state explains the Cafe24 boundary and maps only missing field names to server env names',async()=>{
  const {Ga4MeasurementView}=await load();
  const setup=measurement('SETUP_REQUIRED',{
    canRefresh:false,report:null,lastAttemptAt:null,lastSuccessAt:null,
    missingFields:['자사몰 주소','GA4 속성 ID','서비스 계정 이메일','서비스 계정 비밀키'],
    automation:{schedule:'매일 05:30 (한국시간)',status:'SETUP_REQUIRED'}
  });
  const html=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{measurement:setup}));
  for(const value of ['자사몰 구매·환불 측정','Cafe24 주문·정산 자료','별도 분석 도구','Cafe24 쇼핑몰 ID','G-로 시작하는 측정 ID','HUB_OWNED_SITE_URL','GOOGLE_GA4_PROPERTY_ID','GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY','설정 안내'])assert.ok(html.includes(value),value);
  assert.match(html,/GA4 자료 새로 확인<\/button>/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>GA4 자료 새로 확인/);
  assert.match(html,/준비중/);
  assert.doesNotMatch(html,/자동 수집 완료|<input|<textarea|BEGIN PRIVATE KEY|private-key-value/i);
});

test('every service state renders an honest status without turning in-flight or cached reads into collection success',async()=>{
  const {Ga4MeasurementView}=await load();
  const cases=[
    ['LOCKED','수집 잠금'],['OBSERVED','관측 자료'],['NO_DATA','관측 자료 없음'],['PARTIAL','일부 관측'],
    ['FAILED','최근 조회 실패'],['STALE','갱신 필요'],['IN_FLIGHT','확인 작업 진행 중']
  ];
  for(const [status,label] of cases){
    const current=measurement(status,status==='LOCKED'?{report:null,canRefresh:false,automation:{schedule:'매일 05:30 (한국시간)',status:'LOCKED'}}:status==='NO_DATA'?{report:{...report,status:'NO_DATA'}}:status==='PARTIAL'?{report:{...report,status:'PARTIAL'}}:status==='FAILED'?{previousSuccess:true,error:'GA4 읽기 권한을 확인해 주세요.'}:status==='IN_FLIGHT'?{canRefresh:false,runtime:{kind:'IN_FLIGHT'}}:{});
    const html=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{measurement:current}));
    assert.ok(html.includes(label),status);
    assert.match(html,/실제 구매·환불 태그 검증 필요/);
    assert.doesNotMatch(html,/자동 수집 완료/);
    if(status==='IN_FLIGHT')assert.match(html,/저장 상태 다시 확인/);
  }
  const cached=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{measurement:measurement('OBSERVED',{runtime:{kind:'CACHE_HIT',cached:true}}),message:'저장된 최신 자료를 확인했습니다.'}));
  assert.doesNotMatch(cached,/새 Google 수집 완료/);
});

test('initial loading and GET failure keep saved-data existence and schedule explicitly unknown',async()=>{
  const {Ga4MeasurementView}=await load();
  const loading=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{pending:'GET'}));
  assert.match(loading,/저장 자료를 확인하고 있습니다/);
  assert.match(loading,/자동 확인 일정[\s\S]*?상태 확인 필요/);
  assert.doesNotMatch(loading,/저장된 GA4 관측 자료가 아직 없습니다|준비중/);
  const failed=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{error:'초기 저장 상태 조회 실패'}));
  assert.match(failed,/조회하지 못해 자료 유무를 확인하지 못했습니다/);
  assert.match(failed,/자동 확인 일정[\s\S]*?상태 확인 필요/);
  assert.doesNotMatch(failed,/저장된 GA4 관측 자료가 아직 없습니다|준비중/);
});

test('setup and lock gates keep saved-data existence unknown until storage is actually read',async()=>{
  const {Ga4MeasurementView}=await load();
  const gated=[
    [measurement('SETUP_REQUIRED',{report:null,canRefresh:false,missingFields:['GA4 속성 ID'],automation:{schedule:'매일 05:30 (한국시간)',status:'SETUP_REQUIRED'}}),/필수 서버 설정이 없어 저장 자료 유무를 확인하지 않았습니다/],
    [measurement('LOCKED',{report:null,canRefresh:false,automation:{schedule:'매일 05:30 (한국시간)',status:'LOCKED'}}),/서버 안전 스위치가 잠겨 있어 저장 자료 유무를 확인하지 않았습니다/]
  ];
  for(const [value,reason] of gated){
    const html=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{measurement:value}));
    assert.match(html,reason);
    assert.doesNotMatch(html,/저장된 GA4 관측 자료가 아직 없습니다/);
  }
  const readEmpty=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{measurement:measurement('VERIFY_REQUIRED',{report:null})}));
  assert.match(readEmpty,/저장된 GA4 관측 자료가 아직 없습니다/);
});

test('observed report renders six stages, source metadata, money labels and null versus explicit zero',async()=>{
  const {Ga4MeasurementView}=await load();
  const html=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{measurement:measurement('OBSERVED',{runtime:{kind:'LIVE',warning:'실행 기록 저장 상태를 확인해 주세요.'}})}));
  for(const value of ['shop.example','Asia/Seoul','KRW','2026. 9. 1.','2026. 9. 7.','상품 조회','장바구니','결제 시작','결제 정보','구매','환불','120회','90명','55,000','GA4 기록 구매액','GA4 기록 환불액','구매 중복 의심','환불 반복 검토','실행 기록 저장 상태를 확인해 주세요.','GA4 관측값이며 Cafe24 주문·정산 합계가 아닙니다.'])assert.ok(html.includes(value),value);
  assert.equal((html.match(/data-ga4-stage=/g)||[]).length,6);
  assert.match(html,/결제 정보[\s\S]*?미관측[\s\S]*?확인 필요/);
  assert.match(html,/환불[\s\S]*?0회[\s\S]*?0명/);
  assert.doesNotMatch(html,/총매출|전환율|전체 사용자/);
});

test('an incomplete saved report still shows the fixed six stages as unknown instead of dropping rows',async()=>{
  const {Ga4MeasurementView}=await load();
  const incomplete={...report,stages:[report.stages[0]]};
  const html=renderToStaticMarkup(React.createElement(Ga4MeasurementView,{measurement:measurement('PARTIAL',{report:incomplete})}));
  assert.equal((html.match(/data-ga4-stage=/g)||[]).length,6);
  assert.match(html,/GA4 Data API/);
  assert.match(html,/장바구니[\s\S]*?미관측[\s\S]*?확인 필요/);
});

test('report calendar range is anchored to fetchedAt in the GA4 property timezone',async()=>{
  const {reportDateRange}=await load();
  assert.deepEqual(reportDateRange(report),{startDate:'2026-09-01',endDate:'2026-09-07',timeZone:'Asia/Seoul',confirmed:true});
  assert.deepEqual(reportDateRange({...report,fetchedAt:'2026-09-08T06:30:00.000Z',window:{...report.window,timeZone:'America/Los_Angeles'}}),{startDate:'2026-08-31',endDate:'2026-09-06',timeZone:'America/Los_Angeles',confirmed:true});
  assert.deepEqual(reportDateRange({...report,window:{...report.window,timeZone:'Unknown/Zone'}}),{startDate:null,endDate:null,timeZone:'Unknown/Zone',confirmed:false});
});

test('request controller uses GET-only retry, locks same-tick POST and suppresses stale GET completion',async()=>{
  const {createGa4MeasurementRequestController}=await load();
  const calls=[];const completions=[];const failures=[];const pending=[];
  const fetchImpl=(url,options={})=>new Promise((resolve,reject)=>{
    calls.push({url,options});pending.push({resolve,reject,options});
  });
  const controller=createGa4MeasurementRequestController({fetchImpl,onSuccess:(value,meta)=>completions.push([value.status,meta.kind]),onError:(error,meta)=>failures.push([error.message,meta.kind])});
  const loadPromise=controller.load();
  assert.equal(calls[0].options.method,'GET');
  const refreshPromise=controller.refresh();
  const duplicate=controller.refresh();
  assert.equal(calls[1].options.method,'POST');
  assert.equal(JSON.parse(calls[1].options.body).action,'REFRESH');
  assert.equal(await duplicate,false);
  pending[1].resolve(new Response(JSON.stringify({ok:true,measurement:measurement('OBSERVED')}),{status:200,headers:{'Content-Type':'application/json'}}));
  await refreshPromise;
  pending[0].resolve(new Response(JSON.stringify({ok:true,measurement:measurement('STALE')}),{status:200,headers:{'Content-Type':'application/json'}}));
  await loadPromise;
  assert.deepEqual(completions,[['OBSERVED','POST']]);
  const retryPromise=controller.retry();
  assert.equal(calls[2].options.method,'GET');
  assert.equal(calls[2].options.body,undefined);
  pending[2].resolve(new Response(JSON.stringify({ok:false,error:'저장 상태 조회 실패'}),{status:500,headers:{'Content-Type':'application/json'}}));
  await retryPromise;
  assert.deepEqual(failures,[['저장 상태 조회 실패','GET_RETRY']]);
  controller.dispose();
});

test('state reducer preserves the report on refresh failure and clears old success before each request',async()=>{
  const {ga4MeasurementReducer}=await load();
  const previous={measurement:measurement(),pending:'',error:'',message:'이전 완료 알림'};
  const started=ga4MeasurementReducer(previous,{type:'REQUEST_STARTED',kind:'POST'});
  assert.equal(started.message,'');
  assert.equal(started.measurement.report,report);
  const failed=ga4MeasurementReducer(started,{type:'REQUEST_FAILED',kind:'POST',error:'새로 확인 실패'});
  assert.equal(failed.measurement.report,report);
  assert.equal(failed.error,'새로 확인 실패');
  assert.equal(failed.pending,'');
});

test('a completed HTTP response with FAILED service state never emits a collection success message',async()=>{
  const {ga4MeasurementReducer}=await load();
  const state=ga4MeasurementReducer(initialState(),{type:'REQUEST_SUCCEEDED',kind:'POST',measurement:measurement('FAILED',{previousSuccess:true,error:'읽기 실패'})});
  assert.equal(state.message,'');
  function initialState(){return {measurement:measurement(),pending:'POST',error:'',message:''};}
});

test('POST config-race and non-collection responses never emit a collection success message',async()=>{
  const {createGa4MeasurementRequestController,ga4MeasurementReducer}=await load();
  const responses=[
    measurement('SETUP_REQUIRED',{report:null,canRefresh:false,missingFields:['GA4 속성 ID'],lastAttemptAt:null,lastSuccessAt:null,automation:{schedule:'매일 05:30 (한국시간)',status:'SETUP_REQUIRED'}}),
    measurement('LOCKED',{report:null,canRefresh:false,lastAttemptAt:null,lastSuccessAt:null,automation:{schedule:'매일 05:30 (한국시간)',status:'LOCKED'}}),
    measurement('VERIFY_REQUIRED',{report:null}),
    measurement('STALE'),
    measurement('FUTURE_STATUS'),
    {...measurement(),status:undefined},
    measurement('OBSERVED')
  ];
  let state={measurement:measurement(),pending:'',error:'',message:''};
  let requestIndex=0;
  const controller=createGa4MeasurementRequestController({
    fetchImpl:async(_url,options)=>{
      assert.equal(options.method,'POST');
      return new Response(JSON.stringify({ok:true,measurement:responses[requestIndex++]}),{status:200,headers:{'Content-Type':'application/json'}});
    },
    onStart:({kind})=>{state=ga4MeasurementReducer(state,{type:'REQUEST_STARTED',kind});},
    onSuccess:(value,{kind})=>{state=ga4MeasurementReducer(state,{type:'REQUEST_SUCCEEDED',measurement:value,kind});}
  });
  for(let index=0;index<responses.length-1;index++){
    assert.equal(await controller.refresh(),true);
    assert.equal(state.message,'',String(responses[index].status));
  }
  assert.equal(await controller.refresh(),true);
  assert.equal(state.message,'GA4 자료를 새로 확인해 저장했습니다.');
  controller.dispose();
});

test('default component performs no SSR request and renders its accessible saved-state boundary',async()=>{
  const {default:Component}=await load();
  const original=global.fetch;let requests=0;global.fetch=()=>{requests+=1;};
  try{
    const html=renderToStaticMarkup(React.createElement(Component));
    assert.match(html,/<section class="ga4Measurement" aria-labelledby="ga4MeasurementTitle" aria-busy="false">/);
    assert.match(html,/<h3 id="ga4MeasurementTitle">자사몰 구매·환불 측정<\/h3>/);
    assert.match(html,/<button type="button" disabled="">GA4 자료 새로 확인<\/button>/);
    assert.equal(requests,0);
  }finally{global.fetch=original;}
});

test('actual system measurement panel renders exactly one GA4 section beside the real UTM form',async()=>{
  const {default:SystemMeasurementPanel}=await loadPanel();
  const original=global.fetch;let requests=0;global.fetch=()=>{requests+=1;};
  try{
    const html=renderToStaticMarkup(React.createElement(SystemMeasurementPanel));
    assert.equal((html.match(/class="ga4Measurement"/g)||[]).length,1);
    assert.equal((html.match(/<form class="sysMeasurementForm"/g)||[]).length,1);
    for(const [name,type] of [['landingUrl','url'],['source','text'],['campaignId','text']]){
      const inputTag=html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0]||'';
      assert.match(inputTag,/required=""/);
      assert.match(inputTag,new RegExp(`type="${type}"`));
    }
    assert.match(html,/기존 UTM과 입력값이 다르면 검사를 통과할 수 없습니다/);
    assert.match(html,/>링크 검사<\/button>/);
    assert.equal(requests,0);
  }finally{global.fetch=original;}
});
