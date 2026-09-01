'use strict';

const matcher = require('./matcher.js');
const cafe24Catalog = require('./cafe24-catalog.js');

// Product matching is intentionally limited to real commerce products. Naver
// Search Ads ad groups are performance references, not sellable products, so
// only NAVER_COMMERCE_PRODUCT rows may enter the Naver side of this workbench.
const PLATFORMS = new Set(['NAVER','COUPANG']);
const KOREAN_PRODUCT_COLLATOR = new Intl.Collator('ko-KR', { numeric:true, sensitivity:'base' });

function number(value) { return Number(value || 0); }
function compareProductNames(left, right) {
  return KOREAN_PRODUCT_COLLATOR.compare(String(left?.name || ''), String(right?.name || '')) ||
    String(left?.id || left?.external_product_id || '').localeCompare(String(right?.id || right?.external_product_id || ''));
}
function isCoupangSellingStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  if (!status || /(DELETED|STOPPED|SUSPENDED|INACTIVE|DISABLED|ENDED|REJECTED|WITHDRAWN|SALE_STOPPED|판매\s*중지|판매\s*중단|판매\s*종료|삭제|반려)/i.test(status)) return false;
  return /^(APPROVED|ACTIVE|SELLING|ON[_ -]?SALE|SALE|AVAILABLE)$/.test(status) || /(판매\s*중|승인\s*완료)/i.test(status);
}

function isNaverSellableProduct(item) {
  const raw = item?.raw_data || {};
  return item?.is_active === true
    && String(raw.statusType || '').trim().toUpperCase() === 'SALE'
    && String(raw.channelProductDisplayStatusType || '').trim().toUpperCase() === 'ON'
    && number(raw.stockQuantity) > 0;
}

function isCoupangSellableInventory(item) {
  if (!item || !(number(item.quantity) > 0)) return false;
  if (item.raw_data?.onSale === false) return false;
  return !item.status || isCoupangSellingStatus(item.status);
}

function createProductSources({ channelProducts = [], coupangProducts = [], coupangProductItems = [], coupangItemInventory = [] }) {
  const inventoryByVendorItem = new Map(coupangItemInventory
    .filter(item => item?.vendor_item_id)
    .map(item => [String(item.vendor_item_id), item]));
  const prices = new Map();
  const quantities = new Map();
  for (const item of coupangProductItems) {
    const inventory = inventoryByVendorItem.get(String(item.vendor_item_id || ''));
    if (!item.seller_product_id || !(number(item.sale_price) > 0) || !isCoupangSellingStatus(item.status) || !isCoupangSellableInventory(inventory)) continue;
    const key = String(item.seller_product_id), current = prices.get(key) || [];
    current.push(number(item.sale_price)); prices.set(key, current);
    quantities.set(key, (quantities.get(key) || 0) + number(inventory.quantity));
  }
  const coupang = coupangProducts.map(item => {
    const itemPrices = prices.get(String(item.seller_product_id)) || [];
    const stockQuantity = quantities.get(String(item.seller_product_id)) || 0;
    return {
      platform:'COUPANG', external_product_id:String(item.seller_product_id), name:item.product_name,
      external_product_name:item.product_name, selling_price:itemPrices.length ? Math.min(...itemPrices) : null,
      is_active:isCoupangSellingStatus(item.status) && itemPrices.length > 0 && stockQuantity > 0,
      source_type:'COUPANG_SELLER_PRODUCT',
      raw_data:{ source_type:'COUPANG_SELLER_PRODUCT', status:item.status || null, stock_quantity:stockQuantity, inventory_verified:itemPrices.length > 0 }
    };
  }).filter(item => item.external_product_id && item.name);

  const naver = channelProducts.filter(item => item.platform === 'NAVER' && String(item.raw_data?.source_type || '').toUpperCase() === 'NAVER_COMMERCE_PRODUCT').map(item => ({
    platform:'NAVER', external_product_id:String(item.external_product_id || ''), name:item.external_product_name,
    external_product_name:item.external_product_name, selling_price:item.selling_price == null ? null : number(item.selling_price),
    is_active:isNaverSellableProduct(item), source_type:'NAVER_COMMERCE_PRODUCT',
    raw_data:{ ...(item.raw_data || {}), source_type:'NAVER_COMMERCE_PRODUCT' }
  })).filter(item => item.external_product_id && item.name);

  return [...naver,...coupang];
}

