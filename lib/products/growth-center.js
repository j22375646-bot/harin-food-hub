'use strict';

const OFFER_TYPES = new Set(['SINGLE', 'DOUBLE', 'BUNDLE', 'GIFT']);
const PRODUCT_ROLES = new Set(['STANDARD', 'OPTION', 'BUNDLE', 'GIFT']);
const PLATFORMS = new Set(['NAVER', 'CAFE24', 'COUPANG']);
const CHECKLIST_ITEMS = [
  ['hero_value', '첫 화면에서 누구를 위한 상품인지 보이나요?'],
  ['customer_problem', '고객의 고민과 구매 상황이 적혀 있나요?'],
  ['ingredients_origin', '원재료·원산지·구성 정보가 분명한가요?'],
  ['how_to_use', '먹는 법·우리는 법·보관법이 쉬운가요?'],
  ['bundle_difference', '1개·2개·묶음의 차이와 혜택이 보이나요?'],
  ['shipping_returns', '배송비·출고·교환·반품 안내가 있나요?'],
  ['reviews', '실제 구매자가 궁금해할 후기 근거가 있나요?'],
  ['legal_expression', '질병 치료처럼 오해할 표현을 점검했나요?'],
  ['mobile_readability', '휴대폰에서도 글씨와 표가 잘 보이나요?'],
  ['purchase_action', '구매 버튼 앞에 선택 이유가 정리되어 있나요?']
];
const CHECKLIST_KEYS = new Set(CHECKLIST_ITEMS.map(([key]) => key));

class GrowthCenterError extends Error {
  constructor(message, status = 400, code = 'INVALID_GROWTH_CENTER_INPUT') {
    super(message);
    this.name = 'GrowthCenterError';
    this.status = status;
    this.code = code;
  }
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) { return Math.round(number(value)); }
function roundRate(value) { return Math.round(number(value) * 10) / 10; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, number(value))); }
function roundPrice(value) { return Math.max(0, Math.round(number(value) / 100) * 100); }
function isPilotProduct(name) { return /작수차/.test(String(name || '')) && /(티백|TB)/i.test(String(name || '')); }
function pilotScore(product) {
  const name = String(product?.name || '');
  if (!isPilotProduct(name)) return 0;
  let score = 100;
  if (/30\s*TB/i.test(name)) score += 30;
  if (/36\s*g/i.test(name)) score += 15;
  if (number(product?.selling_price) === 12000) score += 15;
  if (/(90\s*TB|108\s*g|x\s*[2-9]|[2-9]\s*개|세트|옵션)/i.test(name)) score -= 60;
  return score;
}

function defaultProfile(masterProductId) {
  return {
    master_product_id:masterProductId,
    product_role:'STANDARD',
    product_summary:'',
    target_customer:'',
    purchase_situations:[],
    hesitation_reasons:[],
    core_message:'',
    prohibited_phrases:[],
    usage_guide:''
  };
}

function defaultChecklist(masterProductId) {
  return { master_product_id:masterProductId, items:{}, notes:'' };
}

function suggestedOffers(product) {
  const price = money(product.selling_price);
  return [
    { id:'suggested-single', name:'1개', offer_type:'SINGLE', platform:'CAFE24', quantity:1, list_price:price, sale_price:price, customer_shipping_revenue:0, shipping_cost_override:null, gift_cost:0, extra_packaging_cost:0, ad_cost_per_order:0, sort_order:10, is_active:true, suggested:true },
    { id:'suggested-double', name:'2개', offer_type:'DOUBLE', platform:'CAFE24', quantity:2, list_price:price * 2, sale_price:roundPrice(price * 2 * 0.95), customer_shipping_revenue:0, shipping_cost_override:null, gift_cost:0, extra_packaging_cost:0, ad_cost_per_order:0, sort_order:20, is_active:true, suggested:true },
    { id:'suggested-bundle', name:'묶음 3개', offer_type:'BUNDLE', platform:'CAFE24', quantity:3, list_price:price * 3, sale_price:roundPrice(price * 3 * 0.9), customer_shipping_revenue:0, shipping_cost_override:null, gift_cost:0, extra_packaging_cost:0, ad_cost_per_order:0, sort_order:30, is_active:true, suggested:true }
  ];
}

