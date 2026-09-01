'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const center=require('../lib/advertising/channel-center.js');
const routes=require('../lib/navigation/hub-routes.js');
const root=path.resolve(__dirname,'..');

const now=new Date('2026-08-18T03:00:00.000Z');

test('phase 19-7 only shows channels with real advertising operations',()=>{
  const result=center.buildAdvertisingChannelCenter({
    naver:{campaigns:[],adgroupCount:0,keywordCount:0,stats:[],syncs:[]},
    cafe24:{attribution:[],syncs:[]},
    coupang:{daily:[{date:'2026-08-18'}],campaigns:[{campaign_id:'c-1'}],keywordTop:[],keywordWaste:[],billing:[],syncs:[]},
    env:{},now
  });
  assert.deepEqual(result.channels.map(item=>item.platform),['COUPANG']);
  assert.deepEqual(result.excluded.map(item=>item.platform),['NAVER','CAFE24']);
  assert.equal(result.channels[0].sourceMode,'WING_FILE_IMPORT');
  assert.equal(result.channels[0].writeStatus,'MANUAL_REQUIRED');
});

test('Cafe24 광고 귀속 API는 비용을 추정하지 않고 읽기 전용 채널로 분리한다',()=>{
  const result=center.buildAdvertisingChannelCenter({
    cafe24:{
      attribution:[
        {dimension_type:'MEDIA',ad:'네이버',period_end:'2026-08-18',visit_count:50,order_count:5,revenue:70000,ad_spend:null},
        {dimension_type:'KEYWORD',ad:'네이버',keyword:'작두콩차',period_end:'2026-08-18',visit_count:20,order_count:3,revenue:45000,ad_spend:null}
      ],
      syncs:[{platform:'CAFE24',job_type:'FETCH_ALL',status:'SUCCESS',finished_at:'2026-08-18T02:30:00.000Z'}]
    },
    env:{},now
  });
  const cafe=result.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.readStatus,'READY');
  assert.equal(cafe.writeStatus,'LOCKED');
  assert.equal(cafe.counts.media,1);
  assert.equal(cafe.counts.keywords,1);
  assert.equal(cafe.counts.attributed_orders,5);
  assert.equal(cafe.counts.ad_spend,null);
  assert.match(cafe.officialScope,/광고비/);
});

test('naver and coupang readiness stay separate and never unlock coupang writes',()=>{
  const result=center.buildAdvertisingChannelCenter({
    naver:{
      campaigns:[{ncc_campaign_id:'cmp-1'}],adgroupCount:2,keywordCount:7,stats:[{date:'2026-08-18'}],
      syncs:[{platform:'NAVER',job_type:'SEARCH_AD_CONNECTION_TEST',status:'SUCCESS',finished_at:'2026-08-18T02:30:00.000Z'}]
    },
    coupang:{daily:[{date:'2026-08-18'}],campaigns:[{campaign_id:'cp-1'}],keywordTop:[{keyword:'작두콩차'}],keywordWaste:[],billing:[],syncs:[]},
    env:{NAVER_SEARCH_AD_WRITE_ENABLED:'true'},now
  });
  const naver=result.channels.find(item=>item.platform==='NAVER');
  const coupang=result.channels.find(item=>item.platform==='COUPANG');
  assert.equal(naver.readStatus,'READY');
  assert.equal(naver.writeStatus,'OWNER_APPROVAL');
  assert.equal(naver.writeReady,true);
  assert.equal(coupang.writeReady,false);
  assert.equal(coupang.writeStatus,'MANUAL_REQUIRED');
  assert.match(coupang.officialScope,/광고 키워드 입찰/);
  assert.equal(naver.counts.keywords,7);
  assert.equal(coupang.counts.visible_keywords,1);
});

test('naver writes remain locked without feature flag or fresh read proof',()=>{
  const stale={
    campaigns:[{ncc_campaign_id:'cmp-1'}],adgroupCount:1,keywordCount:1,stats:[],
    syncs:[{platform:'NAVER',job_type:'FETCH_ALL',status:'SUCCESS',finished_at:'2026-08-15T00:00:00.000Z'}]
  };
  assert.equal(center.naverChannel(stale,{NAVER_SEARCH_AD_WRITE_ENABLED:'false'},now).writeStatus,'LOCKED');
  assert.equal(center.naverChannel(stale,{NAVER_SEARCH_AD_WRITE_ENABLED:'true'},now).writeStatus,'READ_REFRESH_REQUIRED');
});

test('advertising workspace is a real owner-only dashboard route',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'advertising'}),'/data-collection/advertising');
  assert.deepEqual(routes.parseHubHref('/data-collection/advertising'),{view:'collection',workspace:'advertising',platform:'all',period:'DAY',product:'ALL'});
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/advertising/page.js')),true);
  const page=fs.readFileSync(path.join(root,'app/data-collection/advertising/page.js'),'utf8');
  const dashboard=fs.readFileSync(path.join(root,'app/legacy-dashboard-client.js'),'utf8');
  const service=fs.readFileSync(path.join(root,'lib/advertising/channel-center.js'),'utf8');
  assert.match(page,/renderDashboardRoute\('collection'/);
  assert.match(dashboard,/workspace==='advertising'/);
  assert.match(service,/NAVER_SEARCH_AD_WRITE_ENABLED/);
  assert.doesNotMatch(service,/receiver_name|receiver_phone|receiver_address|customer_id/);
});

test('advertising center uses separate channel actions and responsive V8 cards',()=>{
  const ui=fs.readFileSync(path.join(root,'app/advertising-channel-center.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');
  assert.match(ui,/네이버·카페24·쿠팡/);
  assert.match(ui,/WING에서 직접 반영/);
  assert.match(ui,/\/api\/naver\/probe|primaryAction\.endpoint/);
  assert.match(ui,/result\.channel/);
  assert.doesNotMatch(ui,/window\.location\.reload|location\.reload|router\.refresh/);
  const cafeRoute=fs.readFileSync(path.join(root,'app/api/cafe24/fetch-all/route.js'),'utf8');
  assert.match(cafeRoute,/buildAdvertisingChannelCenter/);
  assert.match(cafeRoute,/channel:cafe24Channel/);
  assert.match(css,/\.advertisingChannelGrid/);
  assert.match(css,/@media\(max-width:760px\)/);
});