function rejectedPairKeys(history = []) {
  const seen = new Set(), rejected = [];
  for (const item of history) {
    const masterId = item.action === 'UNLINKED' ? item.previous_master_product_id : item.new_master_product_id;
    if (!masterId) continue;
    const key = `${item.platform}:${item.external_product_id}:${masterId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (['REJECTED','UNLINKED'].includes(item.action)) rejected.push(key);
  }
  return rejected;
}

function noLinkDecisionKeys(history = []) {
  const seen = new Set(), decisions = [];
  for (const item of history) {
    const platform = String(item?.platform || '').toUpperCase();
    const externalId = String(item?.external_product_id || '').trim();
    if (!PLATFORMS.has(platform) || !externalId) continue;
    const key = `${platform}:${externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.action === 'REJECTED' && !item.new_master_product_id && item.metadata?.decision === 'NO_LINK') decisions.push(key);
  }
  return decisions;
}

function dashboardSummary(masterProducts, channelProducts, candidates, sources) {
  const sourceKeys = new Set(sources.map(item => `${item.platform}:${item.external_product_id}`));
  const linked = channelProducts.filter(item => item.master_product_id && item.is_active === true && PLATFORMS.has(item.platform) && sourceKeys.has(`${item.platform}:${item.external_product_id}`));
  return {
    master_products:masterProducts.length,
    linked_total:linked.length,
    linked_naver:linked.filter(item => item.platform === 'NAVER').length,
    linked_coupang:linked.filter(item => item.platform === 'COUPANG').length,
    source_naver:sources.filter(item => item.platform === 'NAVER').length,
    source_coupang:sources.filter(item => item.platform === 'COUPANG').length,
    candidate_total:candidates.length,
    candidate_naver:candidates.filter(item => item.platform === 'NAVER').length,
    candidate_coupang:candidates.filter(item => item.platform === 'COUPANG').length,
    auto_eligible:candidates.filter(item => item.auto_eligible).length,
    auto_naver:candidates.filter(item => item.platform === 'NAVER' && item.auto_eligible).length,
    auto_coupang:candidates.filter(item => item.platform === 'COUPANG' && item.auto_eligible).length
  };
}

function buildMappingDashboard({ masterProducts = [], channelProducts = [], coupangProducts = [], coupangProductItems = [], coupangItemInventory = [], history = [] }) {
  const sources = createProductSources({ channelProducts, coupangProducts, coupangProductItems, coupangItemInventory });
  const eligibleMasterProducts = masterProducts
    .filter(item => item?.id && item.is_active === true)
    .slice()
    .sort(compareProductNames);
  const eligibleSources = sources.filter(item => item.is_active === true);
  const eligibleKeys = new Set(eligibleSources.map(item => `${item.platform}:${item.external_product_id}`));
  const noLinkKeys = new Set(noLinkDecisionKeys(history));
  const candidates = matcher.buildMappingCandidates({ masterProducts:eligibleMasterProducts, sources:eligibleSources, existingLinks:channelProducts, rejectedPairs:rejectedPairKeys(history) })
    .map(item => ({ ...item, no_link:noLinkKeys.has(`${item.platform}:${item.external_product_id}`) }));
  return {
    summary:{ ...dashboardSummary(eligibleMasterProducts, channelProducts, candidates, eligibleSources), inactive_sources:sources.length-eligibleSources.length, no_link_total:candidates.filter(item => item.no_link).length },
    masterProducts:eligibleMasterProducts,
    candidates,
    links:channelProducts.filter(item => item.master_product_id && item.is_active === true && PLATFORMS.has(item.platform) && eligibleKeys.has(`${item.platform}:${item.external_product_id}`)),
    history:history.slice(0, 50)
  };
}

