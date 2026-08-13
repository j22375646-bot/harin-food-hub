'use strict';

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function isNaverCommerceProduct(link) {
  return upper(link?.raw_data?.source_type) === 'NAVER_COMMERCE_PRODUCT';
}

function linkFor(links, platform) {
  return links.find(item => upper(item.platform) === platform) || null;
}

function priceGapRate(prices) {
  const valid = prices.filter(value => number(value) > 0).map(number);
  if (valid.length < 2) return null;
  const lowest = Math.min(...valid);
  return lowest > 0 ? ((Math.max(...valid) - lowest) / lowest) * 100 : null;
}

function buildUnifiedProductOperations({
  masterProducts = [],
  channelProducts = [],
  cafe24Products = [],
  coupangProducts = [],
  coupangProductItems = [],
  coupangItemInventory = []
} = {}) {
  const cafe24ById = new Map(cafe24Products.map(item => [text(item.external_product_no), item]));
  const coupangById = new Map(coupangProducts.map(item => [text(item.seller_product_id), item]));
  const inventoryByVendorItem = new Map(coupangItemInventory.map(item => [text(item.vendor_item_id), item]));
  const coupangItemsByProduct = new Map();

  for (const item of coupangProductItems) {
    const key = text(item.seller_product_id);
    if (!key) continue;
    const current = coupangItemsByProduct.get(key) || [];
    current.push(item);
    coupangItemsByProduct.set(key, current);
  }

  const items = masterProducts.filter(item => item.is_active !== false).map(master => {
    const links = channelProducts.filter(item => String(item.master_product_id) === String(master.id));
    const cafeLink = linkFor(links, 'CAFE24');
    const naverLink = linkFor(links, 'NAVER');
    const coupangLink = linkFor(links, 'COUPANG');
    const cafeSource = cafeLink ? cafe24ById.get(text(cafeLink.external_product_id)) : null;
    const coupangSource = coupangLink ? coupangById.get(text(coupangLink.external_product_id)) : null;
    const coupangItems = coupangLink ? (coupangItemsByProduct.get(text(coupangLink.external_product_id)) || []) : [];
    const inventoryRows = coupangItems.map(item => inventoryByVendorItem.get(text(item.vendor_item_id))).filter(Boolean);
    const totalInventory = inventoryRows.length ? inventoryRows.reduce((sum, row) => sum + number(row.quantity), 0) : null;
    const coupangPrices = coupangItems.map(item => number(item.sale_price)).filter(Boolean);
    const naverCommerce = isNaverCommerceProduct(naverLink);
    const channelState = {
      CAFE24: cafeLink ? {
        state:cafeSource?.selling === false || cafeLink.is_active === false ? 'STOPPED' : 'ACTIVE',
        label:cafeSource?.selling === false || cafeLink.is_active === false ? '판매중지' : '판매중',
        name:cafeLink.external_product_name || cafeSource?.product_name || 'Cafe24 상품',
        price:number(cafeSource?.price || cafeLink.selling_price) || null,
        detail:cafeSource ? '실상품 연결' : '연결 정보만 있음'
      } : { state:'MISSING', label:'미연결', name:null, price:null, detail:'상품 연결 필요' },
      NAVER: naverCommerce ? {
        state:naverLink.is_active === false ? 'STOPPED' : 'ACTIVE',
        label:naverLink.is_active === false ? '판매중지' : '판매중',
        name:naverLink.external_product_name,
        price:number(naverLink.selling_price) || null,
        detail:'스마트스토어 실상품'
      } : naverLink ? {
        state:'REFERENCE', label:'광고 참고', name:naverLink.external_product_name,
        price:null, detail:'광고그룹이며 실상품이 아님'
      } : { state:'MISSING', label:'미연결', name:null, price:null, detail:'커머스 API 연결 후 확인' },
      COUPANG: coupangLink ? {
        state:coupangLink.is_active === false || /deleted|stopped|suspended/i.test(text(coupangSource?.status)) ? 'STOPPED' : totalInventory === 0 ? 'OUT_OF_STOCK' : 'ACTIVE',
        label:coupangLink.is_active === false || /deleted|stopped|suspended/i.test(text(coupangSource?.status)) ? '판매중지' : totalInventory === 0 ? '품절' : '판매중',
        name:coupangLink.external_product_name || coupangSource?.product_name || '쿠팡 상품',
        price:coupangPrices.length ? Math.min(...coupangPrices) : number(coupangLink.selling_price) || null,
        inventory:totalInventory,
        detail:totalInventory == null ? '재고 확인 필요' : `판매가능 ${totalInventory}개`
      } : { state:'MISSING', label:'미연결', name:null, price:null, inventory:null, detail:'상품 연결 필요' }
    };

    const issues = [];
    if (channelState.CAFE24.state === 'MISSING') issues.push({ code:'CAFE24_MISSING', level:'WARN', label:'Cafe24 미연결' });
    if (!naverCommerce) issues.push({ code:naverLink ? 'NAVER_AD_REFERENCE' : 'NAVER_MISSING', level:'INFO', label:naverLink ? '네이버 광고만 연결' : '네이버 실상품 미연결' });
    if (channelState.COUPANG.state === 'MISSING') issues.push({ code:'COUPANG_MISSING', level:'WARN', label:'쿠팡 미연결' });
    if (['STOPPED','OUT_OF_STOCK'].includes(channelState.CAFE24.state)) issues.push({ code:'CAFE24_INACTIVE', level:'DANGER', label:'Cafe24 판매 확인' });
    if (['STOPPED','OUT_OF_STOCK'].includes(channelState.COUPANG.state)) issues.push({ code:'COUPANG_INACTIVE', level:'DANGER', label:channelState.COUPANG.state === 'OUT_OF_STOCK' ? '쿠팡 품절' : '쿠팡 판매 확인' });
    const lowConfidence = links.some(link => link.match_confidence != null && number(link.match_confidence) < 0.8);
    if (lowConfidence) issues.push({ code:'LOW_CONFIDENCE', level:'WARN', label:'상품 연결 검토' });
    const gapRate = priceGapRate([channelState.CAFE24.price, channelState.NAVER.price, channelState.COUPANG.price]);
    if (gapRate != null && gapRate >= 10) issues.push({ code:'PRICE_GAP', level:'WARN', label:`채널 가격차 ${gapRate.toFixed(0)}%` });

    const realConnected = [channelState.CAFE24, channelState.NAVER, channelState.COUPANG].filter(channel => ['ACTIVE','STOPPED','OUT_OF_STOCK'].includes(channel.state)).length;
    return {
      master_product_id:master.id,
      name:master.name,
      base_price:number(master.selling_price) || null,
      connected_channels:realConnected,
      channels:channelState,
      issues,
      action_required:issues.some(issue => issue.level !== 'INFO'),
      price_gap_rate:gapRate
    };
  });

  const unmatched = channelProducts.filter(link => link.master_product_id == null).length;
  return {
    summary:{
      master_products:items.length,
      all_channels_connected:items.filter(item => item.connected_channels === 3).length,
      action_required:items.filter(item => item.action_required).length,
      price_gap:items.filter(item => item.issues.some(issue => issue.code === 'PRICE_GAP')).length,
      stopped_or_out:items.filter(item => item.issues.some(issue => issue.level === 'DANGER')).length,
      unmatched_sources:unmatched,
      naver_real_products:items.filter(item => ['ACTIVE','STOPPED'].includes(item.channels.NAVER.state)).length
    },
    items:items.sort((a, b) => Number(b.action_required) - Number(a.action_required) || b.issues.length - a.issues.length || a.name.localeCompare(b.name, 'ko'))
  };
}

module.exports = { buildUnifiedProductOperations, isNaverCommerceProduct, priceGapRate };