function calculateOfferProfit({ offer, productCost, channelSetting, shippingRule }) {
  const unitCost = number(productCost?.unit_cost) + number(productCost?.packaging_cost) + number(productCost?.other_unit_cost);
  const quantity = Math.max(1, Math.round(number(offer.quantity)));
  const salePrice = money(offer.sale_price);
  const shippingRevenue = money(offer.customer_shipping_revenue);
  const revenue = salePrice + shippingRevenue;
  const feeRate = number(channelSetting?.commission_rate) + number(channelSetting?.payment_fee_rate);
  const fees = money(revenue * feeRate);
  const baseShipping = offer.shipping_cost_override == null || offer.shipping_cost_override === ''
    ? money(channelSetting?.default_shipping_cost)
    : money(offer.shipping_cost_override);
  const returnReserve = money(number(shippingRule?.return_shipping_cost) * number(shippingRule?.return_rate));
  const remoteReserve = money(number(shippingRule?.remote_area_surcharge) * number(shippingRule?.remote_area_rate));
  const productCostTotal = money(unitCost * quantity);
  const giftCost = money(offer.gift_cost);
  const extraPackagingCost = money(offer.extra_packaging_cost);
  const adCost = money(offer.ad_cost_per_order);
  const totalCostBeforeAd = productCostTotal + fees + baseShipping + returnReserve + remoteReserve + giftCost + extraPackagingCost;
  const actualProfit = money(revenue - totalCostBeforeAd - adCost);
  const costReady = Boolean(productCost) && unitCost > 0 && Boolean(channelSetting);
  const priceReady = salePrice > 0;
  const marginRate = costReady && priceReady ? roundRate(actualProfit / revenue * 100) : null;
  const maximumAdditionalDiscount = costReady && priceReady ? Math.max(0, actualProfit) : null;
  const breakEvenAdCost = costReady && priceReady ? Math.max(0, actualProfit + adCost) : null;
  let status = 'CHECK_REQUIRED';
  if (costReady && priceReady) status = actualProfit <= 0 ? 'LOSS' : marginRate < 15 ? 'WATCH' : 'SAFE';
  const warnings = [];
  if (!productCost || unitCost <= 0) warnings.push('상품 원가를 먼저 입력해주세요.');
  if (!priceReady) warnings.push('판매가를 입력해주세요.');
  if (status === 'LOSS') warnings.push('현재 구성은 주문이 늘수록 손실이 커집니다.');
  if (status === 'WATCH') warnings.push('이익률이 15%보다 낮아 추가 할인·광고 확대를 조심해야 합니다.');
  return {
    status,
    ready:costReady && priceReady,
    revenue,
    list_price:money(offer.list_price),
    discount:Math.max(0, money(offer.list_price) - salePrice),
    product_cost:productCostTotal,
    fees,
    shipping_cost:baseShipping,
    expected_shipping_loss:returnReserve + remoteReserve,
    gift_and_packaging_cost:giftCost + extraPackagingCost,
    ad_cost:adCost,
    actual_profit:costReady && priceReady ? actualProfit : null,
    margin_rate:marginRate,
    maximum_additional_discount:maximumAdditionalDiscount,
    break_even_ad_cost:breakEvenAdCost,
    warnings
  };
}

function completion(profile, checklist, offers) {
  const profileChecks = [
    profile.product_summary,
    profile.target_customer,
    profile.purchase_situations?.length,
    profile.hesitation_reasons?.length,
    profile.core_message,
    profile.prohibited_phrases?.length,
    profile.usage_guide
  ];
  const profileDone = profileChecks.filter(Boolean).length;
  const checklistDone = CHECKLIST_ITEMS.filter(([key]) => checklist.items?.[key] === true).length;
  const offerDone = offers.filter(offer => number(offer.sale_price) > 0).length;
  return {
    profile_done:profileDone,
    profile_total:profileChecks.length,
    checklist_done:checklistDone,
    checklist_total:CHECKLIST_ITEMS.length,
    offers_done:offerDone,
    offers_target:3,
    percent:Math.round((profileDone + checklistDone + Math.min(offerDone, 3)) / (profileChecks.length + CHECKLIST_ITEMS.length + 3) * 100)
  };
}

