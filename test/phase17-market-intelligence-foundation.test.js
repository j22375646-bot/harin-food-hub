'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const foundation=require('../lib/market-intelligence/foundation.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('17-0 uses reusable real-route product projects instead of a fixed Jaksucha screen',()=>{
  assert.equal(foundation.PRODUCT_PROJECT_TEMPLATE.selection_mode,'OWNER_SELECTABLE');
  assert.equal(foundation.PRODUCT_PROJECT_TEMPLATE.product_source,'ACTIVE_MASTER_PRODUCTS');
  assert.equal(foundation.PRODUCT_PROJECT_TEMPLATE.isolation.copy_previous_product_evidence,false);
  assert.ok(foundation.MARKET_WORKSPACES.every(item=>item.route.startsWith('/market-intelligence')));
  assert.ok(foundation.MARKET_WORKSPACES.every(item=>!item.route.includes('?view=')));
  const project=foundation.createProductProject({master_product_id:'tea-002',product_name:'레드비트차'});
  assert.equal(project.master_product_id,'tea-002');
  assert.equal(project.template_id,foundation.PRODUCT_PROJECT_TEMPLATE.id);
  assert.throws(()=>foundation.createProductProject({}),error=>error.code==='MASTER_PRODUCT_REQUIRED');
});

test('17-0 keeps Jaksucha only as an evidence-safe first validation fixture',()=>{
  const fixture=foundation.JAKSUCHA_GOLD_SET;
  assert.equal(fixture.fixture_role,'FIRST_VALIDATION_EXAMPLE_ONLY');
  assert.deepEqual(fixture.offers.map(item=>item.bundle_count),[30,90,150]);
  assert.equal(fixture.metrics.market_size,'UNKNOWN');
  assert.equal(fixture.metrics.repurchase_rate,'UNKNOWN');
  assert.equal(fixture.metrics.actual_profit,'UNKNOWN');
});

test('17-0 preserves existing operations and migrates only direct overlaps after every gate',()=>{
  assert.deepEqual(
    foundation.PRESERVED_CAPABILITIES.map(item=>item.id),
    ['keywords','products','orders','insights','collection','experiments','validation','diagnoses']
  );
  assert.deepEqual(foundation.DIRECT_MIGRATIONS.map(item=>item.source),['product_growth_profiles','product_detail_checklists']);
  for(const migration of foundation.DIRECT_MIGRATIONS){
    assert.equal(migration.mode,'READ_ONLY_COMPATIBILITY_FIRST');
    assert.deepEqual(migration.delete_ui_after,['ROW_COUNT_MATCH','FIELD_CONSISTENCY_PASS','NEW_UI_SAVE_PASS','ROLLBACK_WINDOW_END']);
  }
});

test('17-0 records provenance and requires owner confirmation for uncertain OCR',()=>{
  const pending=foundation.evidenceDecision({type:'OCR_ESTIMATE',source_url:'file://label.png',confidence:.91});
  assert.equal(pending.status,'OWNER_CONFIRMATION_REQUIRED');
  const verified=foundation.evidenceDecision({type:'OCR_ESTIMATE',source_url:'file://label.png',confidence:.98,owner_confirmed:true});
  assert.equal(verified.status,'VERIFIED');
  const hypothesis=foundation.evidenceDecision({type:'AI_HYPOTHESIS',source_url:'ai://analysis'});
  assert.equal(hypothesis.status,'UNVERIFIED');
});

test('17-0 verifies differentiation only when both sides have reviewed evidence',()=>{
  const result=foundation.validateDifferentiation({
    competitorPainEvidence:{type:'MEASURED',value:'리뷰 불편',owner_confirmed:true},
    ownResolutionEvidence:{type:'OCR_ESTIMATE',source_url:'file://detail.png',confidence:.9}
  });
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.own_evidence_status,'OWNER_CONFIRMATION_REQUIRED');
});

test('17-0 blocks dangerous claims and queues health claims for verification',()=>{
  assert.equal(foundation.claimDecision('질병을 완치하는 유일한 차').status,'BLOCKED');
  assert.equal(foundation.claimDecision('혈당 관리에 도움').status,'VERIFY');
  assert.equal(foundation.claimDecision('따뜻하게 즐기는 구수한 차').status,'ALLOWED');
});

test('17-0 locks the readable pastel preset and external AI stays off before activation',()=>{
  const preset=foundation.DESIGN_PRESET;
  assert.ok(preset.typography.body_min_px>=16);
  assert.ok(preset.interaction.touch_min_px>=48);
  assert.equal(preset.rules.green_usage,'SEMANTIC_STATUS_ONLY');
  assert.equal(preset.rules.page_ai_default,'COLLAPSED');
  assert.equal(foundation.foundationSummary().openai_calls_when_disabled,0);
  const css=read('app/_design-system/harin-readability-v8.css');
  assert.match(css,/--v8-readable-body:16px/);
  assert.match(css,/--v8-readable-touch:48px/);
});

test('17-0 document names product switching, preservation and evidence gates',()=>{
  const doc=read('docs/PHASE_17_MARKET_CONVERSION_FOUNDATION.md');
  assert.match(doc,/분석할 상품/);
  assert.match(doc,/고정 상품이 아니다/);
  assert.match(doc,/읽기 호환/);
  assert.match(doc,/OCR 신뢰도 95%/);
  assert.match(doc,/페이지별 AI는 합치지 않고/);
});
