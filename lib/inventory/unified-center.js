'use strict';

const cafe24Catalog = require('../products/cafe24-catalog.js');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value) {
  return text(value).toUpperCase();
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = key.split('.').reduce((current, part) => current == null ? null : current[part], source);
    const parsed = numberOrNull(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function sumRows(rows, keys) {
  let found = false;
  let total = 0;
  for (const row of rows || []) {
    const value = firstNumber(row, keys);
    if (value == null) continue;
    found = true;
    total += value;
  }
  return found ? total : null;
}

function falseFlag(value) {
  return value === false || upper(value) === 'F' || upper(value) === 'FALSE' || upper(value) === 'N';
}

function cafe24Inventory(product) {
  const raw = product?.raw_data || {};
  const variants = raw.variants || raw.options || [];
  const directUseInventory = raw.use_inventory ?? raw.inventories?.use_inventory ?? raw.inventory?.use_inventory;
  if (!variants.length && falseFlag(directUseInventory)) return { quantity:null, unmanaged:true };

  let unmanaged = false;
  for (const variant of variants) {
    const useInventory = variant?.use_inventory ?? variant?.inventories?.use_inventory ?? variant?.inventory?.use_inventory;
    if (falseFlag(useInventory)) unmanaged = true;
  }
  // If even one sellable option does not use inventory management, zero or a
  // negative quantity must not be interpreted as a product-wide stockout.
  if (unmanaged) return { quantity:null, unmanaged:true };

  const direct = firstNumber(raw, ['inventory_quantity','stock_quantity','quantity','available_quantity','stock.quantity']);
  if (direct != null) return { quantity:direct, unmanaged:false };
  return {
    quantity:sumRows(variants, ['inventory_quantity','stock_quantity','quantity','available_quantity','inventories.quantity','inventory.quantity']),
    unmanaged:false
  };
}

function cafe24Quantity(product) {
  return cafe24Inventory(product).quantity;
}

function naverQuantity(link) {
  const raw = link?.raw_data || {};
  const direct = firstNumber(raw, ['stockQuantity','stock_quantity','inventory_quantity','quantity','availableQuantity']);
  if (direct != null) return direct;
  return sumRows(raw.optionCombinations || raw.options || raw.variants || [], ['stockQuantity','stock_quantity','inventory_quantity','quantity']);
}

function isNaverCommerce(link) {
  return upper(link?.raw_data?.source_type) === 'NAVER_COMMERCE_PRODUCT';
}

function latestIso(values) {
  const valid = values.map(value => Date.parse(value || '')).filter(Number.isFinite);
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
}

function isStale(value, now, staleHours) {
  const at = Date.parse(value || '');
  return Number.isFinite(at) ? now - at > staleHours * 3600000 : true;
}

function stockState(quantity, { missing = false, reference = false, stale = false } = {}) {
  if (reference) return 'REFERENCE';
  if (missing) return 'MISSING';
  if (quantity == null) return 'UNKNOWN';
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= 10) return 'LOW';
  if (stale) return 'STALE';
  return 'HEALTHY';
}

function stockLabel(state) {
  return {
    HEALTHY:'판매 가능', LOW:'저재고', OUT_OF_STOCK:'품절', STALE:'갱신 필요',
    UNKNOWN:'수량 확인 필요', MISSING:'미연결', REFERENCE:'광고 참고'
  }[state] || '확인 필요';
}

function buildUnifiedInventoryCenter({
  masterProducts = [], channelProducts = [], cafe24Products = [], coupangProductItems = [],
  coupangItemInventory = [], coupangRgInventory = [], productPerformance = [], salesPeriodDays = 7,
  now = new Date(), staleHours = 6
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const performanceByProduct = new Map((productPerformance || []).map(item => [String(item.master_product_id), item]));
  const cafeById = new Map(cafe24Products.map(item => [text(item.external_product_no), item]));
  const itemsBySeller = new Map();
  for (const item of coupangProductItems) {
    const key = text(item.seller_product_id);
    if (!key) continue;
    const rows = itemsBySeller.get(key) || [];
    rows.push(item);
    itemsBySeller.set(key, rows);
  }
  const itemInventoryById = new Map(coupangItemInventory.map(item => [text(item.vendor_item_id), item]));
  const rgInventoryById = new Map(coupangRgInventory.map(item => [text(item.vendor_item_id), item]));

  const items = masterProducts.filter(item => item.is_active !== false).map(master => {
    const links = channelProducts.filter(item => String(item.master_product_id) === String(master.id));
    const cafeLink = links.find(item => upper(item.platform) === 'CAFE24') || null;
    const naverLink = links.find(item => upper(item.platform) === 'NAVER') || null;
    const coupangLink = links.find(item => upper(item.platform) === 'COUPANG') || null;
    const cafeProduct = cafeLink ? cafeById.get(text(cafeLink.external_product_id)) : null;
    const catalog = cafeProduct
      ? cafe24Catalog.classifyCafe24Product(cafeProduct)
      : { status:'SELLING', label:'판매 중', is_sellable:true, excluded:false };
    if (catalog.excluded) return null;
    const cafeInventory = cafeProduct ? cafe24Inventory(cafeProduct) : { quantity:null, unmanaged:false };
    const cafeQuantityValue = cafeInventory.quantity;
    const cafeUpdatedAt = cafeProduct?.updated_at || cafeLink?.updated_at || null;
    const cafeStale = Boolean(cafeLink) && isStale(cafeUpdatedAt, nowMs, staleHours);

    const naverCommerce = isNaverCommerce(naverLink);
    const naverQuantityValue = naverCommerce ? naverQuantity(naverLink) : null;
    const naverUpdatedAt = naverLink?.raw_data?.updatedAt || naverLink?.raw_data?.updated_at || naverLink?.updated_at || null;
    const naverStale = naverCommerce && isStale(naverUpdatedAt, nowMs, staleHours);

    const coupangItems = coupangLink ? (itemsBySeller.get(text(coupangLink.external_product_id)) || []) : [];
    const marketRows = coupangItems.map(item => itemInventoryById.get(text(item.vendor_item_id))).filter(Boolean);
    const rgRows = coupangItems.map(item => rgInventoryById.get(text(item.vendor_item_id))).filter(Boolean);
    const marketplaceQuantity = marketRows.length ? marketRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0) : null;
    const rocketGrowthQuantity = rgRows.length ? rgRows.reduce((sum, row) => sum + Number(row.total_orderable_quantity || 0), 0) : null;
    const coupangQuantity = marketplaceQuantity == null && rocketGrowthQuantity == null ? null : Number(marketplaceQuantity || 0) + Number(rocketGrowthQuantity || 0);
    const coupangUpdatedAt = latestIso([...marketRows.map(row => row.checked_at), ...rgRows.map(row => row.snapshot_at)]);
    const coupangStale = Boolean(coupangLink) && isStale(coupangUpdatedAt, nowMs, staleHours);

    const channels = {
      CAFE24:{
        state:stockState(cafeQuantityValue,{ missing:!cafeLink, reference:cafeInventory.unmanaged, stale:cafeStale }), quantity:cafeQuantityValue,
        label:cafeInventory.unmanaged ? '재고관리 안 함' : stockLabel(stockState(cafeQuantityValue,{ missing:!cafeLink, stale:cafeStale })), updated_at:cafeUpdatedAt,
        quantity_label:cafeInventory.unmanaged ? '수량 제한 없음' : null,
        detail:cafeInventory.unmanaged ? 'Cafe24에서 재고 관리를 사용하지 않아 0개나 음수를 품절로 판단하지 않습니다.' : cafeLink ? cafeQuantityValue == null ? '상품은 연결됐지만 재고 수량 응답이 없습니다.' : 'Cafe24 판매 가능 수량' : 'Cafe24 상품 연결이 필요합니다.'
      },
      NAVER:{
        state:stockState(naverQuantityValue,{ missing:!naverCommerce, reference:Boolean(naverLink&&!naverCommerce), stale:naverStale }), quantity:naverQuantityValue,
        label:stockLabel(stockState(naverQuantityValue,{ missing:!naverCommerce, reference:Boolean(naverLink&&!naverCommerce), stale:naverStale })), updated_at:naverUpdatedAt,
        detail:naverCommerce ? naverQuantityValue == null ? '스마트스토어 재고 수량 확인이 필요합니다.' : '스마트스토어 판매 가능 수량' : naverLink ? '광고그룹 연결은 재고 자료가 아닙니다.' : '커머스 상품 연결이 필요합니다.'
      },
      COUPANG:{
        state:stockState(coupangQuantity,{ missing:!coupangLink, stale:coupangStale }), quantity:coupangQuantity,
        label:stockLabel(stockState(coupangQuantity,{ missing:!coupangLink, stale:coupangStale })), updated_at:coupangUpdatedAt,
        detail:coupangLink ? `판매자배송 ${marketplaceQuantity == null ? '확인 필요' : `${marketplaceQuantity}개`} · 로켓그로스 ${rocketGrowthQuantity == null ? '확인 필요' : `${rocketGrowthQuantity}개`}` : '쿠팡 상품 연결이 필요합니다.',
        marketplace_quantity:marketplaceQuantity, rocket_growth_quantity:rocketGrowthQuantity
      }
    };

    const issues = [];
    for (const [platform, channel] of Object.entries(channels)) {
      if (channel.state === 'OUT_OF_STOCK') issues.push({ code:`${platform}_OUT`, level:'DANGER', label:`${platform === 'CAFE24' ? 'Cafe24' : platform === 'NAVER' ? '네이버' : '쿠팡'} 품절` });
      if (channel.state === 'LOW') issues.push({ code:`${platform}_LOW`, level:'WARN', label:`${platform === 'CAFE24' ? 'Cafe24' : platform === 'NAVER' ? '네이버' : '쿠팡'} 저재고` });
      if (channel.state === 'STALE') issues.push({ code:`${platform}_STALE`, level:'WARN', label:`${platform === 'CAFE24' ? 'Cafe24' : platform === 'NAVER' ? '네이버' : '쿠팡'} 갱신 필요` });
      if (channel.state === 'UNKNOWN') issues.push({ code:`${platform}_UNKNOWN`, level:'INFO', label:`${platform === 'CAFE24' ? 'Cafe24' : platform === 'NAVER' ? '네이버' : '쿠팡'} 수량 확인 필요` });
      if (channel.state === 'MISSING') issues.push({ code:`${platform}_MISSING`, level:'INFO', label:`${platform === 'CAFE24' ? 'Cafe24' : platform === 'NAVER' ? '네이버' : '쿠팡'} 미연결` });
    }
    const knownQuantities = Object.values(channels).map(channel => numberOrNull(channel.quantity)).filter(value => value != null);
    const known = knownQuantities.length;
    const availableQuantity = knownQuantities.length ? Math.min(...knownQuantities) : null;
    const performance = performanceByProduct.get(String(master.id)) || null;
    const periodDays = Math.max(1, Number(salesPeriodDays) || 7);
    const units = performance ? numberOrNull(performance.units) : null;
    const averageDailySales = units != null ? units / periodDays : null;
    const velocityReady = averageDailySales != null && averageDailySales >= 0.15 && availableQuantity != null;
    const stockoutDays = velocityReady ? Math.max(0, Math.floor(availableQuantity / averageDailySales)) : null;
    const stockoutDate = stockoutDays == null ? null : new Date(nowMs + stockoutDays * 86400000).toISOString();
    const recommendedQuantity = velocityReady ? Math.max(0, Math.ceil(averageDailySales * 30 - availableQuantity)) : null;
    const replenishment = {
      status:recommendedQuantity == null ? 'CHECK_REQUIRED' : recommendedQuantity > 0 ? 'RECOMMENDED' : 'ENOUGH',
      available_quantity:availableQuantity,
      average_daily_sales:averageDailySales == null ? null : Number(averageDailySales.toFixed(2)),
      sales_period_days:periodDays,
      stockout_days:stockoutDays,
      stockout_date:stockoutDate,
      recommended_quantity:recommendedQuantity,
      basis:velocityReady ? `최근 ${periodDays}일 판매속도 · 가장 적은 채널 재고 기준` : '판매속도 또는 채널 재고 확인 필요'
    };
    return {
      master_product_id:master.id, name:master.name, channels, issues, known_channels:known,
      catalog_status:catalog.status,
      catalog_status_label:catalog.label,
      is_sellable:catalog.is_sellable,
      replenishment,
      action_required:issues.length > 0,
      priority:issues.some(issue => issue.level === 'DANGER') ? 3 : issues.some(issue => issue.level === 'WARN') ? 2 : issues.length ? 1 : 0
    };
  }).filter(Boolean).sort((a,b) => b.priority-a.priority || b.issues.length-a.issues.length || a.name.localeCompare(b.name,'ko'));

  const issueCount = suffix => items.filter(item => item.issues.some(issue => issue.code.endsWith(suffix))).length;
  return {
    summary:{
      products:items.length,
      sellable_products:items.filter(item => item.is_sellable !== false).length,
      unavailable_products:items.filter(item => item.is_sellable === false).length,
      stopped_products:items.filter(item => item.catalog_status === 'STOPPED').length,
      catalog_out_of_stock:items.filter(item => item.catalog_status === 'OUT_OF_STOCK').length,
      action_required:items.filter(item => item.action_required).length,
      out_of_stock:issueCount('_OUT'),
      low_stock:issueCount('_LOW'),
      stale:issueCount('_STALE'),
      unknown:issueCount('_UNKNOWN'),
      fully_known:items.filter(item => item.known_channels === 3).length,
      replenishment_recommended:items.filter(item => item.replenishment.status === 'RECOMMENDED').length,
      replenishment_ready:items.filter(item => item.replenishment.status !== 'CHECK_REQUIRED').length
    },
    items
  };
}

module.exports = { buildUnifiedInventoryCenter, cafe24Inventory, cafe24Quantity, naverQuantity, stockState, isStale };
