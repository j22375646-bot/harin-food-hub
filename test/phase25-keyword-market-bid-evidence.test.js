'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const analysis=require('../lib/naver/bid-performance-analysis.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('25-6 keeps official Naver demand, minimum exposure, and target-rank estimates as separate evidence',()=>{
  const evidence=analysis.buildOfficialBidEvidence({
    keyword:'작두콩차',targetRank:3,now:new Date('2026-08-25T03:00:00.000Z'),
    keywordToolPayload:{keywordList:[{
      relKeyword:'작두콩차',monthlyPcQcCnt:'1200',monthlyMobileQcCnt:'3400',
      monthlyAvePcClkCnt:'12.3',monthlyAveMobileClkCnt:'31.8',compIdx:'high'
    }]},
    estimates:{pc_bid:410,mobile_bid:460},
    minimumEstimates:{pc_bid:90,mobile_bid:110}
  });

  assert.equal(evidence.platform,'NAVER');
  assert.equal(evidence.status,'READY');
  assert.equal(evidence.market.monthly_pc_queries,1200);
  assert.equal(evidence.market.monthly_mobile_queries,3400);
  assert.equal(evidence.market.monthly_total_queries,4600);
  assert.equal(evidence.market.competition,'high');
  assert.equal(evidence.minimum_exposure.pc_bid,90);
  assert.equal(evidence.target_position.mobile_bid,460);
  assert.deepEqual(evidence.reference_band,{low:90,high:460});
  assert.equal(evidence.target_position.target_rank,3);
  assert.match(evidence.notice,/보장하지/);
  assert.equal(evidence.fetched_at,'2026-08-25T03:00:00.000Z');
});

test('25-6 never turns less-than-ten or missing official demand into zero',()=>{
  const evidence=analysis.buildOfficialBidEvidence({
    keyword:'레드비트차',targetRank:null,
    keywordToolPayload:{keywordList:[{relKeyword:'레드비트차',monthlyPcQcCnt:'<10',monthlyMobileQcCnt:'',compIdx:'medium'}]},
    minimumEstimates:{pc_bid:70,mobile_bid:null}
  });

  assert.equal(evidence.status,'TARGET_REQUIRED');
  assert.equal(evidence.market.monthly_pc_queries,null);
  assert.equal(evidence.market.monthly_pc_queries_status,'LT_10');
  assert.equal(evidence.market.monthly_mobile_queries,null);
  assert.equal(evidence.market.monthly_total_queries,null);
  assert.equal(evidence.target_position.pc_bid,null);
  assert.equal(evidence.reference_band.low,70);
  assert.equal(evidence.reference_band.high,null);
});

test('25-6 loads official evidence lazily for only the selected Naver keyword',async()=>{
  const calls=[];
  const db={from(table){return {
    select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
    async maybeSingle(){
      if(table==='naver_keywords')return {data:{ncc_keyword_id:'kw-1',ncc_adgroup_id:'grp-1',keyword:'작두콩차',bid_amount:300,status:'ELIGIBLE',user_lock:false,updated_at:'2026-08-25T01:00:00Z'},error:null};
      if(table==='naver_bid_keyword_rules')return {data:{ncc_keyword_id:'kw-1',enabled:true,target_rank:3,target_rank_mode:'REFERENCE_ONLY',updated_at:'2026-08-25T01:00:00Z'},error:null};
      return {data:null,error:null};
    },
    then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}
  };}};
  const api={async request(method,uri,query,body){
    calls.push({method,uri,query,body});
    if(uri==='/keywordstool')return {data:{keywordList:[{relKeyword:'작두콩차',monthlyPcQcCnt:'100',monthlyMobileQcCnt:'200',compIdx:'medium'}]}};
    if(uri==='/estimate/average-position-bid/keyword')return {data:{estimate:[{keyword:'작두콩차',bid:body.device==='PC'?400:450}]}};
    if(uri==='/estimate/exposure-minimum-bid/keyword')return {data:{estimate:[{keyword:'작두콩차',bid:body.device==='PC'?80:100}]}};
    return {data:[]};
  }};

  const result=await analysis.loadBidPerformanceAnalysis({db,api,keywordId:'kw-1',now:new Date('2026-08-25T03:00:00.000Z')});

  assert.equal(result.scope.platform,'NAVER');
  assert.equal(result.official_bid_evidence.status,'READY');
  assert.equal(calls.filter(item=>item.uri==='/keywordstool').length,1);
  assert.deepEqual(calls.filter(item=>item.uri==='/estimate/average-position-bid/keyword').map(item=>item.body.device).sort(),['MOBILE','PC']);
  assert.deepEqual(calls.filter(item=>item.uri==='/estimate/exposure-minimum-bid/keyword').map(item=>item.body.device).sort(),['MOBILE','PC']);
  assert.ok(calls.every(item=>!String(item.uri).toLowerCase().includes('coupang')));
});

test('25-6 adds the read-only official evidence to the Naver inline workspace only',()=>{
  const panel=read('app/_analysis/keyword-bid-inline-trend.js');
  const table=read('app/_analysis/keyword-operations-table.js');
  const css=read('app/_analysis/keyword-bid-inline-trend.css');

  assert.match(panel,/네이버 공식 입찰 근거/);
  assert.match(panel,/최소 노출 참고/);
  assert.match(panel,/목표순위 예상/);
  assert.match(panel,/운영 추천가/);
  assert.match(panel,/판단 보류/);
  assert.match(table,/recommendedBid=\{detail\.recommendedBid\}/);
  assert.match(table,/detail\.platform==='NAVER'/);
  assert.match(css,/keywordBidOfficialEvidence/);
  assert.doesNotMatch(panel,/WING|COUPANG|쿠팡/);
});
