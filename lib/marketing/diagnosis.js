'use strict';

const INTENTS = {
  INFORMATION:{ label:'정보 탐색', description:'효능·먹는 법·원료처럼 먼저 알아보는 검색' },
  PURCHASE:{ label:'구매 의도', description:'가격·후기·할인처럼 구매 직전의 검색' },
  PROBLEM:{ label:'문제 고민', description:'불편한 증상이나 해결하고 싶은 문제 검색' },
  SITUATION:{ label:'상황 탐색', description:'계절·시간·선물처럼 먹는 상황 중심 검색' },
  PRODUCT:{ label:'상품 탐색', description:'구체적인 상품명이나 원료명 검색' }
};

const PURCHASE_WORDS = ['구매','가격','최저가','추천','후기','리뷰','할인','쿠폰','배송','파는곳','판매처','선물세트','세트'];
const INFORMATION_WORDS = ['효능','효과','먹는법','끓이는법','우리는법','부작용','원료','성분','칼로리','보관법','차이','뜻'];
const SITUATION_WORDS = ['아침','저녁','겨울','여름','봄','가을','물대신','사무실','부모님','선물','임산부','어린이','아이','수험생'];
const PROBLEM_WORDS = ['비염','축농증','당뇨','혈당','고혈압','혈압','기침','가래','천식','기관지','염증','통풍','콜레스테롤','감기','위염','관절염','붓기','소화','변비','불면','피로','다이어트'];
const RISK_WORDS = [...PROBLEM_WORDS, '효능','효과','암','항암','면역력','치료','예방','완치','낫는','낫게','개선','낮추는','낮춰','없애는','제거','해독'];
const PRODUCT_HINTS = ['작두콩','작수차','수세미','도라지','여주','우엉','팥','결명자','돼지감자','둥굴레','비트','보이차','생강','연잎','국화','귤피','야관문','히비스커스','조청','소금','차','환'];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(number(value) * scale) / scale;
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^0-9a-z가-힣]+/g, '');
}

function matchedWords(text, words) {
  const compact = normalize(text);
  return words.filter(word => compact.includes(normalize(word)));
}

function classifyKeywordIntent(keyword, product) {
  if (matchedWords(keyword, PURCHASE_WORDS).length) return 'PURCHASE';
  if (matchedWords(keyword, PROBLEM_WORDS).length) return 'PROBLEM';
  if (matchedWords(keyword, SITUATION_WORDS).length) return 'SITUATION';
  if (matchedWords(keyword, INFORMATION_WORDS).length) return 'INFORMATION';
  if (product || matchedWords(keyword, PRODUCT_HINTS).length) return 'PRODUCT';
  return 'INFORMATION';
}

function productSearchText(keyword) {
  let text = normalize(keyword);
  for (const word of [...PURCHASE_WORDS, ...INFORMATION_WORDS, ...SITUATION_WORDS]) text = text.replaceAll(normalize(word), '');
  return text.replace(/(티백|차|환|즙)$/g, '').trim();
}

function productScore(keyword, product) {
  const keywordText = normalize(keyword);
  const search = productSearchText(keyword);
  const name = normalize(product?.name);
  if (!search || search.length < 2 || !name) return 0;
  let score = 0;
  if (name.includes(search)) score += 100 + search.length;
  if (search.includes('작수') && name.includes('작수차')) score += 90;
  if (search.includes('작두콩') && name.includes('작두콩')) score += 80;
  if (search.includes('수세미') && name.includes('수세미')) score += 70;
  for (const hint of PRODUCT_HINTS) if (keywordText.includes(hint) && name.includes(hint)) score += 20;
  if (/30tb/i.test(String(product?.name || ''))) score += 8;
  if (/x[2-9]|90tb|108g/i.test(String(product?.name || ''))) score -= 8;
  score -= Math.min(name.length / 100, 1);
  return score;
}

function findRelatedProduct(keyword, masterProducts) {
  return (masterProducts || [])
    .map(product => ({ product, score:productScore(keyword, product) }))
    .filter(item => item.score >= 20)
    .sort((left, right) => right.score - left.score || String(left.product.name).length - String(right.product.name).length)[0]?.product || null;
}

