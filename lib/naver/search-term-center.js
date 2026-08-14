'use strict';

const CLASSIFICATIONS = Object.freeze([
  'BRAND','GENERAL_PURCHASE','PRODUCT_DETAIL','PROBLEM_SITUATION','INFORMATION','IRRELEVANT'
]);
const ACTIONS = Object.freeze([
  'NEGATIVE_REVIEW','SEPARATE','LANDING_REVIEW','NEW_KEYWORD','CONTENT_FAQ','OBSERVE'
]);
const CLASSIFICATION_LABELS = Object.freeze({
  BRAND:'브랜드', GENERAL_PURCHASE:'일반 구매', PRODUCT_DETAIL:'상품 형태·수량',
  PROBLEM_SITUATION:'문제·상황', INFORMATION:'정보 탐색', IRRELEVANT:'무관'
});
const ACTION_LABELS = Object.freeze({
  NEGATIVE_REVIEW:'제외 검토', SEPARATE:'별도 운영', LANDING_REVIEW:'랜딩 점검',
  NEW_KEYWORD:'신규 등록', CONTENT_FAQ:'콘텐츠·FAQ', OBSERVE:'관찰'
});

function text(value) { return String(value ?? '').trim(); }
function number(value) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:0; }
function normalizeSearchTerm(value) {
  return text(value).normalize('NFKC').toLowerCase().replace(/[\s\-_/.,()[\]{}]+/g,'');
}
function containsAny(term, patterns) { return patterns.some(pattern=>term.includes(pattern)); }

function classifySearchTerm(value, options={}) {
  const display=text(value), term=normalizeSearchTerm(display);
  const brandTerms=(options.brandTerms||['하린식품','하린푸드','harinfood','harin']).map(normalizeSearchTerm).filter(Boolean);
  if(!term) return { classification:'IRRELEVANT', confidence:1, reason:'검색어가 비어 있습니다.' };
  if(brandTerms.some(brand=>term.includes(brand))) return { classification:'BRAND', confidence:.98, reason:'하린식품 브랜드명이 포함됐습니다.' };
  if(containsAny(term,['무료게임','실시간tv','대출','코인시세','주식추천','구인구직','채용공고','중고차매매','토렌트'])) return { classification:'IRRELEVANT', confidence:.96, reason:'상품 구매와 관계없는 명확한 검색 의도입니다.' };
  if(containsAny(term,['효능','효과','부작용','먹는법','마시는법','우리는법','끓이는법','만드는법','성분','칼로리','차이','뜻','원산지'])) return { classification:'INFORMATION', confidence:.9, reason:'효능·사용법·성분을 알아보는 검색입니다.' };
  if(containsAny(term,['비염','기침','기관지','목관리','목아픔','붓기','혈당','당뇨','환절기','감기','피부','다이어트','물대용','사무실','텀블러','루틴','선물'])) return { classification:'PROBLEM_SITUATION', confidence:.86, reason:'고객의 문제나 섭취 상황이 드러난 검색입니다.' };
  if(/(티백|tb|스틱|분말|환|청|원물|깍지|껍질|\d+\s*(개|포|봉|팩|g|kg|ml|입|박스)|대용량)/i.test(display)) return { classification:'PRODUCT_DETAIL', confidence:.88, reason:'상품 형태·용량·수량이 포함됐습니다.' };
  if(containsAny(term,['구매','추천','가격','최저가','파는곳','쇼핑','주문','후기','인기','좋은','어디서'])) return { classification:'GENERAL_PURCHASE', confidence:.88, reason:'구매·비교 의도가 드러난 검색입니다.' };
  return { classification:'GENERAL_PURCHASE', confidence:.55, reason:'상품명 중심의 일반 탐색으로 분류했습니다. 필요하면 직접 고쳐주세요.' };
}

