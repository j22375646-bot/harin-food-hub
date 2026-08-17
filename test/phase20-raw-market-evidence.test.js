'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/raw-market-evidence/config.js');
const customs=require('../lib/raw-market-evidence/customs-trade.js');
const exim=require('../lib/raw-market-evidence/exim-fx.js');
const kosis=require('../lib/raw-market-evidence/kosis-search.js');
const service=require('../lib/market-intelligence/raw-market-evidence.js');
const utils=require('../lib/public-evidence/candidate-utils.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('phase 20-3 keeps three read-only providers independently configured',()=>{
  const env={DATA_GO_KR_SERVICE_KEY:'data-key',KOREA_EXIM_API_KEY:'fx-key',KOSIS_API_KEY:'kosis-key'};
  assert.equal(config.providerConfig('KCS_TRADE',env).apiKey,'data-key');
  assert.equal(config.providerConfig('KOREA_EXIM_FX',env).apiKey,'fx-key');
  assert.equal(config.providerConfig('KOSIS_SEARCH',env).apiKey,'kosis-key');
  assert.deepEqual(config.missingFields('KCS_TRADE',{apiKey:''}),['공공데이터포털 서비스키·관세청 API 활용신청']);
});

test('Customs adapter calls the official monthly item-trade endpoint and keeps company demand uncertain',async()=>{
  let requested='';
  const xml='<?xml version="1.0"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items><item><year>2026.07</year><statCdCntnKor1>중국</statCdCntnKor1><statCd>CN</statCd><statKor>콩류</statKor><hsCd>071339</hsCd><impWgt>1234</impWgt><impDlr>5678</impDlr><expWgt>9</expWgt><expDlr>10</expDlr><balPayments>-5668</balPayments></item></items><totalCount>1</totalCount></body></response>';
  const result=await customs.probe({config:{apiKey:'secret'},startYymm:'202607',endYymm:'202607',hsCode:'071339',countryCode:'CN',now:new Date('2026-08-18T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,text:async()=>xml};}});
  assert.match(requested,/apis\.data\.go\.kr\/1220000\/nitemtrade\/getNitemtradeList/u);assert.match(requested,/serviceKey=secret/u);assert.equal(result.status,'SUCCESS');assert.equal(result.candidates[0].metadata.import_amount_usd,5678);assert.match(result.candidates[0].summary,/자사 매입량·판매량 또는 미래 수요를 뜻하지 않습니다/u);assert.doesNotMatch(JSON.stringify(result.candidates[0]),/secret/u);
});

test('Korea Eximbank adapter uses the current oapi domain and separates official rate from actual cost',async()=>{
  let requested='';
  const result=await exim.probe({config:{apiKey:'fx-secret'},searchDate:'20260818',currencies:['USD'],now:new Date('2026-08-18T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>[{result:1,cur_unit:'USD',cur_nm:'미국 달러',deal_bas_r:'1,350.2',bkpr:'1,350',kftc_bkpr:'1,351.1'}]};}});
  assert.match(requested,/oapi\.koreaexim\.go\.kr/u);assert.equal(result.candidates[0].metadata.deal_base_rate,1350.2);assert.match(result.candidates[0].summary,/실제 계약환율·원가를 대신하지 않습니다/u);assert.doesNotMatch(JSON.stringify(result.candidates[0]),/fx-secret/u);
});

test('KOSIS search stores a table candidate, not a fabricated market-size value',async()=>{
  let requested='';
  const result=await kosis.probe({config:{apiKey:'kosis-secret'},query:'콩 생산',now:new Date('2026-08-18T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>[{ORG_ID:'101',ORG_NM:'통계청',TBL_ID:'DT_1',TBL_NM:'두류 생산량',STAT_NM:'농작물생산조사',STRT_PRD_DE:'2020',END_PRD_DE:'2025'}]};}});
  assert.match(requested,/kosis\.kr\/openapi\/statisticsSearch\.do/u);assert.equal(result.candidates[0].evidence_kind,'OFFICIAL_MARKET_STATISTICS_TABLE');assert.equal(result.candidates[0].metadata.table_id,'DT_1');assert.match(result.candidates[0].summary,/통계표 후보/u);assert.doesNotMatch(JSON.stringify(result.candidates[0]),/kosis-secret/u);
});

test('raw-market candidates are host restricted, signed and stored as pending PROXY evidence',()=>{
  const candidates=[
    customs.normalizeRow({year:'2026.07',statCdCntnKor1:'중국',statCd:'CN',statKor:'콩류',hsCd:'071339',impWgt:'1',impDlr:'2'},'2026-08-18T00:00:00Z'),
    exim.normalizeRow({cur_unit:'USD',cur_nm:'미국 달러',deal_bas_r:'1350'},'20260818','2026-08-18T00:00:00Z'),
    kosis.normalizeRow({ORG_ID:'101',ORG_NM:'통계청',TBL_ID:'DT_1',TBL_NM:'두류 생산량'},'2026-08-18T00:00:00Z')
  ];
  for(const candidate of candidates){const token=utils.signCandidate(candidate,'test-secret'),restored=service.candidateFromInput({...candidate,candidate_token:token});assert.equal(utils.verifyCandidate(restored,token,'test-secret'),true,candidate.provider);}
  assert.throws(()=>service.candidateFromInput({...candidates[0],source_url:'https://evil.example.com'}),/공식 원재료·시장 자료 원문/u);
  const source=read('lib/market-intelligence/raw-market-evidence.js');assert.match(source,/Promise\.allSettled/);assert.match(source,/evidence_type:'PROXY'/);assert.match(source,/status:'OWNER_CONFIRMATION_REQUIRED'/);assert.match(source,/RAW_MARKET_EVIDENCE_CANDIDATE_SAVED/);assert.doesNotMatch(source,/NEXT_PUBLIC_/);
});

test('raw-market workbench is manual-only, mobile readable and product isolated',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/raw-market-evidence/route.js'),client=read('app/market-intelligence/[projectId]/market/raw-market-evidence-client.js'),workspace=read('app/market-intelligence/[projectId]/workspace-page.js'),css=read('app/_analysis/harin-market-intelligence.css'),env=read('.env.example');
  assert.match(route,/isAuthorized\(request,authModule\)/);assert.match(route,/maxBytes:64\*1024/);assert.match(client,/외부 API는 이 버튼을 눌렀을 때만 호출/);assert.match(client,/선택 상품 전용 Evidence/);assert.match(client,/자료 없음은 시장이 없거나 원가 영향이 0이라는 뜻이 아닙니다/);
  assert.match(workspace,/RawMarketEvidence/);assert.ok(workspace.indexOf('MarketContextEvidence projectId')<workspace.indexOf('RawMarketEvidence projectId'));assert.ok(workspace.indexOf('RawMarketEvidence projectId')<workspace.indexOf('MarketNaverTrend projectId'));
  assert.match(css,/\.rawMarketEvidenceWorkbench/);assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*\.harinV8 \.rawMarketEvidenceWorkbench/);assert.match(css,/\.rawMarketEvidenceWorkbench button[^}]*min-height:48px/u);
  assert.match(env,/KOREA_EXIM_API_KEY=/);assert.match(env,/KOSIS_API_KEY=/);assert.doesNotMatch(env,/NEXT_PUBLIC_KOREA_EXIM|NEXT_PUBLIC_KOSIS/u);
});
