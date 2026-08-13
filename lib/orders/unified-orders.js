'use strict';

const crypto = require('node:crypto');

const STAGES = Object.freeze([
  { id:'PAID', label:'결제완료', description:'결제를 확인한 새 주문' },
  { id:'PREPARING', label:'준비중', description:'상품을 포장하는 주문' },
  { id:'READY_TO_SHIP', label:'출고대기', description:'송장·출고 처리가 필요한 주문' },
  { id:'SHIPPING', label:'배송중', description:'택배사로 넘어간 주문' },
  { id:'DELIVERED', label:'배송완료', description:'고객에게 도착한 주문' }
]);

const COUPANG_STAGE = Object.freeze({
  ACCEPT:'PAID', PAYMENT_COMPLETE:'PAID', PAID:'PAID',
  INSTRUCT:'PREPARING', PREPARING:'PREPARING', PREPARE:'PREPARING',
  DEPARTURE:'READY_TO_SHIP', READY_TO_SHIP:'READY_TO_SHIP', RELEASE_STOP_UNCHECKED:'READY_TO_SHIP',
  DELIVERING:'SHIPPING', SHIPPING:'SHIPPING',
  FINAL_DELIVERY:'DELIVERED', DELIVERED:'DELIVERED', COMPLETE:'DELIVERED'
});

const CAFE24_STAGE = Object.freeze({
  N00:'PAID', N01:'PAID', N10:'PREPARING', N20:'READY_TO_SHIP', N21:'READY_TO_SHIP',
  N22:'SHIPPING', N30:'SHIPPING', N40:'DELIVERED',
  PAYMENT_COMPLETE:'PAID', PAID:'PAID', PREPARING:'PREPARING', READY_TO_SHIP:'READY_TO_SHIP',
  SHIPPING:'SHIPPING', SHIPPED:'SHIPPING', DELIVERED:'DELIVERED', COMPLETE:'DELIVERED'
});