function confidenceFor(row) {
  const clicks = number(row.clicks), conversions = number(row.conversions);
  if (clicks >= 100 || conversions >= 10) return 'HIGH';
  if (clicks >= 30 || conversions >= 3) return 'MEDIUM';
  return 'LOW';
}

function decideAction(row, targetRoas) {
  const clicks = number(row.clicks), conversions = number(row.conversions), cost = number(row.cost);
  const revenue = number(row.conversion_revenue);
  const roas = cost > 0 ? revenue / cost * 100 : number(row.roas);
  if (conversions >= 3 && roas >= targetRoas * 1.2) return 'EXPAND';
  if (conversions > 0) return 'MAINTAIN';
  if (clicks >= 40 && cost > 0) return 'STOP_REVIEW';
  if (clicks >= 20 && cost >= 20000) return 'REDUCE';
  return 'WATCH';
}

function actionMeta(action) {
  return {
    EXPAND:{ label:'광고 확대 후보', api_action:'WATCH', tone:'growth' },
    MAINTAIN:{ label:'현재 운영 유지', api_action:'WATCH', tone:'good' },
    REDUCE:{ label:'입찰가 감액 후보', api_action:'LOWER_BID', tone:'warning' },
    STOP_REVIEW:{ label:'중지 검토', api_action:'PAUSE', tone:'danger' },
    WATCH:{ label:'더 지켜보기', api_action:'WATCH', tone:'neutral' }
  }[action];
}

function priceCheck(product, channelProducts) {
  if (!product || number(product.selling_price) <= 0) return { status:'NO_DATA', label:'가격 확인 필요', detail:'연결된 기준상품의 판매가가 없습니다.' };
  const prices = (channelProducts || []).filter(item => item.master_product_id === product.id && number(item.selling_price) > 0).map(item => number(item.selling_price));
  const base = number(product.selling_price);
  const spread = prices.length ? Math.max(...prices.map(price => Math.abs(price - base) / base)) : 0;
  if (spread > 0.2) return { status:'WARNING', label:'채널 가격 차이', detail:'기준 판매가와 20% 넘게 다른 채널 가격이 있습니다.' };
  return { status:'READY', label:'가격 자료 있음', detail:`기준 판매가 ${Math.round(base).toLocaleString('ko-KR')}원` };
}

function inventoryCheck(product, channelProducts, productItems, itemInventory, rgInventory) {
  if (!product) return { status:'NO_DATA', label:'재고 연결 대기', detail:'먼저 기준상품을 연결해야 합니다.' };
  const sellerIds = new Set((channelProducts || []).filter(item => item.master_product_id === product.id && item.platform === 'COUPANG').map(item => String(item.external_product_id)));
  const vendorIds = new Set((productItems || []).filter(item => sellerIds.has(String(item.seller_product_id))).map(item => String(item.vendor_item_id)));
  const rows = [
    ...(itemInventory || []).filter(item => vendorIds.has(String(item.vendor_item_id))).map(item => ({ quantity:number(item.quantity), days:null, status:item.status })),
    ...(rgInventory || []).filter(item => vendorIds.has(String(item.vendor_item_id))).map(item => ({ quantity:number(item.total_orderable_quantity), days:item.days_of_stock == null ? null : number(item.days_of_stock), status:item.stock_status }))
  ];
  if (!rows.length) return { status:'NO_DATA', label:'재고 연결 대기', detail:'연결된 쿠팡 재고 자료가 없습니다.' };
  if (rows.some(row => row.quantity <= 0 || /out|sold|stop/i.test(String(row.status || '')))) return { status:'WARNING', label:'품절 점검', detail:'판매 가능 재고가 0인 항목이 있습니다.' };
  if (rows.some(row => row.days != null && row.days < 14)) return { status:'WARNING', label:'저재고 점검', detail:'14일 안에 부족할 수 있는 재고가 있습니다.' };
  return { status:'READY', label:'재고 이상 없음', detail:'연결된 재고 자료에서 품절 위험을 찾지 못했습니다.' };
}

