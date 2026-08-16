'use strict';

const DESIGN_PRESET = Object.freeze({
  id:'harin-pastel-v8',
  label:'하린 파스텔 V8',
  colors:Object.freeze({
    lavender:'#7f73c5',
    lavender_soft:'#f2effb',
    blue:'#7ca9d8',
    blue_soft:'#edf4fb',
    peach:'#e9ad8f',
    peach_soft:'#fff1ea',
    mint:'#79b9a3',
    mint_soft:'#edf8f3',
    ink:'#171a33',
    ink_soft:'#555a72'
  }),
  typography:Object.freeze({body_min_px:16,support_min_px:14,control_min_px:15}),
  interaction:Object.freeze({touch_min_px:48,radius_px:[17,20,26],reduced_motion_supported:true}),
  rules:Object.freeze({
    green_usage:'SEMANTIC_STATUS_ONLY',
    pictogram_required_for_primary_actions:true,
    page_ai_default:'COLLAPSED',
    mobile_navigation:'BOTTOM_FIXED',
    progressive_disclosure:true
  })
});

const MARKET_WORKSPACES = Object.freeze([
  {id:'home',label:'프로젝트 홈',route:'/market-intelligence'},
  {id:'data',label:'자료실',route:'/market-intelligence/[projectId]/data'},
  {id:'market',label:'시장 분석',route:'/market-intelligence/[projectId]/market'},
  {id:'competition',label:'경쟁 분석',route:'/market-intelligence/[projectId]/competition'},
  {id:'conversion',label:'구매 전환',route:'/market-intelligence/[projectId]/conversion'}
]);

const PRODUCT_PROJECT_TEMPLATE = Object.freeze({
  id:'market-conversion-product-v1',
  product_source:'ACTIVE_MASTER_PRODUCTS',
  selection_mode:'OWNER_SELECTABLE',
  product_change_behavior:'OPEN_OR_CREATE_ISOLATED_PROJECT',
  fields:Object.freeze([
    'master_product_id','project_name','product_snapshot','offer_snapshot','market_scope',
    'evidence_ids','competitor_ids','conversion_barriers','experiment_ids','analysis_version'
  ]),
  isolation:Object.freeze({
    project_key:'master_product_id',
    version_each_analysis:true,
    copy_previous_product_evidence:false,
    allow_template_clone:true
  }),
  ui:Object.freeze({
    selector_label:'분석할 상품',
    selector_location:'PAGE_HEADER_TOOLBAR',
    only_saleable_products:true,
    remember_last_product:true,
    show_switch_warning_for_unsaved_changes:true
  })
});

const PRESERVED_CAPABILITIES = Object.freeze([
  {id:'keywords',owner:'/keywords',reason:'네이버·쿠팡 광고 키워드와 입찰 운영'},
  {id:'products',owner:'/products',reason:'상품 매칭·원가·수수료·실제 이익'},
  {id:'orders',owner:'/orders',reason:'주문·배송·송장 운영'},
  {id:'insights',owner:'/insights',reason:'전체 채널 성과 요약'},
  {id:'collection',owner:'/data-collection',reason:'API·고정 IP·재시도 운영'},
  {id:'experiments',owner:'/ab-tests',reason:'A/B 실험 계산'},
  {id:'validation',owner:'/execution-validation',reason:'7일·14일 성과 검증'},
  {id:'diagnoses',owner:'/diagnoses',reason:'보고서 보관과 버전 추적'}
]);

const DIRECT_MIGRATIONS = Object.freeze([
  {
    source:'product_growth_profiles',
    destination:'market_projects.product_snapshot',
    mode:'READ_ONLY_COMPATIBILITY_FIRST',
    delete_ui_after:['ROW_COUNT_MATCH','FIELD_CONSISTENCY_PASS','NEW_UI_SAVE_PASS','ROLLBACK_WINDOW_END']
  },
  {
    source:'product_detail_checklists',
    destination:'market_conversion_checklists.initial_snapshot',
    mode:'READ_ONLY_COMPATIBILITY_FIRST',
    delete_ui_after:['ROW_COUNT_MATCH','FIELD_CONSISTENCY_PASS','NEW_UI_SAVE_PASS','ROLLBACK_WINDOW_END']
  }
]);

const EVIDENCE_TYPES = Object.freeze({
  MEASURED:{label:'직접 측정',certainty:'HIGH'},
  RELATIVE:{label:'비교 계산',certainty:'MEDIUM'},
  PROXY:{label:'대체 지표',certainty:'MEDIUM_LOW'},
  OCR_ESTIMATE:{label:'이미지 판독',certainty:'PENDING_REVIEW'},
  AI_HYPOTHESIS:{label:'AI 가설',certainty:'UNVERIFIED'}
});

const MARKET_SCOPE_LEVELS = Object.freeze([
  {id:'L0',label:'우리 상품',description:'선택한 기준상품'},
  {id:'L1',label:'직접 경쟁',description:'같은 원료·형태·구매상황'},
  {id:'L2',label:'같은 문제 해결',description:'다른 원료지만 같은 구매 목적'},
  {id:'L3',label:'같은 고객 예산',description:'한정된 예산에서 함께 비교되는 상품'},
  {id:'L4',label:'상위 카테고리',description:'차·음료·건강식품 등 상위 범주'},
  {id:'L5',label:'생활 대안',description:'상품 밖의 행동·서비스 대안'},
  {id:'EX',label:'제외',description:'근거가 부족하거나 비교가 부적절함'}
]);

