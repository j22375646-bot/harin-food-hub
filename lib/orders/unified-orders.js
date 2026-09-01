'use strict';

const crypto = require('node:crypto');
const shippingWorkbench = require('../shipping/workbench.js');
const channelTransfer = require('../shipping/channel-transfer.js');
const issueHistory = require('../epost/issue-history.js');
const trackingQueue = require('../shipping/tracking-queue.js');
const businessCalendar = require('../shipping-reference/business-calendar.js');
const shippingReference = require('../shipping-reference/readiness.js');

const STAGES = Object.freeze([
  { id:'PAID', label:'결제완료', description:'결제를 확인한 새 주문' },
  { id:'PREPARING', label:'준비중', description:'상품을 포장하는 주문' },
  { id:'READY_TO_SHIP', label:'출고대기', description:'송장·출고 처리가 필요한 주문' },
  { id:'WAITING_FOR_CARRIER', label:'배송대기중', description:'송장 등록 완료 후 우체국 접수·이동을 기다리는 주문' },
  { id:'SHIPPING', label:'배송중', description:'택배사로 넘어간 주문' },
  { id:'DELIVERED', label:'배송완료', description:'고객에게 도착한 주문' },
  { id:'CANCELLED', label:'취소', description:'쇼핑몰에서 취소 완료된 주문' }
]);

const COUPANG_STAGE = Object.freeze({
  ACCEPT:'PAID', PAYMENT_COMPLETE:'PAID', PAID:'PAID',
  INSTRUCT:'PREPARING', PREPARING:'PREPARING', PREPARE:'PREPARING',
  DEPARTURE:'READY_TO_SHIP', READY_TO_SHIP:'READY_TO_SHIP', RELEASE_STOP_UNCHECKED:'READY_TO_SHIP',
  DELIVERING:'SHIPPING', SHIPPING:'SHIPPING',
  FINAL_DELIVERY:'DELIVERED', DELIVERED:'DELIVERED', COMPLETE:'DELIVERED',
  CANCELLED:'CANCELLED', CANCELED:'CANCELLED', CANCELED_BY_NOPAYMENT:'CANCELLED'
});

const CAFE24_STAGE = Object.freeze({
  N00:'PAID', N01:'PAID', N10:'PREPARING', N20:'READY_TO_SHIP', N21:'READY_TO_SHIP',
  N22:'SHIPPING', N30:'SHIPPING', N40:'DELIVERED', N50:'DELIVERED',
  PAYMENT_COMPLETE:'PAID', PAID:'PAID', PREPARING:'PREPARING', READY_TO_SHIP:'READY_TO_SHIP',
  SHIPPING:'SHIPPING', SHIPPED:'SHIPPING', DELIVERED:'DELIVERED', COMPLETE:'DELIVERED'
});

const NAVER_STAGE = Object.freeze({
  PAYMENT_WAITING:'PAID', PAYED:'PAID',
  PREPARING_PRODUCT:'PREPARING',
  DISPATCHED:'READY_TO_SHIP',
  DELIVERING:'SHIPPING',
  DELIVERED:'DELIVERED', PURCHASE_DECIDED:'DELIVERED',
  CANCELLED:'CANCELLED', CANCELED:'CANCELLED', CANCELED_BY_NOPAYMENT:'CANCELLED'
});

function number(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function text(value) { return value == null ? '' : String(value).trim(); }
function upper(value) { return text(value).toUpperCase(); }
function dateOnly(value) { return text(value).slice(0, 10); }
function koreaDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
}

