'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const root=path.resolve(__dirname,'..');
const analysis=require('../lib/naver/bid-performance-analysis.js');

function fixtureDb(){
  const rows={
    naver_campaigns:{ncc_campaign_id:'cmp-1',name:'작두콩 캠페인',campaign_type:'SHOPPING',status:'ELIGIBLE',user_lock:false},
    naver_adgroups:{ncc_adgroup_id:'grp-1',ncc_campaign_id:'cmp-1',name:'작두콩 모바일·PC',status:'ELIGIBLE',user_lock:false}
  };
  return {
    from(table){
      return {
        select(){return this;},
        eq(){return this;},
        async maybeSingle(){return {data:rows[table]||null,error:null};}
      };
    }
  };
}

test('25-4 builds honest PC mobile and region performance from official breakdown rows',()=>{
  const result=analysis.buildBidOperatingScope?.({
    scope:{type:'ADGROUP',id:'grp-1',label:'작두콩 모바일·PC'},
    period:{since:'2026-08-18',until:'2026-08-24'},
    devicePayload:[{id:'grp-1',data:[
      {pcMblTp:'PC',impCnt:100,clkCnt:4,salesAmt:1200,ccnt:1,convAmt:9000,avgRnk:2.7},
      {pcMblTp:'MOBILE',impCnt:240,clkCnt:12,salesAmt:3600,ccnt:3,convAmt:32000,avgRnk:3.4}
    ]}],
    regionPayload:[{id:'grp-1',data:[
      {regnR3Nm:'서울',impCnt:120,clkCnt:8,salesAmt:2100,ccnt:2,convAmt:18000},
      {regnR3Nm:'광주',impCnt:70,clkCnt:3,salesAmt:900,ccnt:1,convAmt:8000}
    ]}]
  });

  assert.equal(result?.platform,'NAVER');
  assert.equal(result?.status,'READY');
  assert.deepEqual(result?.devices.map(item=>item.key),['PC','MOBILE']);
  assert.equal(result?.devices.find(item=>item.key==='MOBILE').cost,3600);
  assert.equal(result?.devices.find(item=>item.key==='MOBILE').actual_profit,null);
  assert.deepEqual(result?.regions.map(item=>item.label),['서울','광주']);
  assert.equal(result?.sources.device.kind,'NAVER_ACTUAL_BREAKDOWN');
  assert.match(result?.notice||'',/공통 입찰가/);
});

test('25-4 keeps unsupported region data as verify required instead of pretending nationwide coverage',()=>{
  const result=analysis.buildBidOperatingScope?.({
    scope:{type:'CAMPAIGN',id:'cmp-1',label:'작두콩 캠페인'},
    devicePayload:[{id:'cmp-1',data:[{pcMblTp:'PC',impCnt:20,clkCnt:2,salesAmt:300}]}],
    regionPayload:[],
    errors:[{source:'region',code:'NAVER_REGION_BREAKDOWN_FAILED',message:'지역 자료를 확인하지 못했습니다.'}]
  });

  assert.equal(result?.status,'PARTIAL');
  assert.equal(result?.region_status,'VERIFY_REQUIRED');
  assert.deepEqual(result?.regions,[]);
  assert.doesNotMatch(JSON.stringify(result),/전국/);
  assert.equal(result?.devices.find(item=>item.key==='MOBILE').cost,null);
});

test('25-4 loads only the chosen Naver campaign or adgroup with read-only breakdown calls',async()=>{
  const calls=[];
  const api={async request(method,uri,query){
    calls.push({method,uri,query});
    if(query.breakdown==='pcMblTp')return {data:[{id:'grp-1',data:[{pcMblTp:'MOBILE',impCnt:10,clkCnt:1,salesAmt:90}]}]};
    if(query.breakdown==='regnR3Nm')return {data:[{id:'grp-1',data:[{regnR3Nm:'전남',impCnt:8,clkCnt:1,salesAmt:70}]}]};
    throw new Error('unexpected call');
  }};
  const result=await analysis.loadBidOperatingScope?.({db:fixtureDb(),api,adgroupId:'grp-1',now:new Date('2026-08-25T03:00:00.000Z')});

  assert.equal(result?.scope.type,'ADGROUP');
  assert.equal(result?.scope.id,'grp-1');
  assert.deepEqual(calls.map(item=>[item.method,item.uri,item.query.breakdown]),[
    ['GET','/stats','pcMblTp'],['GET','/stats','regnR3Nm']
  ]);
  assert.ok(calls.every(item=>item.query.id==='grp-1'));
  assert.deepEqual(result?.period,{since:'2026-08-18',until:'2026-08-24'});
});

test('25-4 operating scope API rejects unauthenticated requests before provider access',async()=>{
  const routePath=path.join(root,'app','api','naver','bid-operating-scope','route.js');
  assert.equal(fs.existsSync(routePath),true,'25-4 오너 전용 API 경로가 필요하다');
  const routeUrl=pathToFileURL(routePath).href;
  const route=await import(`${routeUrl}?test=${Date.now()}`);
  const response=await route.GET(new Request('https://hub.example/api/naver/bid-operating-scope?campaignId=cmp-1'));
  assert.equal(response.status,401);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
});

test('25-4 renders the operating scope only inside the Naver registered or diagnosis workbench',()=>{
  const table=fs.readFileSync(path.join(root,'app','_analysis','keyword-operations-table.js'),'utf8');
  const panelPath=path.join(root,'app','_analysis','keyword-operating-scope-panel.js');
  assert.equal(fs.existsSync(panelPath),true,'25-4 범위 패널이 필요하다');
  const panel=fs.readFileSync(panelPath,'utf8');
  assert.match(table,/!isCoupang&&groupEnabled&&\(campaignId!==['"]ALL['"]\|\|adgroupId!==['"]ALL['"]\)/);
  assert.match(table,/<KeywordOperatingScopePanel/);
  assert.match(panel,/PC·모바일/);
  assert.match(panel,/지역 성과/);
  assert.match(panel,/공통 입찰가/);
  assert.doesNotMatch(panel,/api\/coupang/i);
});