async function loadMappingDashboard({ db }) {
  const [masters, links, cafe24Products, coupangProducts, coupangItems, coupangInventory, history] = await Promise.all([
    db.from('master_products').select('id,name,selling_price,is_active').eq('is_active',true).order('name'),
    db.from('channel_products').select('id,master_product_id,platform,external_product_id,external_product_name,selling_price,is_active,match_method,match_confidence,matched_at,matched_by,raw_data').eq('is_active',true).order('updated_at',{ascending:false}).limit(1000),
    db.from('cafe24_products').select('external_product_no,product_name,price,display,selling,raw_data').limit(5000),
    db.from('coupang_products').select('seller_product_id,product_name,status').order('updated_at',{ascending:false}).limit(500),
    db.from('coupang_product_items').select('vendor_item_id,seller_product_id,sale_price,status').limit(2000),
    db.from('coupang_item_inventory').select('vendor_item_id,quantity,status,raw_data,checked_at').limit(2000),
    db.from('product_mapping_history').select('id,platform,external_product_id,external_product_name,previous_master_product_id,new_master_product_id,action,match_method,match_confidence,actor,metadata,created_at').order('created_at',{ascending:false}).limit(1000)
  ]);
  const firstError = [masters,links,cafe24Products,coupangProducts,coupangItems,coupangInventory,history].find(result => result.error)?.error;
  if (firstError) throw firstError;
  const sellingCafe24Ids = new Set((cafe24Products.data || []).filter(item => cafe24Catalog.classifyCafe24Product(item).is_sellable).map(item => String(item.external_product_no)));
  const sellableMasterIds = new Set((links.data || []).filter(item => item.platform === 'CAFE24' && item.is_active === true && sellingCafe24Ids.has(String(item.external_product_id))).map(item => item.master_product_id));
  return buildMappingDashboard({
    masterProducts:(masters.data || []).filter(item => sellableMasterIds.has(item.id)), channelProducts:links.data || [],
    coupangProducts:coupangProducts.data || [], coupangProductItems:coupangItems.data || [], coupangItemInventory:coupangInventory.data || [], history:history.data || []
  });
}

function findSource(dashboard, platform, externalId) {
  const fromCandidate = dashboard.candidates.find(item => item.platform === platform && item.external_product_id === externalId);
  if (fromCandidate) return fromCandidate;
  const link = dashboard.links.find(item => item.platform === platform && item.external_product_id === externalId);
  return link ? { platform, external_product_id:externalId, external_product_name:link.external_product_name, name:link.external_product_name, selling_price:link.selling_price, raw_data:link.raw_data || {} } : null;
}

function planBulkManualMappingOperations({ dashboard, platform, assignments = [] }) {
  const requestedPlatform = String(platform || '').toUpperCase();
  if (!PLATFORMS.has(requestedPlatform)) throw new Error('일괄 연결 플랫폼을 확인해주세요.');
  const rows = (Array.isArray(assignments) ? assignments : []).slice(0, 100).map(item => ({
    externalProductId:String(item?.external_product_id || '').trim(),
    masterProductId:String(item?.master_product_id || '').trim()
  }));
  if (!rows.length) throw new Error('연결할 채널 상품을 선택해주세요.');
  if (rows.some(item => !item.externalProductId || !item.masterProductId)) throw new Error('선택한 상품의 연결할 기준상품을 모두 지정해주세요.');
  const externalIds = rows.map(item => item.externalProductId);
  if (new Set(externalIds).size !== externalIds.length) throw new Error('같은 채널 상품은 한 번만 연결할 수 있습니다.');

  const sourceMap = new Map((dashboard.candidates || [])
    .filter(item => item.platform === requestedPlatform && item.is_active === true)
    .map(item => [String(item.external_product_id), item]));
  const masterMap = new Map((dashboard.masterProducts || [])
    .filter(item => item?.id && item.is_active === true)
    .map(item => [String(item.id), item]));
  const operations = rows.map(item => {
    const source = sourceMap.get(item.externalProductId);
    if (!source) throw new Error('선택한 플랫폼에서 현재 판매·재고가 확인된 상품만 연결할 수 있습니다.');
    const master = masterMap.get(item.masterProductId);
    if (!master) throw new Error('판매 중인 Cafe24 기준상품만 연결할 수 있습니다.');
    const calculated = matcher.scoreProductMatch(master, source);
    return {
      source,
      masterProductId:item.masterProductId,
      rpcAction:'LINK',
      method:'MANUAL',
      confidence:calculated.score
    };
  });
  return { action:'BULK_MANUAL_LINK', platform:requestedPlatform, requested:rows.length, operations, skipped:0 };
}