function buildGrowthCenter({ masterProducts = [], profiles = [], offers = [], checklists = [], productCosts = [], channelSettings = [], shippingRules = [] }) {
  const profileMap = new Map(profiles.map(item => [item.master_product_id, item]));
  const checklistMap = new Map(checklists.map(item => [item.master_product_id, item]));
  const costMap = new Map(productCosts.map(item => [item.master_product_id, item]));
  const settingMap = new Map(channelSettings.map(item => [item.platform, item]));
  const shippingMap = new Map(shippingRules.map(item => [item.platform, item]));
  const offersByMaster = new Map();
  for (const offer of offers) {
    const current = offersByMaster.get(offer.master_product_id) || [];
    current.push(offer); offersByMaster.set(offer.master_product_id, current);
  }
  const items = masterProducts.map(product => {
    const profile = { ...defaultProfile(product.id), ...(profileMap.get(product.id) || {}) };
    const checklist = { ...defaultChecklist(product.id), ...(checklistMap.get(product.id) || {}) };
    const storedOffers = offersByMaster.get(product.id) || [];
    const productOffers = storedOffers.length ? storedOffers : suggestedOffers(product);
    const calculatedOffers = productOffers.map(offer => ({
      ...offer,
      calculation:calculateOfferProfit({
        offer,
        productCost:costMap.get(product.id),
        channelSetting:settingMap.get(offer.platform),
        shippingRule:shippingMap.get(offer.platform)
      })
    }));
    const readyOffers = calculatedOffers.filter(offer => offer.calculation.ready);
    const bestOffer = readyOffers.sort((a,b) => number(b.calculation.actual_profit) - number(a.calculation.actual_profit))[0] || null;
    return {
      master_product:{ id:product.id, name:product.name, selling_price:product.selling_price, is_active:product.is_active },
      profile,
      offers:calculatedOffers,
      checklist,
      completion:completion(profile, checklist, productOffers),
      cost_ready:Boolean(costMap.get(product.id)) && (number(costMap.get(product.id)?.unit_cost) + number(costMap.get(product.id)?.packaging_cost) + number(costMap.get(product.id)?.other_unit_cost)) > 0,
      best_offer:bestOffer ? { name:bestOffer.name, actual_profit:bestOffer.calculation.actual_profit, margin_rate:bestOffer.calculation.margin_rate } : null
    };
  }).sort((a,b) => {
    const scoreDelta = pilotScore(b.master_product) - pilotScore(a.master_product);
    return scoreDelta || a.master_product.name.length - b.master_product.name.length || a.master_product.name.localeCompare(b.master_product.name, 'ko');
  });
  return {
    checklist_items:CHECKLIST_ITEMS.map(([key,label]) => ({ key, label })),
    pilot_product_id:items.find(item => pilotScore(item.master_product) > 0)?.master_product.id || items[0]?.master_product.id || null,
    summary:{ products:items.length, cost_ready:items.filter(item => item.cost_ready).length, profile_ready:items.filter(item => item.completion.profile_done === item.completion.profile_total).length },
    items
  };
}

async function loadGrowthCenter({ db }) {
  const results = await Promise.all([
    db.from('master_products').select('id,name,selling_price,is_active').eq('is_active', true).order('name'),
    db.from('product_growth_profiles').select('*'),
    db.from('product_growth_offers').select('*').eq('is_active', true).order('sort_order').order('id'),
    db.from('product_detail_checklists').select('*'),
    db.from('product_costs').select('master_product_id,unit_cost,packaging_cost,other_unit_cost'),
    db.from('channel_cost_settings').select('platform,commission_rate,payment_fee_rate,default_shipping_cost'),
    db.from('channel_shipping_rules').select('platform,return_shipping_cost,return_rate,remote_area_surcharge,remote_area_rate')
  ]);
  const firstError = results.find(result => result.error)?.error;
  if (firstError) throw firstError;
  return buildGrowthCenter({
    masterProducts:results[0].data || [], profiles:results[1].data || [], offers:results[2].data || [],
    checklists:results[3].data || [], productCosts:results[4].data || [], channelSettings:results[5].data || [], shippingRules:results[6].data || []
  });
}

function requiredUuid(value) {
  const id = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new GrowthCenterError('상품을 다시 선택해주세요.');
  }
  return id;
}

function shortText(value, label, max = 1000) {
  const text = String(value || '').trim();
  if (text.length > max) throw new GrowthCenterError(`${label}은 ${max}자 이내로 입력해주세요.`);
  return text;
}

function textArray(value, label) {
  if (!Array.isArray(value)) throw new GrowthCenterError(`${label} 형식이 올바르지 않습니다.`);
  if (value.length > 12) throw new GrowthCenterError(`${label}은 12개까지만 입력할 수 있습니다.`);
  return value.map(item => shortText(item, label, 160)).filter(Boolean);
}

function safeMoney(value, label, nullable = false) {
  if (nullable && (value == null || value === '')) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000000000) throw new GrowthCenterError(`${label} 금액을 확인해주세요.`);
  return Math.round(parsed);
}

async function ensureMaster(db, masterProductId) {
  const result = await db.from('master_products').select('id').eq('id', masterProductId).eq('is_active', true).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new GrowthCenterError('선택한 기준상품을 찾을 수 없습니다.', 404, 'MASTER_PRODUCT_NOT_FOUND');
}

