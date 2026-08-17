'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/label-evidence/config.js');
const dataGo=require('../lib/label-evidence/data-go-client.js');
const nutrition=require('../lib/label-evidence/mfds-nutrition.js');
const haccp=require('../lib/label-evidence/haccp.js');
const ingredient=require('../lib/label-evidence/ingredient.js');
const usda=require('../lib/label-evidence/usda.js');
const service=require('../lib/market-intelligence/label-evidence.js');
const utils=require('../lib/public-evidence/candidate-utils.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('phase 20-2 keeps four server-only read providers independently configured',()=>{
  const env={DATA_GO_KR_SERVICE_KEY:'data-key',FOOD_SAFETY_KOREA_API_KEY:'food-key',USDA_FDC_API_KEY:'usda-key'};
  assert.equal(config.providerConfig('MFDS_NUTRITION',env).apiKey,'data-key');
  assert.equal(config.providerConfig('FOOD_SAFETY_HACCP',env).apiKey,'food-key');
  assert.equal(config.providerConfig('FOOD_SAFETY_INGREDIENT',env).apiKey,'food-key');
  assert.equal(config.providerConfig('USDA_FDC',env).apiKey,'usda-key');
  assert.deepEqual(config.missingFields('MFDS_NUTRITION',{apiKey:''}),['공공데이터포털 서비스키']);
});