function recommendAction(row, options={}) {
  const classification=row.classification_override||row.classification_auto||classifySearchTerm(row.search_term,options).classification;
  const cost=number(row.cost), conversions=number(row.conversions), clicks=number(row.clicks);
  const targetCpa=number(options.targetCpa??row.target_cpa);
  if(classification==='IRRELEVANT') return { action:'NEGATIVE_REVIEW', reason:'무관 검색어이므로 제외 키워드 후보입니다.' };
  if(!conversions&&targetCpa>0&&cost>=targetCpa*2) return { action:'NEGATIVE_REVIEW', reason:`전환 없이 목표 CPA의 2배 이상(${Math.round(cost).toLocaleString('ko-KR')}원)을 사용했습니다.` };
  if(classification==='BRAND') return { action:'SEPARATE', reason:'브랜드 검색은 일반 검색어와 분리해 성과를 보호하세요.' };
  if(classification==='INFORMATION') return { action:'CONTENT_FAQ', reason:'답변형 상세페이지·FAQ로 연결할 정보 검색입니다.' };
  if(!conversions&&((targetCpa>0&&cost>=targetCpa)||clicks>=10)) return { action:'LANDING_REVIEW', reason:'방문은 있지만 주문이 없어 가격·리뷰·상세페이지를 점검해야 합니다.' };
  if(!row.is_registered_exact) return { action:'NEW_KEYWORD', reason:'실제 유입됐지만 정확히 등록되지 않은 신규 키워드 후보입니다.' };
  return { action:'OBSERVE', reason:'현재는 성과를 더 지켜보는 편이 안전합니다.' };
}

function enrichSearchTerm(row, options={}) {
  const auto=classifySearchTerm(row.search_term,options);
  const classificationAuto=row.classification_auto||auto.classification;
  const classification=row.classification_override||classificationAuto;
  const action=recommendAction({...row,classification_auto:classificationAuto},options);
  return {
    ...row,
    classification_auto:classificationAuto,
    classification,
    classification_label:CLASSIFICATION_LABELS[classification],
    classification_confidence:number(row.classification_confidence)||auto.confidence,
    recommended_action:row.recommended_action||action.action,
    action_label:ACTION_LABELS[row.recommended_action||action.action],
    action_reason:row.action_reason||action.reason,
    cpc:number(row.clicks)?number(row.cost)/number(row.clicks):0,
    roas:number(row.cost)?number(row.conversion_revenue)/number(row.cost)*100:0
  };
}

function buildSearchTermCenter({rows=[],registeredKeywords=[],period=null,lastError=null}={}) {
  const registered=new Set(registeredKeywords.map(item=>normalizeSearchTerm(item.keyword??item)).filter(Boolean));
  const items=rows.map(row=>enrichSearchTerm({...row,is_registered_exact:row.is_registered_exact??registered.has(normalizeSearchTerm(row.search_term))}));
  const countBy=key=>items.reduce((map,item)=>(map[item[key]]=(map[item[key]]||0)+1,map),{});
  const totals=items.reduce((sum,item)=>({impressions:sum.impressions+number(item.impressions),clicks:sum.clicks+number(item.clicks),cost:sum.cost+number(item.cost),conversions:sum.conversions+number(item.conversions),revenue:sum.revenue+number(item.conversion_revenue)}),{impressions:0,clicks:0,cost:0,conversions:0,revenue:0});
  return {
    status:items.length?'READY':lastError?'COLLECTION_ERROR':'COLLECTION_PENDING',
    period,
    last_error:lastError,
    summary:{total:items.length,unregistered:items.filter(item=>!item.is_registered_exact).length,negative_candidates:items.filter(item=>item.recommended_action==='NEGATIVE_REVIEW').length,content_candidates:items.filter(item=>item.recommended_action==='CONTENT_FAQ').length,...totals},
    classification_counts:countBy('classification'),
    action_counts:countBy('recommended_action'),
    items:items.sort((a,b)=>number(b.cost)-number(a.cost)||number(b.clicks)-number(a.clicks))
  };
}

module.exports={CLASSIFICATIONS,ACTIONS,CLASSIFICATION_LABELS,ACTION_LABELS,normalizeSearchTerm,classifySearchTerm,recommendAction,enrichSearchTerm,buildSearchTermCenter};