function detailCheck(product, checklists) {
  if (!product) return { status:'NO_DATA', label:'상세페이지 연결 대기', detail:'먼저 기준상품을 연결해야 합니다.' };
  const checklist = (checklists || []).find(item => item.master_product_id === product.id);
  if (!checklist) return { status:'NO_DATA', label:'상세페이지 점검 전', detail:'상품 성장센터에서 점검표를 입력해주세요.' };
  const values = Object.values(checklist.items || {}), done = values.filter(Boolean).length;
  if (done < 7) return { status:'WARNING', label:`상세페이지 ${done}/10`, detail:'구매 전 불안을 줄일 정보가 더 필요합니다.' };
  return { status:'READY', label:`상세페이지 ${done}/10`, detail:'핵심 점검 항목이 7개 이상 완료됐습니다.' };
}

function reviewCheck() {
  return { status:'NO_DATA', label:'리뷰 데이터 연결 대기', detail:'현재 허브에 리뷰 수·평점 자료가 없어 판단에서 제외했습니다.' };
}

function explain(row, action, checks, riskMatches, confidence, targetRoas) {
  const impressions = number(row.impressions), clicks = number(row.clicks), conversions = number(row.conversions), cost = number(row.cost), revenue = number(row.conversion_revenue);
  const ctr = impressions > 0 ? clicks / impressions * 100 : 0;
  const cvr = clicks > 0 ? conversions / clicks * 100 : 0;
  const roas = cost > 0 ? revenue / cost * 100 : null;
  let observation = `검색 노출 ${impressions.toLocaleString('ko-KR')}회에서 방문 ${clicks.toLocaleString('ko-KR')}회, 주문 ${conversions.toLocaleString('ko-KR')}건이 발생했습니다.`;
  let impact = '표본이 아직 작아 광고를 바로 줄이거나 늘리면 잘못 판단할 수 있습니다.';
  let recommendation = '데이터를 더 모으면서 검색어와 상세페이지 연결이 자연스러운지 확인하세요.';
  if (action === 'EXPAND') { impact = '주문과 광고수익률이 목표보다 충분히 좋아 예산 확대를 시험할 근거가 있습니다.'; recommendation = '예산을 한 번에 크게 올리지 말고 10~20%씩 올린 뒤 7일간 다시 확인하세요.'; }
  else if (action === 'MAINTAIN') { impact = '실제 주문은 확인됐지만 확대를 결정할 만큼 표본이 충분하지 않습니다.'; recommendation = '현재 입찰을 유지하고 주문이 3건 이상 쌓일 때 확대 여부를 다시 보세요.'; }
  else if (action === 'REDUCE') { impact = '방문은 충분한데 주문이 없어 광고비가 더 새어 나갈 가능성이 있습니다.'; recommendation = '입찰가를 10~20% 낮추고 가격·재고·리뷰·상세페이지를 함께 점검하세요.'; }
  else if (action === 'STOP_REVIEW') { impact = '많은 방문 뒤에도 주문이 없어 계속 집행할수록 손실이 커질 수 있습니다.'; recommendation = '자동 중지하지 말고 검색 의도와 상품 연결을 확인한 뒤 중지 여부를 결정하세요.'; }
  if (impressions >= 300 && ctr < 1) recommendation += ' 노출에 비해 클릭이 적으므로 제목과 광고문구도 먼저 고쳐보세요.';
  if (riskMatches.length) recommendation += ` “${riskMatches.slice(0,3).join('·')}” 표현은 광고·상세페이지 문구로 그대로 옮기지 말고 표시광고 기준을 확인하세요.`;
  const evidence = [
    `클릭률 ${round(ctr)}% · 주문전환율 ${round(cvr)}%`,
    `광고비 ${Math.round(cost).toLocaleString('ko-KR')}원 · 전환매출 ${Math.round(revenue).toLocaleString('ko-KR')}원`,
    roas == null ? '광고비가 없어 ROAS를 계산하지 않음' : `ROAS ${round(roas)}% · 목표 ${round(targetRoas)}%`,
    `판단 근거 ${confidence === 'LOW' ? '낮음(표본 부족)' : confidence === 'MEDIUM' ? '보통' : '높음'}`
  ];
  if (checks.price.status !== 'READY') evidence.push(checks.price.label);
  if (checks.inventory.status !== 'READY') evidence.push(checks.inventory.label);
  if (checks.detail.status !== 'READY') evidence.push(checks.detail.label);
  evidence.push(checks.review.label);
  return { observation, impact, evidence, recommendation };
}

