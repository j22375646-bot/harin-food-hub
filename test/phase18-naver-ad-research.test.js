'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const research=require('../lib/market-intelligence/naver-ad-research.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('18-3 keeps reusable product seeds and owner-selected estimate keywords bounded',()=>{
  const profile=research.normalizeProfile({seed_keywords:['레드 비트차','레드 비트차','비트차'],selected_keywords:Array.from({length:25},(_,index)=>`검색어 ${index+1}`),target_position:3,estimate_period:'month',owner_confirmed:true},{productName:'레드비트차'});
  assert.deepEqual(profile.seed_keywords,['레드 비트차','비트차']);
  assert.equal(profile.selected_keywords.length,20);
  assert.equal(profile.estimate_period,'MONTH');
  assert.equal(profile.owner_confirmed,true);
  assert.throws(()=>research.normalizeProfile({seed_keywords:['차'],target_position:6},{productName:'차'}),/1~5위/);
});

test('18-3 preserves less-than-ten and missing query counts instead of fabricating zero',()=>{
  assert.deepEqual(research.parseMetric('< 10'),{value:null,status:'LT_10',label:'10 미만'});
  assert.deepEqual(research.parseMetric(''),{value:null,status:'NO_DATA',label:'자료 없음'});
  const rows=research.normalizeKeywordToolRows({keywordList:[{relKeyword:'레드비트차',monthlyPcQcCnt:'<10',monthlyMobileQcCnt:'120',monthlyAvePcClkCnt:'0',monthlyAveMobileClkCnt:'1.5',monthlyAvePcCtr:'0',monthlyAveMobileCtr:'0.3',plAvgDepth:'4.2',compIdx:'high'}]},['레드비트차']);
  assert.equal(rows[0].monthly_pc_queries,null);
  assert.equal(rows[0].monthly_pc_queries_status,'LT_10');
  assert.equal(rows[0].monthly_mobile_queries,120);
  assert.equal(rows[0].is_seed,true);
});

test('18-3 merges PC and mobile estimates without turning absent estimates into zero',()=>{
  const rows=research.mergeBidEstimateRows({
    keywords:['레드비트차','비트차'],
    averagePc:{estimate:[{keyword:'레드비트차',position:3,bid:520}]},
    averageMobile:{estimate:[{keyword:'레드비트차',position:3,bid:410},{keyword:'비트차',position:3,bid:300}]},
    minimumPc:{estimate:[{keyword:'레드비트차',bid:170}]},
    minimumMobile:{estimate:[{keyword:'레드비트차',bid:120}]}
  });
  assert.equal(rows[0].pc_average_position_bid,520);
  assert.equal(rows[1].pc_average_position_bid,null);
  assert.equal(rows[1].mobile_average_position_bid,300);
  assert.equal(research.summarizeBidRows(rows,{successfulSources:3,totalSources:4}).data_status,'PARTIAL');
});

test('18-3 uses only official read and estimate endpoints and never performs an ad write',()=>{
  const service=read('lib/market-intelligence/naver-ad-research.js');
  assert.match(service,/GET','\/keywordstool'/);
  assert.match(service,/\/estimate\/average-position-bid\/keyword/);
  assert.match(service,/\/estimate\/exposure-minimum-bid\/keyword/);
  assert.match(service,/Promise\.allSettled/);
  assert.doesNotMatch(service,/\/ncc\/keywords\/[^']+|NAVER_SEARCH_AD_WRITE_ENABLED|bid-execution/);
  assert.match(service,/SEARCH_AD_KEYWORD_TOOL/);
  assert.match(service,/SEARCH_AD_BID_ESTIMATE/);
});

test('18-3 database isolates research profiles and snapshots by both project and product',()=>{
  const sql=read('supabase/migrations/20260817190000_add_market_naver_ad_research.sql');
  const hardening=read('supabase/migrations/20260817191500_harden_market_naver_ad_research.sql');
  for(const table of ['market_naver_ad_research_profiles','market_naver_ad_research_snapshots']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.match(sql,/master_product_id uuid not null/);
  assert.match(sql,/market NAVER ad research product does not match project/);
  assert.match(sql,/security invoker/);
  assert.match(sql,/never converted to zero/);
  assert.match(sql,/never authorize or perform platform writes/);
  assert.match(hardening,/market_naver_ad_research_profiles_product_idx/);
  assert.match(hardening,/market_naver_ad_research_snapshots_profile_idx/);
  assert.match(hardening,/for all\s+to anon, authenticated\s+using \(false\)\s+with check \(false\)/s);
});

test('18-3 route is owner-session protected and product page AI stays separate',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/naver-ad-research/route.js');
  assert.match(route,/apiSafety\.isAuthorized\(request,authModule\)/);
  assert.match(route,/body\.action==='DISCOVER'/);
  assert.match(route,/body\.action==='ESTIMATE'/);
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  assert.match(workspace,/MarketNaverAdResearch/);
  assert.match(workspace,/MarketNaverTrend/);
  assert.match(workspace,/MarketPageAi/);
  const client=read('app/market-intelligence/[projectId]/market/naver-ad-research-client.js');
  assert.match(client,/네이버 검색광고 자료만/);
  assert.match(client,/광고를 바꾸지 않습니다/);
  assert.match(client,/네이버 키워드 운영으로 이동/);
});

test('18-3 uses readable V8 pastel tables and mobile 48px controls',()=>{
  const css=read('app/_analysis/harin-market-intelligence.css');
  assert.match(css,/Phase 18-3/);
  assert.match(css,/\.marketNaverAdResearchWorkbench/);
  assert.match(css,/\.marketAdKeywordTable/);
  assert.match(css,/\.marketAdEstimateTable/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/marketNaverAdResearchWorkbench button[^}]+min-height:48px/);
});