async function saveProfile({ db, masterProductId, profile }) {
  const role = String(profile.product_role || 'STANDARD').toUpperCase();
  if (!PRODUCT_ROLES.has(role)) throw new GrowthCenterError('상품 구분을 확인해주세요.');
  const row = {
    master_product_id:masterProductId,
    product_role:role,
    product_summary:shortText(profile.product_summary, '상품 한 줄 설명'),
    target_customer:shortText(profile.target_customer, '주요 고객'),
    purchase_situations:textArray(profile.purchase_situations || [], '구매 상황'),
    hesitation_reasons:textArray(profile.hesitation_reasons || [], '망설이는 이유'),
    core_message:shortText(profile.core_message, '핵심 판매 문구'),
    prohibited_phrases:textArray(profile.prohibited_phrases || [], '사용 금지 문구'),
    usage_guide:shortText(profile.usage_guide, '사용 안내')
  };
  const result = await db.from('product_growth_profiles').upsert(row, { onConflict:'master_product_id' }).select('master_product_id').single();
  if (result.error) throw result.error;
}

function normalizeOffer(offer, masterProductId, index) {
  const offerType = String(offer.offer_type || '').toUpperCase();
  const platform = String(offer.platform || 'CAFE24').toUpperCase();
  if (!OFFER_TYPES.has(offerType)) throw new GrowthCenterError(`${index + 1}번째 구성 구분을 확인해주세요.`);
  if (!PLATFORMS.has(platform)) throw new GrowthCenterError(`${index + 1}번째 판매 채널을 확인해주세요.`);
  const quantity = Math.round(number(offer.quantity));
  if (quantity < 1 || quantity > 100) throw new GrowthCenterError(`${index + 1}번째 구성 수량은 1~100개로 입력해주세요.`);
  return {
    master_product_id:masterProductId,
    name:shortText(offer.name, `${index + 1}번째 구성 이름`, 80),
    offer_type:offerType,
    platform,
    quantity,
    list_price:safeMoney(offer.list_price, '정상가'),
    sale_price:safeMoney(offer.sale_price, '판매가'),
    customer_shipping_revenue:safeMoney(offer.customer_shipping_revenue, '고객 배송비'),
    shipping_cost_override:safeMoney(offer.shipping_cost_override, '실제 택배비', true),
    gift_cost:safeMoney(offer.gift_cost, '사은품 비용'),
    extra_packaging_cost:safeMoney(offer.extra_packaging_cost, '추가 포장비'),
    ad_cost_per_order:safeMoney(offer.ad_cost_per_order, '주문당 광고비'),
    sort_order:(index + 1) * 10,
    is_active:true
  };
}

async function saveOffers({ db, masterProductId, offers }) {
  if (!Array.isArray(offers) || offers.length < 1 || offers.length > 12) throw new GrowthCenterError('상품 구성은 1~12개로 입력해주세요.');
  const rows = offers.map((offer,index) => normalizeOffer(offer, masterProductId, index));
  if (new Set(rows.map(row => row.name)).size !== rows.length) throw new GrowthCenterError('구성 이름은 서로 다르게 입력해주세요.');
  const upsert = await db.from('product_growth_offers').upsert(rows, { onConflict:'master_product_id,name' }).select('id,name');
  if (upsert.error) throw upsert.error;
  const existing = await db.from('product_growth_offers').select('id,name').eq('master_product_id', masterProductId);
  if (existing.error) throw existing.error;
  const keep = new Set(rows.map(row => row.name));
  const staleIds = (existing.data || []).filter(item => !keep.has(item.name)).map(item => item.id);
  if (staleIds.length) {
    const removed = await db.from('product_growth_offers').delete().eq('master_product_id', masterProductId).in('id', staleIds);
    if (removed.error) throw removed.error;
  }
}

async function saveChecklist({ db, masterProductId, items, notes }) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) throw new GrowthCenterError('상세페이지 점검 항목을 확인해주세요.');
  const normalized = {};
  for (const key of CHECKLIST_KEYS) normalized[key] = items[key] === true;
  const result = await db.from('product_detail_checklists').upsert({ master_product_id:masterProductId, items:normalized, notes:shortText(notes, '점검 메모', 2000) }, { onConflict:'master_product_id' }).select('master_product_id').single();
  if (result.error) throw result.error;
}

async function mutateGrowthCenter({ db, body }) {
  const action = String(body.action || '').toUpperCase();
  const masterProductId = requiredUuid(body.master_product_id);
  await ensureMaster(db, masterProductId);
  if (action === 'SAVE_PROFILE') await saveProfile({ db, masterProductId, profile:body.profile || {} });
  else if (action === 'SAVE_OFFERS') await saveOffers({ db, masterProductId, offers:body.offers });
  else if (action === 'SAVE_CHECKLIST') await saveChecklist({ db, masterProductId, items:body.items, notes:body.notes });
  else throw new GrowthCenterError('지원하지 않는 저장 작업입니다.');
  return { action, master_product_id:masterProductId };
}

module.exports = {
  CHECKLIST_ITEMS,
  GrowthCenterError,
  buildGrowthCenter,
  calculateOfferProfit,
  loadGrowthCenter,
  mutateGrowthCenter,
  suggestedOffers
};