function planBulkMappingDecisionOperations({ dashboard, platform, assignments = [] }) {
  const requestedPlatform = String(platform || '').toUpperCase();
  if (!PLATFORMS.has(requestedPlatform)) throw new Error('일괄 연결 플랫폼을 확인해주세요.');
  const rows = (Array.isArray(assignments) ? assignments : []).slice(0, 100).map(item => ({
    externalProductId:String(item?.external_product_id || '').trim(),
    masterProductId:String(item?.master_product_id || '').trim()
  }));
  if (!rows.length) throw new Error('연결할 채널 상품을 선택해주세요.');
  if (rows.some(item => !item.externalProductId || !item.masterProductId)) throw new Error('선택한 상품의 연결 결정을 모두 지정해주세요.');
  const externalIds = rows.map(item => item.externalProductId);
  if (new Set(externalIds).size !== externalIds.length) throw new Error('같은 채널 상품은 한 번만 결정할 수 있습니다.');

  const sourceMap = new Map((dashboard.candidates || [])
    .filter(item => item.platform === requestedPlatform && item.is_active === true)
    .map(item => [String(item.external_product_id), item]));
  const masterMap = new Map((dashboard.masterProducts || [])
    .filter(item => item?.id && item.is_active === true)
    .map(item => [String(item.id), item]));
  const operations = rows.map(item => {
    const source = sourceMap.get(item.externalProductId);
    if (!source) throw new Error('선택한 플랫폼에서 현재 판매·재고가 확인된 상품만 연결할 수 있습니다.');
    if (item.masterProductId === 'NO_LINK') return { source, masterProductId:null, rpcAction:'NO_LINK', method:'MANUAL', confidence:null };
    const master = masterMap.get(item.masterProductId);
    if (!master) throw new Error('판매 중인 Cafe24 기준상품만 연결할 수 있습니다.');
    const calculated = matcher.scoreProductMatch(master, source);
    return { source, masterProductId:item.masterProductId, rpcAction:'LINK', method:'MANUAL', confidence:calculated.score };
  });
  return { action:'BULK_ASSIGN', platform:requestedPlatform, requested:rows.length, operations, skipped:0 };
}

