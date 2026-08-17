'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/public-evidence/config.js');
const foodClient=require('../lib/public-evidence/food-safety-client.js');
const foodProduct=require('../lib/public-evidence/food-product.js');
const foodRecall=require('../lib/public-evidence/food-recall.js');
const law=require('../lib/public-evidence/korean-law.js');
const utils=require('../lib/public-evidence/candidate-utils.js');
const official=require('../lib/market-intelligence/official-evidence.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('phase 19-2 keeps product, recall and law credentials and kill switches isolated',()=>{
  const env={FOOD_SAFETY_KOREA_API_KEY:'food-key',KOREAN_LAW_API_OC:'law-oc',FOOD_SAFETY_RECALL_ENABLED:'false'};
  const product=config.providerConfig('FOOD_SAFETY_PRODUCT',env),recall=config.providerConfig('FOOD_SAFETY_RECALL',env),lawConfig=config.providerConfig('KOREAN_LAW',env);
  assert.equal(product.apiKey,'food-key');assert.equal(product.enabled,true);
  assert.equal(recall.apiKey,'food-key');assert.equal(recall.enabled,false);
  assert.equal(lawConfig.oc,'law-oc');assert.equal(Object.hasOwn(lawConfig,'apiKey'),false);
  assert.deepEqual(config.missingFields('KOREAN_LAW',{oc:''}),['국가법령정보 공동활용 OC']);
});

test('FoodSafetyKorea client uses the official HTTPS service path and preserves no-data',async()=>{
  const url=foodClient.requestUrl({apiKey:'secret',serviceId:'C002',filter:{key:'PRDLST_NM',value:'작두콩차'}});
  assert.match(url,/^https:\/\/openapi\.foodsafetykorea\.go\.kr\/api\/secret\/C002\/json\/1\/20\/PRDLST_NM=/u);
  const result=await foodClient.fetchService({apiKey:'secret',serviceId:'C002',filter:{key:'PRDLST_NM',value:'없는상품'},fetchImpl:async()=>({ok:true,json:async()=>({C002:{total_count:'0',RESULT:{CODE:'INFO-200',MSG:'해당하는 데이터가 없습니다.'}}})})});
  assert.equal(result.status,'NO_DATA');assert.equal(result.totalCount,0);
});

test('official food product and recall rows keep useful business evidence without contact PII',()=>{
  const product=foodProduct.normalizeRow({PRDLST_NM:'작두콩차',PRDLST_REPORT_NO:'2026001',BSSH_NM:'하린식품',PRDLST_DCNM:'침출차',RAWMTRL_NM:'작두콩 100%',PRMS_DT:'20260801'},'2026-08-17T00:00:00.000Z');
  assert.equal(product.metadata.report_no,'2026001');assert.match(product.summary,/작두콩 100%/);assert.equal(product.provider,'FOOD_SAFETY_PRODUCT');
  const recall=foodRecall.normalizeRow({PRDTNM:'작두콩차',PRDLST_REPORT_NO:'2026001',RTRVLDSUSE_SEQ:'R-1',RTRVLPRVNS:'표시사항 확인',BSSHNM:'하린식품',ADDR:'저장하면 안 되는 주소',TELNO:'010-0000-0000'},'2026-08-17T00:00:00.000Z');
  assert.equal(recall.metadata.recall_reason,'표시사항 확인');assert.equal(Object.hasOwn(recall.metadata,'address'),false);assert.equal(Object.hasOwn(recall.metadata,'telephone'),false);
  assert.doesNotMatch(JSON.stringify(recall),/010-0000|저장하면 안 되는 주소/u);
});

test('recall lookup waits for a report number instead of scanning or inventing zero',async()=>{
  const result=await foodRecall.probe({config:{apiKey:'secret'},reportNumbers:[],fetchImpl:async()=>{throw new Error('must not call');}});
  assert.equal(result.status,'NO_DATA');assert.equal(result.reason,'REPORT_NUMBER_REQUIRED');assert.equal(result.candidates.length,0);
});

test('Korean law adapter uses the official DRF endpoint and strips OC from saved candidates',async()=>{
  let requested='';
  const result=await law.probe({config:{oc:'private-oc'},terms:['식품위생법'],fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>({LawSearch:{law:{'법령명한글':'식품위생법','법령일련번호':'286825','법령ID':'001805','법령구분명':'법률','소관부처명':'식품의약품안전처','제개정구분명':'일부개정','시행일자':'20290101','공포일자':'20260609'}}})};}});
  assert.match(requested,/www\.law\.go\.kr\/DRF\/lawSearch\.do/u);assert.match(requested,/OC=private-oc/u);
  assert.equal(result.candidates[0].title,'식품위생법');assert.doesNotMatch(JSON.stringify(result.candidates[0]),/private-oc/u);
});

test('signed official candidates cannot be changed in the browser',()=>{
  const candidate=foodProduct.normalizeRow({PRDLST_NM:'작두콩차',PRDLST_REPORT_NO:'2026001',BSSH_NM:'하린식품'},'2026-08-17T00:00:00.000Z');
  const token=utils.signCandidate(candidate,'test-secret');assert.equal(utils.verifyCandidate(candidate,token,'test-secret'),true);assert.equal(utils.verifyCandidate({...candidate,title:'바꾼 제목'},token,'test-secret'),false);
  const restored=official.candidateFromInput({...candidate,candidate_token:token});assert.equal(restored.external_key,candidate.external_key);
  assert.throws(()=>official.candidateFromInput({...candidate,source_url:'https://evil.example.com'}),/공식 원문/);
});

test('official Evidence route and workspace require Hub auth and keep owner confirmation',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/official-evidence/route.js');
  const service=read('lib/market-intelligence/official-evidence.js');
  const workspace=read('app/market-intelligence/[projectId]/workspace-page.js');
  assert.match(route,/isAuthorized\(request,authModule\)/);assert.match(route,/maxBytes:64\*1024/);
  assert.match(service,/status:'OWNER_CONFIRMATION_REQUIRED'/);assert.match(service,/ocr_engine:candidate\.provider/);assert.match(service,/source_kind:'API'/);
  assert.match(workspace,/MarketOfficialEvidence/);assert.doesNotMatch(service,/NEXT_PUBLIC_/);
});

test('official Evidence UI explains deferred keys and has readable mobile controls',()=>{
  const client=read('app/market-intelligence/[projectId]/data/official-evidence-client.js');
  const css=read('app/_analysis/harin-market-intelligence.css');const env=read('.env.example');
  assert.match(client,/API 키는 개발계획 완료 후 한 번에 입력/);assert.match(client,/품목정보에서 찾은 번호를 회수조회에 자동/);assert.match(client,/화면을 여는 것만으로 외부 API를 호출하지 않습니다/);
  assert.match(css,/\.marketOfficialEvidenceWorkbench/);assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*\.harinV8 \.marketOfficialEvidenceWorkbench/);
  assert.match(env,/FOOD_SAFETY_KOREA_API_KEY=/);assert.match(env,/KOREAN_LAW_API_OC=/);
});
