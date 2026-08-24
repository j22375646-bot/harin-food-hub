'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const test=require('node:test');
const signals=require('../lib/naver/bid-list-signals.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('24-15 validates and deduplicates only the visible Naver keyword ids',()=>{
  assert.deepEqual(signals.validateKeywordIds([' kw-1 ','kw-2','kw-1']),['kw-1','kw-2']);
  assert.throws(()=>signals.validateKeywordIds([]),error=>error.code==='NAVER_KEYWORD_IDS_REQUIRED'&&error.status===400);
  assert.throws(()=>signals.validateKeywordIds(['bad id']),error=>error.code==='INVALID_NAVER_KEYWORD_ID'&&error.status===400);
  assert.throws(()=>signals.validateKeywordIds(Array.from({length:37},(_,index)=>`kw-${index}`)),error=>error.code==='TOO_MANY_NAVER_KEYWORD_IDS'&&error.status===400);
});

test('24-15 builds truthful target hit rate and competition signals per keyword',()=>{
  const result=signals.buildBidListSignals({
    keywordIds:['kw-1','kw-2','kw-3'],
    rules:[{ncc_keyword_id:'kw-1',target_rank:3},{ncc_keyword_id:'kw-3',target_rank:2}],
    entities:[
      {id:'kw-1',data:[{period:'2026-08-22',avgRnk:4},{period:'2026-08-23',avgRnk:3},{period:'2026-08-24',avgRnk:2}]},
      {id:'kw-2',data:[{period:'2026-08-24',avgRnk:1}]},
      {id:'kw-3',data:[{period:'2026-08-24',avgRnk:0}]}
    ]
  });

  assert.equal(result[0].hit_rate.status,'READY');
  assert.equal(result[0].hit_rate.percent,66.7);
  assert.equal(result[0].hit_rate.hit_days,2);
  assert.equal(result[0].competition.level,'MEDIUM');
  assert.equal(result[1].hit_rate.status,'TARGET_REQUIRED');
  assert.equal(result[1].hit_rate.percent,null);
  assert.equal(result[2].hit_rate.status,'NO_DATA');
  assert.equal(result[2].hit_rate.percent,null);
  assert.equal(result[2].competition.level,'UNKNOWN');
});

test('24-15 loads seven-day Naver stats per visible keyword',async()=>{
  const requests=[];
  const api={request:async(method,uri,query)=>{
    requests.push({method,uri,query});
    return {data:[query.id==='kw-1'
      ?{id:query.id,data:[{period:'2026-08-22',avgRnk:2},{period:'2026-08-23',avgRnk:3}]}
      :{id:query.id,data:[]}]};
  }};
  const db={from(table){
    assert.equal(table,'naver_bid_keyword_rules');
    return {select(){return {in:async(_field,ids)=>({data:ids.map(id=>({ncc_keyword_id:id,target_rank:id==='kw-1'?3:null})),error:null})};}};
  }};

  const result=await signals.loadBidListSignals({db,api,keywordIds:['kw-1','kw-2'],now:new Date('2026-08-24T03:00:00.000Z')});
  assert.equal(requests.length,2);
  requests.forEach((request,index)=>{
    assert.equal(request.method,'GET');
    assert.equal(request.uri,'/stats');
    assert.equal(request.query.id,`kw-${index+1}`);
    assert.equal(request.query.ids,undefined);
    assert.deepEqual(request.query.fields,['avgRnk']);
    assert.deepEqual(request.query.timeRange,{since:'2026-08-17',until:'2026-08-23'});
    assert.equal(request.query.timeIncrement,1);
  });
  assert.equal(result.platform,'NAVER');
  assert.equal(result.signals[0].hit_rate.percent,100);
  assert.equal(result.signals[1].hit_rate.percent,null);
});

test('24-15 limits individual Naver rank probes to three concurrent requests',async()=>{
  let active=0,maxActive=0,calls=0;
  const api={request:async(_method,_uri,query)=>{
    calls+=1;
    active+=1;
    maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,5));
    active-=1;
    return {data:[{id:query.id,data:[]}]};
  }};
  const db={from(){return {select(){return {in:async()=>({data:[],error:null})};}};}};
  const ids=Array.from({length:7},(_,index)=>`kw-${index+1}`);

  await signals.loadBidListSignals({db,api,keywordIds:ids,now:new Date('2026-08-24T03:00:00.000Z')});
  assert.equal(calls,7);
  assert.ok(maxActive<=3,`maximum active requests was ${maxActive}`);
});

test('24-15 owner API rejects anonymous requests before a provider call',async()=>{
  const routeUrl=pathToFileURL(path.join(__dirname,'..','app','api','naver','bid-list-signals','route.js')).href;
  const route=await import(`${routeUrl}?test=${Date.now()}`);
  const response=await route.GET(new Request('https://hub.example/api/naver/bid-list-signals?keywordIds=kw-1'));
  assert.equal(response.status,401);
  assert.match(response.headers.get('cache-control')||'',/no-store/);
});

test('24-15 mounts the async list signal only in the Naver table and keeps Coupang separate',()=>{
  const table=read('app/_analysis/keyword-operations-table.js');
  const css=read('app/_analysis/harin-analysis-v8.css');
  assert.match(table,/listSignalEnabled=!isCoupang/);
  assert.match(table,/\/api\/naver\/bid-list-signals/);
  assert.match(table,/순위 신호/);
  assert.match(table,/목표 설정 필요/);
  assert.match(table,/순위 확인 필요/);
  assert.match(css,/keywordOpsRankSignal/);
  assert.doesNotMatch(read('lib/naver/bid-list-signals.js'),/COUPANG|쿠팡/);
});