function planBulkMappingOperations({ dashboard, action, platform, externalProductIds = [] }) {
  const requestedAction = String(action || '').toUpperCase();
  const requestedPlatform = String(platform || '').toUpperCase();
  if (!PLATFORMS.has(requestedPlatform)) throw new Error('일괄 작업 플랫폼을 확인해주세요.');
  if (!['BULK_AUTO_LINK','BULK_REJECT','BULK_UNLINK'].includes(requestedAction)) throw new Error('지원하지 않는 일괄 매핑 작업입니다.');
  const ids = [...new Set((Array.isArray(externalProductIds) ? externalProductIds : []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length) throw new Error('일괄 작업할 상품을 선택해주세요.');
  const requestedIds = new Set(ids);
  const sourceRows = requestedAction === 'BULK_UNLINK' ? dashboard.links : dashboard.candidates;
  const rows = sourceRows.filter(item => item.platform === requestedPlatform && item.is_active === true && requestedIds.has(String(item.external_product_id)));
  const operations = [];
  for (const source of rows) {
    if (requestedAction === 'BULK_AUTO_LINK' && !source.auto_eligible) continue;
    const candidate = source.candidates?.[0];
    if (requestedAction !== 'BULK_UNLINK' && !candidate?.master_product_id) continue;
    operations.push({
      source,
      masterProductId:requestedAction === 'BULK_UNLINK' ? null : candidate.master_product_id,
      rpcAction:requestedAction === 'BULK_UNLINK' ? 'UNLINK' : requestedAction === 'BULK_REJECT' ? 'REJECT' : 'LINK',
      method:requestedAction === 'BULK_AUTO_LINK' ? 'AUTO' : 'MANUAL',
      confidence:requestedAction === 'BULK_UNLINK' ? null : candidate.score
    });
  }
  return { action:requestedAction, platform:requestedPlatform, requested:ids.length, operations, skipped:ids.length - operations.length };
}

async function callMappingRpc({ db, source, masterProductId, action, method, confidence, actor = 'DASHBOARD' }) {
  const result = await db.rpc('apply_product_mapping', {
    p_platform:source.platform,
    p_external_product_id:source.external_product_id,
    p_external_product_name:source.external_product_name || source.name,
    p_master_product_id:masterProductId || null,
    p_action:action,
    p_match_method:method || null,
    p_match_confidence:confidence == null ? null : Number(confidence),
    p_actor:String(actor || 'DASHBOARD').slice(0, 100),
    p_selling_price:source.selling_price == null ? null : number(source.selling_price),
    p_raw_data:{ ...(source.raw_data || {}), candidate_master_product_id:masterProductId || null }
  });
  if (result.error) throw result.error;
  return result.data;
}

async function recordNoLinkDecision({ db, source, actor = 'DASHBOARD' }) {
  const result = await db.from('product_mapping_history').insert({
    platform:source.platform,
    external_product_id:source.external_product_id,
    external_product_name:source.external_product_name || source.name,
    previous_master_product_id:null,
    new_master_product_id:null,
    action:'REJECTED',
    match_method:'MANUAL',
    match_confidence:null,
    actor:String(actor || 'DASHBOARD').slice(0, 100),
    metadata:{ decision:'NO_LINK', reason:'PLATFORM_EXCLUSIVE_PRODUCT' }
  });
  if (result.error) throw result.error;
  return { action:'NO_LINK', platform:source.platform, external_product_id:source.external_product_id };
}

async function mutateMapping({ db, body, actor = 'DASHBOARD' }) {
  const action = String(body.action || '').toUpperCase();
  const requestedPlatform = String(body.platform || '').toUpperCase();
  const dashboard = await loadMappingDashboard({ db });
  if (action === 'AUTO_LINK_ALL') {
    if (requestedPlatform && !PLATFORMS.has(requestedPlatform)) throw new Error('자동 연결 플랫폼을 확인해주세요.');
    const targets = dashboard.candidates.filter(item => item.auto_eligible && (!requestedPlatform || item.platform === requestedPlatform)).slice(0, 100);
    const results = [];
    for (const source of targets) {
      const candidate = source.candidates[0];
      results.push(await callMappingRpc({ db, source, masterProductId:candidate.master_product_id, action:'LINK', method:'AUTO', confidence:candidate.score, actor }));
    }
    return { action, linked:results.length, results };
  }

  if (['BULK_AUTO_LINK','BULK_REJECT','BULK_UNLINK'].includes(action)) {
    const plan = planBulkMappingOperations({ dashboard, action, platform:requestedPlatform, externalProductIds:body.external_product_ids });
    const results = [], failures = [];
    for (const operation of plan.operations) {
      try {
        results.push(await callMappingRpc({
          db,
          source:operation.source,
          masterProductId:operation.masterProductId,
          action:operation.rpcAction,
          method:operation.method,
          confidence:operation.confidence,
          actor
        }));
      } catch (error) {
        failures.push({ external_product_id:operation.source.external_product_id, error:error.message || '매핑 저장 실패' });
      }
    }
    return { action, platform:plan.platform, requested:plan.requested, processed:results.length, skipped:plan.skipped, failed:failures.length, failures, results };
  }

  if (action === 'BULK_ASSIGN') {
    const plan = planBulkMappingDecisionOperations({ dashboard, platform:requestedPlatform, assignments:body.assignments });
    const results = [], failures = [];
    for (const operation of plan.operations) {
      try {
        results.push(operation.rpcAction === 'NO_LINK'
          ? await recordNoLinkDecision({ db, source:operation.source, actor })
          : await callMappingRpc({ db, source:operation.source, masterProductId:operation.masterProductId, action:'LINK', method:operation.method, confidence:operation.confidence, actor }));
      } catch (error) {
        failures.push({ external_product_id:operation.source.external_product_id, error:error.message || '매핑 결정 저장 실패' });
      }
    }
    return { action, platform:plan.platform, requested:plan.requested, processed:results.length, skipped:0, failed:failures.length, failures, results };
  }

  if (action === 'BULK_MANUAL_LINK') {
    const plan = planBulkManualMappingOperations({ dashboard, platform:requestedPlatform, assignments:body.assignments });
    const results = [], failures = [];
    for (const operation of plan.operations) {
      try {
        results.push(await callMappingRpc({
          db,
          source:operation.source,
          masterProductId:operation.masterProductId,
          action:operation.rpcAction,
          method:operation.method,
          confidence:operation.confidence,
          actor
        }));
      } catch (error) {
        failures.push({ external_product_id:operation.source.external_product_id, error:error.message || '매핑 저장 실패' });
      }
    }
    return { action, platform:plan.platform, requested:plan.requested, processed:results.length, skipped:0, failed:failures.length, failures, results };
  }

  const platform = String(body.platform || '').toUpperCase(), externalId = String(body.external_product_id || '');
  if (!PLATFORMS.has(platform) || !externalId) throw new Error('플랫폼과 원천 상품을 확인해주세요.');
  const source = findSource(dashboard, platform, externalId);
  if (!source && platform === 'NAVER') throw new Error('네이버 광고그룹은 제외되며 스마트스토어 실상품만 연결할 수 있습니다.');
  if (!source) throw new Error('현재 수집 데이터에서 원천 상품을 찾지 못했습니다.');

  if (action === 'UNLINK') return callMappingRpc({ db, source, masterProductId:null, action:'UNLINK', method:'MANUAL', confidence:null, actor });
  if (!['LINK','REJECT'].includes(action)) throw new Error('지원하지 않는 매핑 작업입니다.');
  const masterId = String(body.master_product_id || '');
  const master = (await db.from('master_products').select('id,name,selling_price,is_active').eq('id',masterId).maybeSingle());
  if (master.error) throw master.error;
  if (!master.data) throw new Error('기준상품을 찾지 못했습니다.');
  if (master.data.is_active !== true) throw new Error('판매중인 기준상품만 연결할 수 있습니다.');
  const eligibility = await cafe24Catalog.masterProductEligibility({ db, masterProductId:masterId });
  if (!eligibility.eligible) throw new Error('판매중인 Cafe24 상품만 연결할 수 있습니다.');
  const calculated = matcher.scoreProductMatch(master.data, source);
  return callMappingRpc({ db, source, masterProductId:masterId, action, method:'MANUAL', confidence:calculated.score, actor });
}

module.exports = {
  createProductSources,
  compareProductNames,
  isCoupangSellingStatus,
  isNaverSellableProduct,
  isCoupangSellableInventory,
  rejectedPairKeys,
  noLinkDecisionKeys,
  buildMappingDashboard,
  loadMappingDashboard,
  planBulkMappingOperations,
  planBulkManualMappingOperations,
  planBulkMappingDecisionOperations,
  mutateMapping
};