const CLAIM_RULES = Object.freeze({
  BLOCKED:[/치료/u,/완치/u,/부작용\s*(?:이|가)?\s*없/u,/100\s*%\s*안전/u,/무조건/u,/유일/u,/최고/u],
  VERIFY:[/면역/u,/혈당/u,/혈압/u,/다이어트/u,/항산화/u,/효능/u,/효과/u,/건강에\s*도움/u]
});

const JAKSUCHA_GOLD_SET = Object.freeze({
  fixture_role:'FIRST_VALIDATION_EXAMPLE_ONLY',
  reusable_template_id:PRODUCT_PROJECT_TEMPLATE.id,
  product:Object.freeze({slug:'jaksucha',display_name:'작수차',master_product_id:null}),
  offers:Object.freeze([
    {bundle_count:30,status:'NEEDS_EVIDENCE'},
    {bundle_count:90,status:'NEEDS_EVIDENCE'},
    {bundle_count:150,status:'NEEDS_EVIDENCE'}
  ]),
  metrics:Object.freeze({market_size:'UNKNOWN',repurchase_rate:'UNKNOWN',actual_profit:'UNKNOWN'}),
  required_evidence:Object.freeze(['PRODUCT_SNAPSHOT','PRICE_SNAPSHOT','REVIEW_SAMPLE','CHANNEL_PERFORMANCE'])
});

function normalizeEvidence(input={}) {
  const type=Object.hasOwn(EVIDENCE_TYPES,input.type)?input.type:'AI_HYPOTHESIS';
  const confidence=Number.isFinite(Number(input.confidence))?Math.max(0,Math.min(1,Number(input.confidence))):null;
  return {
    id:String(input.id||''),
    type,
    source_url:String(input.source_url||''),
    captured_at:input.captured_at||null,
    confidence,
    owner_confirmed:Boolean(input.owner_confirmed),
    value:input.value??null
  };
}

function evidenceDecision(input={}) {
  const evidence=normalizeEvidence(input);
  if(!evidence.source_url && evidence.type!=='MEASURED')return {...evidence,status:'NEEDS_SOURCE'};
  if(evidence.type==='OCR_ESTIMATE' && (!evidence.owner_confirmed || (evidence.confidence??0)<0.95)){
    return {...evidence,status:'OWNER_CONFIRMATION_REQUIRED'};
  }
  if(evidence.type==='AI_HYPOTHESIS')return {...evidence,status:'UNVERIFIED'};
  return {...evidence,status:'VERIFIED'};
}

function claimDecision(value='') {
  const text=String(value).trim();
  if(!text)return {status:'EMPTY',matches:[]};
  const blocked=CLAIM_RULES.BLOCKED.filter(rule=>rule.test(text)).map(rule=>rule.source);
  if(blocked.length)return {status:'BLOCKED',matches:blocked};
  const verify=CLAIM_RULES.VERIFY.filter(rule=>rule.test(text)).map(rule=>rule.source);
  if(verify.length)return {status:'VERIFY',matches:verify};
  return {status:'ALLOWED',matches:[]};
}

function validateDifferentiation(input={}) {
  const competitor=evidenceDecision(input.competitorPainEvidence||{});
  const own=evidenceDecision(input.ownResolutionEvidence||{});
  return {
    status:competitor.status==='VERIFIED'&&own.status==='VERIFIED'?'VERIFIED':'BLOCKED',
    competitor_evidence_status:competitor.status,
    own_evidence_status:own.status
  };
}

function createProductProject(input={}) {
  const masterProductId=String(input.master_product_id||'').trim();
  if(!masterProductId)throw Object.assign(new Error('분석할 판매 중 상품을 먼저 선택해주세요.'),{code:'MASTER_PRODUCT_REQUIRED'});
  return {
    template_id:PRODUCT_PROJECT_TEMPLATE.id,
    master_product_id:masterProductId,
    project_name:String(input.project_name||input.product_name||'상품 시장·전환 분석'),
    status:'DRAFT',
    analysis_version:1,
    market_scope:[],
    evidence_ids:[],
    product_snapshot:input.product_snapshot||null
  };
}

function foundationSummary() {
  return {
    phase:'17-0',
    routes:MARKET_WORKSPACES.length,
    preserved_capabilities:PRESERVED_CAPABILITIES.length,
    direct_migrations:DIRECT_MIGRATIONS.length,
    product_selection:PRODUCT_PROJECT_TEMPLATE.selection_mode,
    openai_calls_when_disabled:0,
    design_preset:DESIGN_PRESET.id
  };
}

module.exports={
  DESIGN_PRESET,MARKET_WORKSPACES,PRODUCT_PROJECT_TEMPLATE,PRESERVED_CAPABILITIES,DIRECT_MIGRATIONS,
  EVIDENCE_TYPES,MARKET_SCOPE_LEVELS,CLAIM_RULES,JAKSUCHA_GOLD_SET,normalizeEvidence,evidenceDecision,
  claimDecision,validateDifferentiation,createProductProject,foundationSummary
};