function buildMarketingDiagnosis({
  keywordStats = [], naverKeywords = [], masterProducts = [], channelProducts = [], productItems = [], itemInventory = [], rgInventory = [], checklists = [], period = null, targetRoas = 250
} = {}) {
  const keywordMap = new Map((naverKeywords || []).map(item => [String(item.ncc_keyword_id), item]));
  const intentCounts = Object.fromEntries(Object.keys(INTENTS).map(key => [key, 0]));
  const actionCounts = { EXPAND:0, MAINTAIN:0, REDUCE:0, STOP_REVIEW:0, WATCH:0 };
  const totals = { impressions:0, visits:0, orders:0, revenue:0, cost:0 };
  const items = (keywordStats || []).map(row => {
    const keywordMeta = keywordMap.get(String(row.ncc_keyword_id));
    const linkedProductId = (channelProducts || []).find(item => item.platform === 'NAVER' && String(item.external_product_id) === String(keywordMeta?.ncc_adgroup_id))?.master_product_id;
    const product = (masterProducts || []).find(item => item.id === linkedProductId) || findRelatedProduct(row.keyword, masterProducts);
    const intent = classifyKeywordIntent(row.keyword, product);
    const riskMatches = matchedWords(row.keyword, RISK_WORDS);
    const confidence = confidenceFor(row), action = decideAction(row, number(targetRoas) || 250);
    const checks = {
      price:priceCheck(product, channelProducts),
      inventory:inventoryCheck(product, channelProducts, productItems, itemInventory, rgInventory),
      review:reviewCheck(),
      detail:detailCheck(product, checklists)
    };
    const actionInfo = actionMeta(action);
    const explanation = explain(row, action, checks, riskMatches, confidence, number(targetRoas) || 250);
    intentCounts[intent] += 1; actionCounts[action] += 1;
    totals.impressions += number(row.impressions); totals.visits += number(row.clicks); totals.orders += number(row.conversions); totals.revenue += number(row.conversion_revenue); totals.cost += number(row.cost);
    return {
      ...row,
      intent,
      intent_label:INTENTS[intent].label,
      product:product ? { id:product.id, name:product.name, selling_price:number(product.selling_price) } : null,
      compliance:{ status:riskMatches.length ? 'WARNING' : 'CLEAR', matches:riskMatches, message:riskMatches.length ? '고객의 검색어에 건강 효능·질병 관련 표현이 있습니다. 광고문구로 그대로 사용하지 마세요.' : '주의 표현을 찾지 못했습니다.' },
      confidence,
      action,
      action_label:actionInfo.label,
      api_action:actionInfo.api_action,
      action_tone:actionInfo.tone,
      checks,
      ...explanation
    };
  }).sort((left, right) => {
    const priority = { STOP_REVIEW:5, REDUCE:4, EXPAND:3, MAINTAIN:2, WATCH:1 };
    return priority[right.action] - priority[left.action] || Number(right.compliance.status === 'WARNING') - Number(left.compliance.status === 'WARNING') || number(right.impressions) - number(left.impressions);
  });
  const ctr = totals.impressions > 0 ? totals.visits / totals.impressions * 100 : 0;
  const cvr = totals.visits > 0 ? totals.orders / totals.visits * 100 : 0;
  return {
    status:items.length ? 'READY' : 'NO_DATA',
    period,
    target_roas:number(targetRoas) || 250,
    intent_definitions:INTENTS,
    totals:{ ...totals, ctr:round(ctr), cvr:round(cvr) },
    summary:{
      keywords:items.length,
      intent_counts:intentCounts,
      action_counts:actionCounts,
      risky_expressions:items.filter(item => item.compliance.status === 'WARNING').length,
      high_exposure_no_order:items.filter(item => number(item.impressions) >= 300 && number(item.conversions) === 0).length,
      low_confidence:items.filter(item => item.confidence === 'LOW').length
    },
    items
  };
}

module.exports = {
  INTENTS,
  classifyKeywordIntent,
  findRelatedProduct,
  confidenceFor,
  decideAction,
  buildMarketingDiagnosis
};