function number(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function text(value) { return value == null ? '' : String(value).trim(); }
function upper(value) { return text(value).toUpperCase(); }
function dateOnly(value) { return text(value).slice(0, 10); }

function hubOrderId(platform, externalOrderId) {
  const prefix = { CAFE24:'C24', COUPANG:'CP', NAVER:'NV' }[platform] || 'ETC';
  const digest = crypto.createHash('sha1').update(`${platform}:${externalOrderId}`).digest('hex').slice(0, 8).toUpperCase();
  return `HR-${prefix}-${digest}`;
}

function firstValue(...values) { return values.find(value => value != null && value !== '') ?? null; }

function cafe24Status(order) {
  const raw = order.raw_data || {};
  return upper(firstValue(order.payment_status, raw.order_status, raw.payment_status, raw.shipping_status, raw.status));
}

function coupangStatus(order) { return upper(firstValue(order.status, order.raw_data?.status, order.raw_data?.shipmentStatus)); }

function stageFor(platform, status) {
  const value = upper(status);
  if (platform === 'CAFE24') return CAFE24_STAGE[value] || (value.startsWith('C') ? 'PAID' : 'PAID');
  if (platform === 'COUPANG') return COUPANG_STAGE[value] || 'PAID';
  return COUPANG_STAGE[value] || CAFE24_STAGE[value] || 'PAID';
}

function itemSummary(items) {
  if (!items.length) return { productName:'상품 정보 수집 대기', productNames:[], quantity:0, items:[] };
  const normalized = items.map(item => ({
    name:text(item.product_name || item.name || item.raw_data?.product_name) || '상품명 확인 필요',
    option:text(item.option_name || item.raw_data?.option_value || item.raw_data?.variant_name),
    quantity:Math.max(1, number(item.quantity)),
    amount:number(item.paid_amount ?? item.amount ?? item.unit_price)
  }));
  return {
    productName:normalized.length > 1 ? `${normalized[0].name} 외 ${normalized.length - 1}개` : normalized[0].name,
    productNames:normalized.map(item => item.name),
    quantity:normalized.reduce((sum, item) => sum + item.quantity, 0),
    items:normalized
  };
}

function groupBy(rows, key) {
  const result = new Map();
  for (const row of rows || []) {
    const value = text(row?.[key]);
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(row);
  }
  return result;
}

function normalizeCafe24Orders(orders = [], items = []) {
  const byOrder = groupBy(items, 'order_id');
  return orders.map(order => {
    const externalOrderId = text(order.order_id);
    const status = cafe24Status(order);
    const products = itemSummary(byOrder.get(externalOrderId) || []);
    const raw = order.raw_data || {};
    const cancellationRequested = number(order.cancel_amount) > 0 || /^C/.test(status) || Boolean(raw.canceled || raw.cancel_request);
    return {
      hubOrderId:hubOrderId('CAFE24', externalOrderId), platform:'CAFE24', channelLabel:'Cafe24',
      externalOrderId, shipmentId:text(raw.shipping_code || raw.shipping_id), orderedAt:firstValue(order.order_date, raw.order_date, raw.created_date),
      status, stage:stageFor('CAFE24', status), amount:number(order.paid_amount ?? order.order_price),
      ...products, cancellationRequested, actionRequired:cancellationRequested || ['PAID','PREPARING','READY_TO_SHIP'].includes(stageFor('CAFE24', status)),
      fulfillment:'SELLER', source:'cafe24_orders'
    };
  });
}

function normalizeCoupangOrders(orders = [], items = [], returns = [], rgOrders = [], rgItems = []) {
  const byShipment = groupBy(items, 'shipment_box_id');
  const returnIds = new Set((returns || []).map(item => text(item.order_id)).filter(Boolean));
  const rgOrderIds = new Set((rgOrders || []).map(item => text(item.order_id)));
  const seller = orders.filter(order => !rgOrderIds.has(text(order.order_id))).map(order => {
    const externalOrderId = text(order.order_id);
    const status = coupangStatus(order);
    const stage = stageFor('COUPANG', status);
    const rows = byShipment.get(text(order.shipment_box_id)) || [];
    const products = itemSummary(rows);
    const cancellationRequested = returnIds.has(externalOrderId) || rows.some(item => number(item.raw_data?.cancelQuantity) > 0);
    return {
      hubOrderId:hubOrderId('COUPANG', externalOrderId), platform:'COUPANG', channelLabel:'쿠팡',
      externalOrderId, shipmentId:text(order.shipment_box_id), orderedAt:firstValue(order.ordered_at, order.paid_at),
      status, stage, amount:number(order.gross_amount), ...products, cancellationRequested,
      actionRequired:cancellationRequested || ['PAID','PREPARING','READY_TO_SHIP'].includes(stage), fulfillment:'SELLER', source:'coupang_orders'
    };
  });
  const byRgOrder = groupBy(rgItems, 'order_id');
  const rocketGrowth = (rgOrders || []).map(order => {
    const externalOrderId = text(order.order_id);
    const status = coupangStatus(order);
    const products = itemSummary(byRgOrder.get(externalOrderId) || []);
    return {
      hubOrderId:hubOrderId('COUPANG', `RG:${externalOrderId}`), platform:'COUPANG', channelLabel:'쿠팡',
      externalOrderId, shipmentId:'', orderedAt:order.paid_at, status, stage:stageFor('COUPANG', status),
      amount:number(order.total_amount), ...products, cancellationRequested:returnIds.has(externalOrderId),
      actionRequired:returnIds.has(externalOrderId), fulfillment:'ROCKET_GROWTH', source:'coupang_rg_orders'
    };
  });
  return [...seller, ...rocketGrowth];
}

function normalizeNaverOrders(orders = [], items = []) {
  const byOrder = groupBy(items, 'order_id');
  return orders.map(order => {
    const externalOrderId = text(order.order_id || order.product_order_id);
    const status = upper(order.status || order.product_order_status);
    const products = itemSummary(byOrder.get(externalOrderId) || [order]);
    const stage = stageFor('NAVER', status);
    const cancellationRequested = /CANCEL|RETURN|EXCHANGE/.test(status);
    return {
      hubOrderId:hubOrderId('NAVER', externalOrderId), platform:'NAVER', channelLabel:'네이버', externalOrderId,
      shipmentId:text(order.shipment_id), orderedAt:order.ordered_at || order.payment_date, status, stage,
      amount:number(order.paid_amount || order.total_payment_amount), ...products, cancellationRequested,
      actionRequired:cancellationRequested || ['PAID','PREPARING','READY_TO_SHIP'].includes(stage), fulfillment:'SELLER', source:'naver_orders'
    };
  });
}

function connectionState(platform, channelConnections = [], unavailable = false, rows = []) {
  const connection = channelConnections.find(item => item.platform === platform);
  if (unavailable) return { platform, status:'FAILED', label:'불러오기 실패', message:'이 채널만 잠시 불러오지 못했습니다. 다른 채널 주문은 계속 확인할 수 있습니다.' };
  if (platform === 'NAVER' && !connection && !rows.length) return { platform, status:'SETUP_REQUIRED', label:'설정 필요', message:'네이버 커머스 API를 연결하면 주문이 자동으로 합쳐집니다.' };
  if (connection?.status === 'SETUP_REQUIRED') return { platform, status:'SETUP_REQUIRED', label:'설정 필요', message:'API 연결을 마치면 이 자리에 주문이 자동으로 합쳐집니다.' };
  if (connection?.status === 'RECONNECT_REQUIRED') return { platform, status:'RECONNECT_REQUIRED', label:'재연결 필요', message:'권한을 다시 연결해야 최신 주문을 가져올 수 있습니다.' };
  if (connection?.status === 'FAILED') return { platform, status:'FAILED', label:'수집 실패', message:'이전 주문을 유지하고 새 수집 상태를 확인 중입니다.' };
  return { platform, status:'READY', label:'정상', message:`${rows.length.toLocaleString('ko-KR')}건 표시` };
}

function buildUnifiedOrders(input = {}) {
  const cafe24 = normalizeCafe24Orders(input.cafe24Orders, input.cafe24OrderItems);
  const coupang = normalizeCoupangOrders(input.coupangOrders, input.coupangOrderItems, input.coupangReturns, input.coupangRgOrders, input.coupangRgOrderItems);
  const naver = normalizeNaverOrders(input.naverOrders, input.naverOrderItems);
  const orders = [...cafe24, ...coupang, ...naver].sort((a, b) => String(b.orderedAt || '').localeCompare(String(a.orderedAt || '')));
  const channels = [
    connectionState('NAVER', input.channelConnections, Boolean(input.unavailable?.NAVER), naver),
    connectionState('CAFE24', input.channelConnections, Boolean(input.unavailable?.CAFE24), cafe24),
    connectionState('COUPANG', input.channelConnections, Boolean(input.unavailable?.COUPANG), coupang)
  ];
  const stageCounts = Object.fromEntries(STAGES.map(stage => [stage.id, orders.filter(order => order.stage === stage.id).length]));
  return {
    phase:'11-2', stages:STAGES, orders, channels, stageCounts,
    summary:{ total:orders.length, actionRequired:orders.filter(order => order.actionRequired).length, cancellations:orders.filter(order => order.cancellationRequested).length, amount:orders.reduce((sum, order) => sum + order.amount, 0) }
  };
}

function filterUnifiedOrders(orders = [], filters = {}) {
  const query = text(filters.query).toLowerCase();
  return orders.filter(order => {
    if (filters.platform && filters.platform !== 'ALL' && order.platform !== filters.platform) return false;
    if (filters.stage && filters.stage !== 'ALL' && order.stage !== filters.stage) return false;
    if (filters.actionRequired === true && !order.actionRequired) return false;
    if (filters.startDate && dateOnly(order.orderedAt) < filters.startDate) return false;
    if (filters.endDate && dateOnly(order.orderedAt) > filters.endDate) return false;
    if (query && ![order.hubOrderId, order.externalOrderId, order.productName, ...(order.productNames || [])].join(' ').toLowerCase().includes(query)) return false;
    return true;
  });
}

async function isolatedQuery(query) {
  try {
    const result = await query;
    if (result.error) throw result.error;
    return { rows:result.data || [], unavailable:false };
  } catch (error) {
    return { rows:[], unavailable:true, error:{ code:String(error?.code || 'QUERY_ERROR'), message:'채널 주문을 불러오지 못했습니다.' } };
  }
}

async function loadUnifiedOrders({ db, channelConnections = [] }) {
  const [cafe24Orders, cafe24Items, coupangOrders, coupangItems, coupangReturns, rgOrders, rgItems] = await Promise.all([
    isolatedQuery(db.from('cafe24_orders').select('order_id,order_date,payment_status,order_price,paid_amount,cancel_amount,raw_data').order('order_date',{ascending:false}).limit(10000)),
    isolatedQuery(db.from('cafe24_order_items').select('order_id,product_name,option_name,quantity,unit_price,paid_amount,raw_data').limit(20000)),
    isolatedQuery(db.from('coupang_orders').select('shipment_box_id,order_id,ordered_at,paid_at,status,gross_amount,raw_data').order('ordered_at',{ascending:false}).limit(5000)),
    isolatedQuery(db.from('coupang_order_items').select('shipment_box_id,order_id,product_name,quantity,unit_price,paid_amount,status,raw_data').limit(15000)),
    isolatedQuery(db.from('coupang_returns').select('order_id,status,requested_at').order('requested_at',{ascending:false}).limit(1000)),
    isolatedQuery(db.from('coupang_rg_orders').select('order_id,status,paid_at,total_amount,item_count').order('paid_at',{ascending:false}).limit(5000)),
    isolatedQuery(db.from('coupang_rg_order_items').select('order_id,product_name,quantity,amount').limit(15000))
  ]);
  return buildUnifiedOrders({
    cafe24Orders:cafe24Orders.rows, cafe24OrderItems:cafe24Items.rows,
    coupangOrders:coupangOrders.rows, coupangOrderItems:coupangItems.rows, coupangReturns:coupangReturns.rows,
    coupangRgOrders:rgOrders.rows, coupangRgOrderItems:rgItems.rows, channelConnections,
    unavailable:{ CAFE24:cafe24Orders.unavailable, COUPANG:coupangOrders.unavailable || rgOrders.unavailable, NAVER:false }
  });
}

module.exports = {
  STAGES, buildUnifiedOrders, filterUnifiedOrders, hubOrderId, loadUnifiedOrders,
  normalizeCafe24Orders, normalizeCoupangOrders, normalizeNaverOrders, stageFor
};