test('MFDS nutrition adapter prefers report number and normalizes core Korean label nutrients',async()=>{
  let requested='';
  const result=await nutrition.probe({config:{apiKey:'secret'},query:'레드비트차',reportNumber:'202600001',now:new Date('2026-08-18T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>({response:{header:{resultCode:'00',resultMsg:'NORMAL SERVICE'},body:{totalCount:1,items:[{FOOD_NM_KR:'레드비트차',ITEM_REPORT_NO:'202600001',MAKER_NM:'하린식품',SERVING_SIZE:'1.5 g',AMT_NUM1:'3',AMT_NUM13:'0'}]}}})};}});
  assert.match(requested,/ITEM_REPORT_NO=202600001/u);assert.match(requested,/serviceKey=secret/u);assert.equal(result.status,'SUCCESS');assert.equal(result.candidates[0].metadata.report_no,'202600001');assert.equal(result.candidates[0].metadata.nutrients.AMT_NUM1.label,'열량');assert.match(result.candidates[0].source_url,/data\.go\.kr/u);
});

test('HACCP and ingredient adapters preserve their different official meanings',()=>{
  const h=haccp.normalizeRow({BSSH_NM:'하린식품',LCNS_NO:'123',HACCP_APPN_NO:'H-1',PRDLST_NM:'침출차',CLSBIZ_DVS_CD_NM:'영업'},'2026-08-18T00:00:00Z');
  assert.equal(h.evidence_kind,'ESTABLISHMENT_HACCP_DESIGNATION');assert.match(h.summary,/개별 판매상품 인증을 뜻하지 않/u);assert.equal(h.metadata.food_type,'침출차');
  const i=ingredient.normalizeRow({RPRSNT_RAWMTRL_NM:'작두콩',SCNM:'Canavalia gladiata',USE_CND_STDR_CN:'식품에 사용 가능'},'2026-08-18T00:00:00Z');
  assert.equal(i.evidence_kind,'INGREDIENT_USAGE_REFERENCE');assert.equal(i.metadata.scientific_name,'Canavalia gladiata');assert.match(i.summary,/사용조건/u);
});

test('USDA adapter is visibly international reference and excludes secrets',async()=>{
  let requested='';
  const result=await usda.probe({config:{apiKey:'private-usda'},query:'jack bean tea',now:new Date('2026-08-18T00:00:00Z'),fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>({totalHits:1,foods:[{fdcId:123,description:'Jack bean',dataType:'Foundation',servingSize:100,servingSizeUnit:'g',foodNutrients:[{nutrientName:'Protein',value:12,unitName:'G'}]}]})};}});
  assert.match(requested,/api\.nal\.usda\.gov\/fdc\/v1\/foods\/search/u);assert.match(requested,/api_key=private-usda/u);assert.equal(result.candidates[0].evidence_kind,'INTERNATIONAL_NUTRIENT_CROSSCHECK');assert.match(result.candidates[0].summary,/국내 제품 표시값이 아닙니다/u);assert.doesNotMatch(JSON.stringify(result.candidates[0]),/private-usda/u);
});

test('label candidates are host restricted, signed and stored only as PROXY pending owner confirmation',()=>{
  const candidates=[
    nutrition.normalizeRow({FOOD_NM_KR:'차',ITEM_REPORT_NO:'1',AMT_NUM1:'3'},'2026-08-18T00:00:00Z'),
    haccp.normalizeRow({BSSH_NM:'하린식품',LCNS_NO:'2',HACCP_APPN_NO:'3'},'2026-08-18T00:00:00Z'),
    ingredient.normalizeRow({RPRSNT_RAWMTRL_NM:'작두콩'},'2026-08-18T00:00:00Z'),
    usda.normalizeRow({fdcId:4,description:'Bean',foodNutrients:[]},'2026-08-18T00:00:00Z')
  ];
  for(const candidate of candidates){const token=utils.signCandidate(candidate,'test-secret'),restored=service.candidateFromInput({...candidate,candidate_token:token});assert.equal(utils.verifyCandidate(restored,token,'test-secret'),true,candidate.provider);}
  assert.throws(()=>service.candidateFromInput({...candidates[0],source_url:'https://evil.example.com'}),/공식 표시정보 원문/u);
  const source=read('lib/market-intelligence/label-evidence.js');assert.match(source,/evidence_type:'PROXY'/);assert.match(source,/status:'OWNER_CONFIRMATION_REQUIRED'/);assert.match(source,/LABEL_EVIDENCE_CANDIDATE_SAVED/);assert.match(source,/Promise\.allSettled/);assert.doesNotMatch(source,/NEXT_PUBLIC_/);
});

test('allergen scan is an explicit package-check candidate and never proof of absence',()=>{
  assert.deepEqual(service.scanAllergens('볶은 작두콩, 대두, 밀 함유'),['대두','밀']);
  const client=read('app/market-intelligence/[projectId]/data/label-evidence-client.js');assert.match(client,/후보 없음은 알레르기 성분이 없다는 뜻이 아니며 실제 포장을 확인/u);assert.match(client,/HACCP는 개별 판매상품 인증이 아니라/u);assert.match(client,/USDA는 해외 비교값/u);
});

test('label cross-check route is owner authenticated, manual only, mobile readable and product isolated',()=>{
  const route=read('app/api/market-intelligence/projects/[projectId]/label-evidence/route.js'),client=read('app/market-intelligence/[projectId]/data/label-evidence-client.js'),workspace=read('app/market-intelligence/[projectId]/workspace-page.js'),css=read('app/_analysis/harin-market-intelligence.css'),env=read('.env.example');
  assert.match(route,/isAuthorized\(request,authModule\)/);assert.match(route,/maxBytes:64\*1024/);assert.match(client,/외부 API는 이 버튼을 눌렀을 때만 호출/);assert.match(client,/다른 상품 자료와 섞이지 않음/);
  assert.match(workspace,/MarketLabelEvidence/);assert.ok(workspace.indexOf('MarketOfficialEvidence projectId')<workspace.indexOf('MarketLabelEvidence projectId'));assert.ok(workspace.indexOf('MarketLabelEvidence projectId')<workspace.indexOf('MarketResearchEvidence projectId'));
  assert.match(css,/\.marketLabelEvidenceWorkbench/);assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*\.harinV8 \.marketLabelEvidenceWorkbench/);assert.match(css,/\.marketLabelEvidenceWorkbench button[^}]*min-height:48px/u);
  assert.match(env,/DATA_GO_KR_SERVICE_KEY=/);assert.match(env,/USDA_FDC_API_KEY=/);assert.doesNotMatch(env,/NEXT_PUBLIC_DATA_GO|NEXT_PUBLIC_USDA/u);
});