function koreaOrderTime(value) {
  const date=new Date(value);
  if(!value||Number.isNaN(date.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return { date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),minute:Number(parts.minute) };
}

function fulfillmentTiming(order, asOf=new Date(),calendar={}) {
  const estimate=businessCalendar.calculateShippingEstimate({orderedAt:order.orderedAt,asOf,holidayDates:calendar.holidayDates||[],holidayReady:Boolean(calendar.holidayReady)});
  if(!estimate.plannedShipDate)return {timingBadge:null,shippingEstimate:estimate};
  const active=['PAID','PREPARING','READY_TO_SHIP'].includes(order.stage);
  if(!active)return {timingBadge:null,shippingEstimate:estimate};
  if(estimate.status==='OVERDUE'){
    if(estimate.confidence!=='READY')return {timingBadge:{type:'CHECK_REQUIRED',label:'출고일 확인',detail:`${estimate.plannedShipDate} 출고 예정 · ${estimate.note}`},shippingEstimate:estimate};
    return {timingBadge:{type:'DELAYED',label:'배송지연',detail:`예정 출고일 ${estimate.plannedShipDate} · 영업일 ${Math.max(1,estimate.businessDaysLate)}일 지연`},shippingEstimate:estimate};
  }
  if(estimate.status==='DUE_TODAY')return {timingBadge:{type:estimate.confidence==='READY'?'SAME_DAY':'SAME_DAY_PARTIAL',label:estimate.confidence==='READY'?'당일출고':'오늘 출고 예정',detail:`예정 출고일 ${estimate.plannedShipDate} · ${estimate.note}`},shippingEstimate:estimate};
  return {timingBadge:{type:'SCHEDULED',label:'출고 예정',detail:`예정 출고일 ${estimate.plannedShipDate} · ${estimate.note}`},shippingEstimate:estimate};
}

function hubOrderId(platform, externalOrderId) {
  const prefix = { CAFE24:'C24', COUPANG:'CP', NAVER:'NV' }[platform] || 'ETC';
  const digest = crypto.createHash('sha1').update(`${platform}:${externalOrderId}`).digest('hex').slice(0, 8).toUpperCase();
  return `HR-${prefix}-${digest}`;
}

function firstValue(...values) { return values.find(value => value != null && value !== '') ?? null; }
function truthyFlag(value) { return value === true || ['T','TRUE','Y','YES','1'].includes(upper(value)); }

function safeProductImage(value) {
  const candidate=text(value);
  if(!candidate)return '';
  if(candidate.startsWith('//'))return `https:${candidate}`;
  if(/^http:\/\//i.test(candidate))return candidate.replace(/^http:/i,'https:');
  return /^https:\/\//i.test(candidate)?candidate:'';
}

function safeCoupangCdnImage(value) {
  const direct=safeProductImage(value);
  if(direct)return direct;
  const candidate=text(value).replace(/^\/+/, '').replace(/^image\//i,'');
  if(!candidate||candidate.includes('..')||!/^[A-Za-z0-9._%/-]+$/.test(candidate))return '';
  return `https://image10.coupangcdn.com/image/${candidate}`;
}

function productImageFromRaw(raw = {}) {
  const direct=[
    raw.image_url,raw.imageUrl,raw.thumbnail_url,raw.thumbnailUrl,raw.thumbnail,
    raw.productImage,raw.product_image,raw.productImageUrl,raw.product_image_url,
    raw.small_image,raw.list_image,raw.tiny_image,raw.detail_image,
    raw.representativeImage?.url,raw.representativeImage?.imageUrl,raw.representative_image?.url,
    raw.image?.url,raw.image?.imageUrl,raw.image?.vendorPath,
    raw.product?.imageUrl,raw.product?.representativeImage?.url,
    raw.images?.[0]?.url,raw.images?.[0]?.imageUrl,raw.images?.[0]?.vendorPath,
    raw.itemImages?.[0]?.url,raw.productImages?.[0]?.url
  ].map(safeProductImage).find(Boolean);
  if(direct)return direct;
  return [
    raw.image?.cdnPath,raw.images?.[0]?.cdnPath,
    raw.itemImages?.[0]?.cdnPath,raw.productImages?.[0]?.cdnPath
  ].map(safeCoupangCdnImage).find(Boolean)||'';
}

function productNameKeys(value) {
  const normalized=text(value)
    .toLowerCase()
    .replace(/<[^>]*>/g,' ')
    .replace(/[\u{1F300}-\u{1FAFF}\uFE0F]/gu,' ')
    .replace(/\s*,\s*\d+\s*개\s*$/u,' ')
    .replace(/[^\p{L}\p{N}]+/gu,'');
  if(!normalized)return [];
  const withoutBrand=normalized.replace(/^(?:202\d년)?(?:국내산)?하린식품/u,'');
  return [...new Set([normalized,withoutBrand].filter(key=>key.length>=4))];
}

function buildOrderImageCatalog(cafe24Products = [], channelProducts = []) {
  const direct=new Map();
  const master=new Map();
  const cafeImages=new Map();
  for(const product of cafe24Products||[]){
    const external=text(product.external_product_no);
    const image=productImageFromRaw(product.raw_data||product);
    if(external&&image){cafeImages.set(external,image);direct.set(`CAFE24:${external}`,image);}
  }
  for(const product of channelProducts||[]){
    const platform=upper(product.platform),external=text(product.external_product_id),masterId=text(product.master_product_id);
    const raw=product.raw_data||{};
    const directImage=productImageFromRaw(raw);
    const image=directImage||(platform==='CAFE24'?cafeImages.get(external):'');
    const aliases=[external,raw.channelProductNo,raw.productNo,raw.originProductNo,raw.groupProductNo,raw.id,
      raw.productId,raw.sellerProductId,raw.vendorItemId,raw.sellerProductItemId].map(text).filter(Boolean);
    if(platform&&image)for(const alias of aliases)direct.set(`${platform}:${alias}`,image);
    if(platform&&image){
      for(const name of [product.external_product_name,raw.name,raw.productName]){
        for(const key of productNameKeys(name))direct.set(`NAME:${platform}:${key}`,image);
      }
    }
    if(masterId&&image&&!master.has(masterId))master.set(masterId,image);
  }
  for(const product of channelProducts||[]){
    const platform=upper(product.platform),external=text(product.external_product_id),masterId=text(product.master_product_id);
    const image=masterId?master.get(masterId):'';
    if(platform&&external&&image&&!direct.has(`${platform}:${external}`))direct.set(`${platform}:${external}`,image);
  }
  // Product-detail rows use vendor item IDs while channel mappings use seller product IDs.
  // Once a seller/master image is known, copy it to every alias from the same real item.
  for(const product of channelProducts||[]){
    const platform=upper(product.platform),raw=product.raw_data||{};
    const aliases=[product.external_product_id,raw.channelProductNo,raw.productNo,raw.originProductNo,raw.groupProductNo,raw.id,
      raw.productId,raw.sellerProductId,raw.vendorItemId,raw.sellerProductItemId].map(text).filter(Boolean);
    const image=aliases.map(alias=>direct.get(`${platform}:${alias}`)).find(Boolean);
    if(!platform||!image)continue;
    for(const alias of aliases)if(!direct.has(`${platform}:${alias}`))direct.set(`${platform}:${alias}`,image);
    for(const name of [product.external_product_name,raw.name,raw.productName]){
      for(const key of productNameKeys(name))if(!direct.has(`NAME:${platform}:${key}`))direct.set(`NAME:${platform}:${key}`,image);
    }
  }
  return direct;
}

function attachOrderImages(rows = [], platform, externalField, catalog = new Map()) {
  return (rows||[]).map(row=>{
    const raw=row.raw_data||{};
    const aliases=[row[externalField],row.product_id,row.original_product_id,row.seller_product_id,row.vendor_item_id,row.external_product_no,
      raw.productId,raw.originalProductId,raw.sellerProductId,raw.vendorItemId,raw.sellerProductItemId,
      raw.channelProductNo,raw.productNo,raw.originProductNo,raw.groupProductNo]
      .map(text).filter(Boolean);
    const direct=aliases.map(alias=>catalog.get(`${platform}:${alias}`)).find(Boolean);
    const named=[row.product_name,raw.productName,raw.name]
      .flatMap(productNameKeys).map(key=>catalog.get(`NAME:${platform}:${key}`)).find(Boolean);
    return {...row,image_url:productImageFromRaw(raw)||direct||named||''};
  });
}

function isActiveClaimStatus(value) {
  const status = upper(value);
  if (!status) return true;
  return !/(?:COMPLETED?|COMPLETE|CLOSED|DONE|FINISHED|REJECTED|WITHDRAWN|CANCELLED|CANCELED)$/.test(status);
}

function cafe24Status(order, itemRows = []) {
  const raw = order.raw_data || {};
  const itemStatuses=itemRows.map(item=>upper(firstValue(item.status,item.raw_data?.order_status,item.raw_data?.status))).filter(Boolean);
  if(itemStatuses.length){
    const rank=status=>({PAID:1,PREPARING:2,READY_TO_SHIP:3,SHIPPING:4,DELIVERED:5}[CAFE24_STAGE[status]] || 90);
    return [...itemStatuses].sort((a,b)=>rank(a)-rank(b))[0];
  }
  return upper(firstValue(order.payment_status, raw.order_status, raw.payment_status, raw.shipping_status, raw.status));
}

function coupangStatus(order) { return upper(firstValue(order.status, order.raw_data?.status, order.raw_data?.shipmentStatus)); }

function isCancelledStatus(value) {
  return ['CANCELLED','CANCELED','CANCELED_BY_NOPAYMENT','CANCEL_COMPLETE','CANCEL_COMPLETED'].includes(upper(value));
}

function stageFor(platform, status) {
  const value = upper(status);
  if (platform === 'CAFE24') return CAFE24_STAGE[value] || (value.startsWith('C') ? 'PAID' : 'PAID');
  if (platform === 'COUPANG') return COUPANG_STAGE[value] || 'PAID';
  if (platform === 'NAVER') return NAVER_STAGE[value] || 'PAID';
  return COUPANG_STAGE[value] || CAFE24_STAGE[value] || 'PAID';
}

function itemSummary(items) {
  if (!items.length) return { productName:'상품 정보 수집 대기', productNames:[], quantity:0, items:[] };
  const normalized = items.map(item => ({
    externalItemId:text(item.external_item_id || item.order_item_code),
    vendorItemId:text(item.vendor_item_id),
    name:text(item.product_name || item.name || item.raw_data?.product_name) || '상품명 확인 필요',
    option:text(item.option_name || item.raw_data?.option_value || item.raw_data?.variant_name),
    imageUrl:safeProductImage(item.image_url || item.imageUrl || productImageFromRaw(item.raw_data||{})),
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
  return orders.flatMap(order => {
    const externalOrderId = text(order.order_id);
    const itemRows=byOrder.get(externalOrderId) || [];
    const status = cafe24Status(order,itemRows);
    const products = itemSummary(itemRows);
    const raw = order.raw_data || {};
    // Cafe24 can mirror open-market orders into its order API. Those rows are
    // not Cafe24 storefront orders and may keep an obsolete marketplace status
    // (for example a Coupang order left at N10 after market processing failed).
    // Each marketplace is collected from its own authoritative API instead.
    const marketId=upper(firstValue(raw.market_id,raw.order_place_id));
    if(marketId && !['SELF','MOBILE','CAFE24'].includes(marketId))return [];
    // Cafe24 sends the strings "T" and "F". Boolean("F") is true in JS, so
    // treating the field as a regular boolean marked every historical order as
    // a cancellation. Completed cancellations stay in history but are not an
    // outstanding shipping task.
    const itemStatuses=itemRows.map(item=>upper(item.raw_data?.order_status || item.status)).filter(Boolean);
    const completedItemCancellation=itemStatuses.length>0&&itemStatuses.every(value=>/^C.*(?:40|COMPLETE|COMPLETED)$/.test(value));
    const cancellationCompleted = truthyFlag(raw.canceled) || Boolean(text(raw.cancel_date)) || completedItemCancellation;
    const cancellationRequested = !cancellationCompleted && (
      truthyFlag(raw.cancel_request) || truthyFlag(raw.return_request) || truthyFlag(raw.exchange_request)
      || (/^(?:C|R|E|U)/.test(status) && !/(?:40|COMPLETE|COMPLETED)$/.test(status))
    );
    const completedNonCancellationClaim=itemStatuses.length>0&&itemStatuses.every(value=>/^(?:R|E|U).*(?:40|COMPLETE|COMPLETED)$/.test(value));
    if(completedNonCancellationClaim)return [];
    // Older rows were saved before Cafe24's `payment_amount` field was mapped,
    // so the numeric columns contain 0 even though raw_data has the real paid
    // amount. Prefer the first positive value and only fall back to zero.
    const amount=[order.paid_amount,order.order_price,raw.actual_payment_amount,raw.payment_amount,raw.actual_order_amount?.payment_amount,raw.actual_order_amount?.order_price]
      .map(number).find(value=>value>0) || 0;
    const invoiceNumber=text(firstValue(raw.tracking_no,raw.tracking_number,raw.invoice_number,...itemRows.map(item=>firstValue(item.raw_data?.tracking_no,item.raw_data?.tracking_number,item.raw_data?.invoice_number))));
    const deliveryCompanyCode=text(firstValue(raw.shipping_company_code,raw.delivery_company_code,...itemRows.map(item=>firstValue(item.raw_data?.shipping_company_code,item.raw_data?.delivery_company_code))));
    const stage=cancellationCompleted?'CANCELLED':stageFor('CAFE24', status);
    return [shippingWorkbench.enrichOrder({
      hubOrderId:hubOrderId('CAFE24', externalOrderId), platform:'CAFE24', channelLabel:'Cafe24',
      externalOrderId, shipmentId:text(firstValue(...itemRows.map(item=>item.raw_data?.shipping_code),raw.shipping_code,raw.shipping_id)), orderedAt:firstValue(order.order_date, raw.order_date, raw.created_date),
      status, stage, amount, invoiceNumber, deliveryCompanyCode,
      ...products, cancelled:cancellationCompleted, cancellationRequested, actionRequired:!cancellationCompleted&&(cancellationRequested || ['PAID','PREPARING','READY_TO_SHIP'].includes(stage)),
      fulfillment:'SELLER', source:'cafe24_orders'
    }, raw)];
  });
}

function isCoupangTerminalOrderDetail(row = {}) {
  return upper(row.operation_type)==='ORDER_DETAIL'
    && ['CANCELLED','FAILED'].includes(upper(row.status))
    && /order has been cance(?:lled|led) or returned/i.test(text(row.error_message));
}

function normalizeCoupangOrders(orders = [], items = [], returns = [], rgOrders = [], rgItems = [], orderDetailTerminals = []) {
  const byShipment = groupBy(items, 'shipment_box_id');
  const returnIds = new Set((returns || []).filter(item => isActiveClaimStatus(item.status)).map(item => text(item.order_id)).filter(Boolean));
  const rgOrderIds = new Set((rgOrders || []).map(item => text(item.order_id)));
  const terminalShipmentIds = new Set((orderDetailTerminals || [])
    .filter(isCoupangTerminalOrderDetail)
    .map(item=>text(item.target_id))
    .filter(Boolean));
  const seller = orders.filter(order => !rgOrderIds.has(text(order.order_id))).map(order => {
    const externalOrderId = text(order.order_id);
    const status = coupangStatus(order);
    // Coupang's order list can keep the last ACCEPT row after a cancellation.
    // The fixed-IP detail API is authoritative in that case and returns a
    // terminal 400. Keep that durable evidence in history, but never reopen it
    // as payment/packing work on a later list refresh.
    const cancelled=isCancelledStatus(status)||terminalShipmentIds.has(text(order.shipment_box_id));
    const stage = cancelled?'CANCELLED':stageFor('COUPANG', status);
    const rows = byShipment.get(text(order.shipment_box_id)) || [];
    const products = itemSummary(rows);
    const cancellationRequested = !cancelled&&(returnIds.has(externalOrderId) || status === 'RELEASE_STOP_UNCHECKED');
    return shippingWorkbench.enrichOrder({
      hubOrderId:hubOrderId('COUPANG', externalOrderId), platform:'COUPANG', channelLabel:'쿠팡',
      externalOrderId, shipmentId:text(order.shipment_box_id), orderedAt:firstValue(order.ordered_at, order.paid_at),
      status, stage, amount:number(order.gross_amount), invoiceNumber:text(firstValue(order.raw_data?.invoiceNumber,order.raw_data?.invoice_number)), deliveryCompanyCode:text(firstValue(order.raw_data?.deliveryCompanyCode,order.raw_data?.delivery_company_code)), ...products, cancelled, cancellationRequested,
      actionRequired:!cancelled&&(cancellationRequested || ['PAID','PREPARING','READY_TO_SHIP'].includes(stage)), fulfillment:'SELLER', source:'coupang_orders'
    }, order.raw_data || {});
  });
  // Rocket Growth orders continue to be collected into coupang_rg_* tables,
  // but Coupang fulfills them. They must never enter the seller's manual
  // payment/packing/shipping stages.
  return seller;
}

function normalizeNaverOrders(orders = [], items = []) {
  const byOrder = groupBy(items, 'order_id');
  return orders.flatMap(order => {
    const externalOrderId = text(order.order_id || order.product_order_id);
    const status = upper(order.status || order.product_order_status);
    const itemRows = byOrder.get(externalOrderId) || [order];
    const itemStatuses = itemRows.map(item => upper(item.status || item.product_order_status)).filter(Boolean);
    const cancelled=[status,...itemStatuses].some(isCancelledStatus);
    const completedNonCancellationClaim=[status,...itemStatuses].some(value=>['RETURNED','EXCHANGED'].includes(value));
    if(completedNonCancellationClaim)return [];
    const products = itemSummary(itemRows);
    const stage = cancelled?'CANCELLED':stageFor('NAVER', status);
    const cancellationRequested = !cancelled&&/CANCEL|RETURN|EXCHANGE/.test(status);
    const receiver = {
      name:text(order.receiver_name),
      contact:text(order.receiver_phone),
      address:text(order.receiver_address),
      message:text(order.shipping_memo)
    };
    const raw = order.raw_data || order;
    return [shippingWorkbench.enrichOrder({
      hubOrderId:hubOrderId('NAVER', externalOrderId), platform:'NAVER', channelLabel:'네이버', externalOrderId,
      shipmentId:text(order.shipment_id), orderedAt:order.order_date || order.payment_date, status, stage,
      amount:number(order.paid_amount || order.total_payment_amount), invoiceNumber:text(firstValue(order.invoice_no,order.tracking_number,order.raw_data?.invoice_no,order.raw_data?.tracking_number)), deliveryCompanyCode:text(firstValue(order.delivery_method,order.delivery_company,order.raw_data?.delivery_company)), ...products, cancelled, cancellationRequested,
      receiver, actionRequired:!cancelled&&(cancellationRequested || ['PAID','PREPARING','READY_TO_SHIP'].includes(stage)), fulfillment:'SELLER', source:'naver_commerce_orders'
    }, { ...raw, receiver:{ name:receiver.name, address:receiver.address } })];
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
  const coupang = normalizeCoupangOrders(input.coupangOrders, input.coupangOrderItems, input.coupangReturns, input.coupangRgOrders, input.coupangRgOrderItems, input.coupangOrderDetailTerminals);
  const naver = normalizeNaverOrders(input.naverOrders, input.naverOrderItems);
  const asOf=input.asOf?new Date(input.asOf):new Date();
  const trackingStates=input.trackingStates||{};
  const successfulTransfers=input.successfulTransfers instanceof Map?input.successfulTransfers:new Map();
  const successfulIssues=input.successfulIssues instanceof Map?input.successfulIssues:new Map();
  const historyOrders = [...cafe24, ...coupang, ...naver]
    .map(order=>{
      const tracking=trackingStates[order.hubOrderId]||null;
      const transfer=successfulTransfers.get(channelTransfer.successfulTransferKey(order.platform,order));
      const issue=successfulIssues.get(order.hubOrderId);
      const sourceInvoice=text(order.invoiceNumber);
      const transferInvoice=text(transfer?.invoiceNumber);
      const issuedInvoiceNumber=/^\d{13}$/.test(text(issue?.invoiceNumber))?text(issue.invoiceNumber):'';
      const invoiceNumber=/^\d{13}$/.test(sourceInvoice)?sourceInvoice:/^\d{13}$/.test(transferInvoice)?transferInvoice:sourceInvoice;
      const registeredInvoice=/^\d{13}$/.test(invoiceNumber);
      const invoiceStatus=registeredInvoice?'REGISTERED':issuedInvoiceNumber?'ISSUED':'NONE';
      const trackedStage=order.cancelled
        ?'CANCELLED'
        :order.stage==='DELIVERED'||tracking?.statusCode==='DELIVERED'
        ?'DELIVERED'
        :tracking?.statusCode==='IN_TRANSIT'
          ?'SHIPPING'
          :registeredInvoice
            ?'WAITING_FOR_CARRIER'
            :order.stage;
      const eligibility=shippingWorkbench.canShip({...order,stage:trackedStage});
      return {
        ...order,invoiceNumber,issuedInvoiceNumber,invoiceStatus,stage:trackedStage,tracking,
        actionRequired:!order.cancelled&&(order.cancellationRequested||['PAID','PREPARING','READY_TO_SHIP'].includes(trackedStage)),
        shippingEligible:eligibility.ok,shippingBlockedReason:eligibility.reason,
        ...fulfillmentTiming({...order,stage:trackedStage},asOf,input.businessCalendar||{})
      };
    })
    .sort((a, b) => String(b.orderedAt || '').localeCompare(String(a.orderedAt || '')));
  const windowEndDate=koreaDate(asOf);
  const windowStart=new Date(`${windowEndDate}T00:00:00Z`);windowStart.setUTCDate(windowStart.getUTCDate()-29);
  const windowStartDate=windowStart.toISOString().slice(0,10);
  // Active work never disappears because it became old. Completed deliveries
  // and cancelled orders are retained in storage but the UI receives only the
  // latest 30 days of those terminal states.
  const orders=historyOrders.filter(order=>!['DELIVERED','CANCELLED'].includes(order.stage)||(koreaOrderTime(order.orderedAt)?.date||dateOnly(order.orderedAt))>=windowStartDate);
  const channels = [
    connectionState('NAVER', input.channelConnections, Boolean(input.unavailable?.NAVER), naver),
    connectionState('CAFE24', input.channelConnections, Boolean(input.unavailable?.CAFE24), cafe24),
    connectionState('COUPANG', input.channelConnections, Boolean(input.unavailable?.COUPANG), coupang)
  ];
  const stageCounts = Object.fromEntries(STAGES.map(stage => [stage.id, orders.filter(order => order.stage === stage.id).length]));
  return {
    phase:'11-3', stages:STAGES, orders, channels, stageCounts,
    summary:{
      total:orders.length,
      visibleDefaultTotal:orders.filter(order=>!['DELIVERED','CANCELLED'].includes(order.stage)).length,
      historyTotal:historyOrders.length,
      actionRequired:orders.filter(order => order.actionRequired).length,
      cancellations:orders.filter(order => order.cancellationRequested).length,
      cancelledTotal:orders.filter(order=>order.stage==='CANCELLED').length,
      rocketGrowthStored:(input.coupangRgOrders || []).length,
      windowDays:30,
      windowStart:windowStartDate,
      windowEnd:windowEndDate,
      refreshedAt:input.refreshedAt || null,
      amount:orders.filter(order=>order.stage!=='CANCELLED').reduce((sum, order) => sum + order.amount, 0)
    }
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
  const [cafe24Orders, cafe24Items, coupangOrders, coupangItems, coupangReturns, rgOrders, rgItems, naverOrders, naverItems, trackingStates, cafe24Products, channelProducts, coupangProducts, coupangProductItems, shippingReferenceSnapshots, coupangOrderDetailTerminals, successfulTransferRows, successfulIssueRows] = await Promise.all([
    isolatedQuery(db.from('cafe24_orders').select('order_id,order_date,payment_status,order_price,paid_amount,cancel_amount,raw_data').order('order_date',{ascending:false}).limit(10000)),
    isolatedQuery(db.from('cafe24_order_items').select('order_id,external_item_id,external_product_no,product_name,option_name,quantity,unit_price,paid_amount,raw_data').limit(20000)),
    isolatedQuery(db.from('coupang_orders').select('shipment_box_id,order_id,ordered_at,paid_at,status,gross_amount,raw_data').order('ordered_at',{ascending:false}).limit(5000)),
    isolatedQuery(db.from('coupang_order_items').select('shipment_box_id,order_id,vendor_item_id,seller_product_id,product_name,quantity,unit_price,paid_amount,status,raw_data').limit(15000)),
    isolatedQuery(db.from('coupang_returns').select('order_id,status,requested_at').order('requested_at',{ascending:false}).limit(1000)),
    isolatedQuery(db.from('coupang_rg_orders').select('order_id,status,paid_at,total_amount,item_count').order('paid_at',{ascending:false}).limit(5000)),
    isolatedQuery(db.from('coupang_rg_order_items').select('order_id,product_name,quantity,amount').limit(15000)),
    isolatedQuery(db.from('naver_commerce_orders').select('order_id,order_date,payment_date,status,paid_amount,receiver_name,receiver_phone,receiver_address,shipping_memo,shipment_id,invoice_no,delivery_company,raw_data').order('order_date',{ascending:false}).limit(5000)),
    isolatedQuery(db.from('naver_commerce_order_items').select('product_order_id,order_id,product_id,original_product_id,product_name,option_name,quantity,unit_price,paid_amount,status,raw_data').limit(15000)),
    trackingQueue.latestTrackingByOrder(db).catch(error=>({__error:{code:String(error?.code||'TRACKING_QUERY_ERROR'),message:'배송추적 기록을 불러오지 못했습니다.'}})),
    isolatedQuery(db.from('cafe24_products').select('external_product_no,raw_data').limit(5000)),
    isolatedQuery(db.from('channel_products').select('platform,external_product_id,external_product_name,master_product_id,raw_data').limit(10000)),
    isolatedQuery(db.from('coupang_products').select('seller_product_id,product_id,product_name,raw_data').limit(5000)),
    isolatedQuery(db.from('coupang_product_items').select('vendor_item_id,seller_product_id,item_name,raw_data').limit(10000)),
    isolatedQuery(db.from('shipping_reference_snapshots').select('provider,status,reference_year,source_data,source_timestamp,fetched_at').eq('provider','HOLIDAY_CALENDAR').order('fetched_at',{ascending:false}).limit(10)),
    isolatedQuery(db.from('coupang_operation_requests')
      .select('operation_type,target_id,status,error_message,created_at')
      .eq('operation_type','ORDER_DETAIL')
      .eq('target_type','ORDER')
      .in('status',['CANCELLED','FAILED'])
      .order('created_at',{ascending:false})
      .limit(5000)),
    isolatedQuery(db.from('coupang_operation_requests')
      .select('id,operation_type,target_id,status,payload,created_at')
      .in('operation_type',['UPLOAD_INVOICE',channelTransfer.CAFE24_OPERATION])
      .eq('status','SUCCESS')
      .order('created_at',{ascending:false})
      .limit(2000)),
    isolatedQuery(db.from('coupang_operation_requests')
      .select('id,operation_type,target_type,target_id,status,result_json,created_at')
      .eq('operation_type',issueHistory.OPERATION)
      .eq('target_type','HUB_ORDER')
      .eq('status','SUCCESS')
      .order('created_at',{ascending:false})
      .limit(2000))
  ]);
  const coupangCatalogRows=[
    ...coupangProducts.rows.map(product=>({
      platform:'COUPANG', external_product_id:product.seller_product_id, external_product_name:product.product_name,
      raw_data:{ ...(product.raw_data||{}), productId:product.product_id, sellerProductId:product.seller_product_id }
    })),
    ...coupangProductItems.rows.map(item=>({
      platform:'COUPANG', external_product_id:item.vendor_item_id, external_product_name:item.item_name,
      raw_data:{ ...(item.raw_data||{}), vendorItemId:item.vendor_item_id, sellerProductId:item.seller_product_id }
    }))
  ];
  const imageCatalog=buildOrderImageCatalog(cafe24Products.rows,[...channelProducts.rows,...coupangCatalogRows]);
  const calendar=shippingReference.extractCalendar(shippingReferenceSnapshots.rows,Number(koreaDate().slice(0,4)));
  return buildUnifiedOrders({
    cafe24Orders:cafe24Orders.rows, cafe24OrderItems:attachOrderImages(cafe24Items.rows,'CAFE24','external_product_no',imageCatalog),
    coupangOrders:coupangOrders.rows, coupangOrderItems:attachOrderImages(coupangItems.rows,'COUPANG','seller_product_id',imageCatalog), coupangReturns:coupangReturns.rows,
    coupangOrderDetailTerminals:coupangOrderDetailTerminals.rows,
    coupangRgOrders:rgOrders.rows, coupangRgOrderItems:rgItems.rows, channelConnections,
    naverOrders:naverOrders.rows, naverOrderItems:attachOrderImages(naverItems.rows,'NAVER','product_id',imageCatalog),
    successfulTransfers:successfulTransferRows.unavailable?new Map():channelTransfer.successfulTransferIndex(successfulTransferRows.rows),
    successfulIssues:successfulIssueRows.unavailable?new Map():issueHistory.successfulIssueIndex(successfulIssueRows.rows),
    trackingStates:trackingStates.__error?{}:trackingStates,
    businessCalendar:{holidayDates:calendar.holidays.map(item=>item.date),holidayReady:calendar.ready},
    unavailable:{ CAFE24:cafe24Orders.unavailable, COUPANG:coupangOrders.unavailable || rgOrders.unavailable, NAVER:naverOrders.unavailable }
  });
}

module.exports = {
  STAGES, buildUnifiedOrders, filterUnifiedOrders, hubOrderId, loadUnifiedOrders,
  attachOrderImages, buildOrderImageCatalog, fulfillmentTiming, isActiveClaimStatus, isCoupangTerminalOrderDetail,
  normalizeCafe24Orders, normalizeCoupangOrders, normalizeNaverOrders, productImageFromRaw, safeProductImage, stageFor
};
