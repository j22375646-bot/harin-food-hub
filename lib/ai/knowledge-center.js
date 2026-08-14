'use strict';

const CATEGORIES = Object.freeze({
  PLANNING:'기획·운영 원칙', PRODUCT:'상품·브랜드', MARKETING:'광고·성장',
  COMPLIANCE:'표현·법규', CS:'CS 응대', COST_SHIPPING:'원가·배송'
});
const PAGE_LABELS = Object.freeze({
  main:'메인', insight:'인사이트', keyword:'키워드', product:'상품', inventory:'재고관리', settlement:'정산·비용'
});
const STATUSES = new Set(['DRAFT','READY','ACTIVE','ARCHIVED']);
const PRIVACY_STATUSES = new Set(['REVIEW_REQUIRED','APPROVED','BLOCKED']);

const RECOMMENDED_DOCUMENTS = Object.freeze([
  { id:'plan-v3', title:'통합매출성장허브 PM·UX 통합기획서 v3.0', category:'PLANNING', reason:'허브의 목적·화면 원칙·사장님 의사결정 기준', scopes:['main','insight','product'] },
  { id:'plan-v2', title:'운영의사결정허브 PM·UX 통합기획서 v2.0', category:'PLANNING', reason:'기능별 계산·운영 요구사항과 완료 기준', scopes:['main','insight','keyword','product','inventory','settlement'] },
  { id:'product-rule', title:'상품별 핵심 문구·사용 금지 표현 기준서', category:'COMPLIANCE', reason:'건강식품 과장 표현과 위험 문구를 분석에서 차단', scopes:['product','keyword'] },
  { id:'ad-rule', title:'상품별 목표 ROAS·허용 CPA/CPC 운영 기준', category:'MARKETING', reason:'광고 확대·유지·중지 판단의 숫자 기준', scopes:['insight','keyword','product'] },
  { id:'operation-rule', title:'배송·반품·CS 운영 기준서', category:'CS', reason:'주문 이후 고객 응대와 배송 판단의 공통 원칙', scopes:['inventory'] }
]);

const text = (value, max) => String(value || '').trim().slice(0,max);
function scopes(value) {
  const list=Array.isArray(value)?value:[];
  return [...new Set(list.map(item=>String(item)).filter(item=>Object.hasOwn(PAGE_LABELS,item)))];
}
function validateCreate(input = {}) {
  const title=text(input.title,160);
  const category=text(input.category,40).toUpperCase();
  const versionLabel=text(input.version_label,40) || 'v1.0';
  if(title.length<2)throw new Error('자료 이름을 2글자 이상 입력해주세요.');
  if(!Object.hasOwn(CATEGORIES,category))throw new Error('올바른 자료 종류를 선택해주세요.');
  return {
    title, category, version_label:versionLabel, scope_pages:scopes(input.scope_pages),
    source_type:'METADATA', source_label:text(input.source_label,200)||null,
    notes:text(input.notes,1000)||null, status:'DRAFT', privacy_status:'REVIEW_REQUIRED',
    vector_status:'NOT_CONNECTED', created_by:'owner', updated_at:new Date().toISOString()
  };
}
function validateUpdate(input = {}, current = {}) {
  const action=text(input.action,24).toUpperCase();
  const updated_at=new Date().toISOString();
  if(action==='REVIEW'){
    if(current.source_status!=='STORED')throw new Error('먼저 원본 파일을 비공개 보관해주세요.');
    return { status:'READY', privacy_status:'APPROVED', approved_by:'owner', approved_at:updated_at, updated_at };
  }
  if(action==='ACTIVATE'){
    if(current.privacy_status!=='APPROVED')throw new Error('개인정보 제외 검수를 먼저 완료해주세요.');
    if(current.source_status!=='STORED')throw new Error('AI가 참고할 원본 파일을 먼저 보관해주세요.');
    return { status:'ACTIVE', updated_at };
  }
  if(action==='ARCHIVE')return { status:'ARCHIVED', updated_at };
  if(action==='RESTORE')return { status:'DRAFT', privacy_status:'REVIEW_REQUIRED', approved_by:null, approved_at:null, updated_at };
  if(action==='BLOCK')return { status:'DRAFT', privacy_status:'BLOCKED', updated_at };
  if(action==='SAVE'){
    const patch={ updated_at };
    if(input.title!=null)patch.title=text(input.title,160);
    if(input.version_label!=null)patch.version_label=text(input.version_label,40);
    if(input.notes!=null)patch.notes=text(input.notes,1000)||null;
    if(input.scope_pages!=null)patch.scope_pages=scopes(input.scope_pages);
    if(input.category!=null){const category=text(input.category,40).toUpperCase();if(!Object.hasOwn(CATEGORIES,category))throw new Error('올바른 자료 종류를 선택해주세요.');patch.category=category;}
    if(patch.title!=null&&patch.title.length<2)throw new Error('자료 이름을 2글자 이상 입력해주세요.');
    return patch;
  }
  throw new Error('지원하지 않는 자료 작업입니다.');
}
function summarize(items = [], config = {}) {
  const rows=Array.isArray(items)?items:[];
  return {
    total:rows.length,
    active:rows.filter(item=>item.status==='ACTIVE').length,
    review_required:rows.filter(item=>item.privacy_status==='REVIEW_REQUIRED').length,
    blocked:rows.filter(item=>item.privacy_status==='BLOCKED').length,
    source_stored:rows.filter(item=>item.source_status==='STORED').length,
    file_search_ready:rows.filter(item=>item.vector_status==='READY').length,
    execution_enabled:config.execution_enabled===true,
    file_search_configured:config.file_search_configured===true
  };
}

module.exports={ CATEGORIES, PAGE_LABELS, STATUSES, PRIVACY_STATUSES, RECOMMENDED_DOCUMENTS, scopes, validateCreate, validateUpdate, summarize };
