'use strict';

const PLATFORM_LABELS = { NAVER:'네이버', COUPANG:'쿠팡', CAFE24:'Cafe24' };
const ACTIVE_CASE_STATUS = new Set([
  'RECEIPT','PROGRESS','RETURNS_UNCHECKED','VENDOR_WAREHOUSE_CONFIRM',
  'RELEASE_STOP_UNCHECKED','REQUESTED','ACCEPTED','COLLECTING','RECEIVED'
]);
const COMPLETED_CASE_STATUS = /(?:COMPLETE|COMPLETED|SUCCESS|DONE|CANCELLED|CANCELED|REJECT|WITHDRAW|REFUND)/i;

const REPLY_TEMPLATES = [
  { id:'CHECKING', label:'확인 후 안내', content:'안녕하세요, 하린식품입니다. 문의하신 내용을 확인 중이며 확인되는 대로 빠르게 안내드리겠습니다. 잠시만 기다려 주세요. 감사합니다.' },
  { id:'SHIPPING', label:'배송 확인', content:'안녕하세요, 하린식품입니다. 주문하신 상품의 출고 및 배송 상태를 확인한 뒤 정확한 내용을 안내드리겠습니다. 이용에 불편을 드려 죄송합니다.' },
  { id:'RETURN', label:'반품 접수', content:'안녕하세요, 하린식품입니다. 반품 요청 내용을 확인했습니다. 상품 회수 및 입고 상태를 확인한 뒤 환불 절차를 안내드리겠습니다.' },
  { id:'EXCHANGE', label:'교환 접수', content:'안녕하세요, 하린식품입니다. 교환 요청 내용을 확인했습니다. 회수 및 교환상품 준비 상태를 확인한 뒤 진행 상황을 안내드리겠습니다.' },
  { id:'THANKS', label:'처리 완료', content:'안녕하세요, 하린식품입니다. 요청하신 처리가 완료되었습니다. 이용해 주셔서 감사드리며, 추가 문의가 있으시면 언제든 남겨 주세요.' }
];

function text(value) { return value == null ? '' : String(value); }
function dateMs(value) { const ms = new Date(value || 0).getTime(); return Number.isFinite(ms) ? ms : 0; }
function kstDay(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}

function dueState({ occurredAt, completed = false, now = new Date() }) {
  if (completed) return { code:'COMPLETED', label:'처리완료', priority:4 };
  const ageHours = Math.max(0, (dateMs(now) - dateMs(occurredAt)) / 3600000);
  if (ageHours >= 24) return { code:'OVERDUE', label:'기한 초과', priority:0, ageHours:Math.floor(ageHours) };
  if (kstDay(occurredAt) === kstDay(now)) return { code:'TODAY', label:'오늘 처리', priority:1, ageHours:Math.floor(ageHours) };
  return { code:'WAITING', label:'답변 대기', priority:2, ageHours:Math.floor(ageHours) };
}

function channelCapability(channel, key) {
  const capability = (channel?.capabilities || []).find(item => item.key === key);
  return capability?.read || { status:'SETUP_REQUIRED', label:'연결 필요', reason:'채널 연결 상태를 확인해주세요.' };
}

function buildOrderIndex({ coupangOrders = [], coupangOrderItems = [], cafe24Orders = [], cafe24OrderItems = [] } = {}) {
  const index = new Map();
  for (const order of coupangOrders) index.set(text(order.order_id), {
    orderId:text(order.order_id), platform:'COUPANG', status:order.status || null,
    orderedAt:order.ordered_at || order.paid_at || null,
    shipmentBoxId:text(order.shipment_box_id), amount:Number(order.gross_amount || 0), products:[]
  });
  for (const item of coupangOrderItems) {
    const key=text(item.order_id); if (!key) continue;
    const order=index.get(key) || { orderId:key, platform:'COUPANG', products:[] };
    order.products.push({ name:item.product_name || '상품명 확인 필요', option:item.raw_data?.vendorItemName || null, quantity:Number(item.quantity || 0) });
    index.set(key,order);
  }
  for (const order of cafe24Orders) index.set(text(order.order_id), {
    orderId:text(order.order_id), platform:'CAFE24', status:order.payment_status || null,
    orderedAt:order.order_date || null, amount:Number(order.paid_amount || order.order_price || 0), products:[]
  });
  for (const item of cafe24OrderItems) {
    const key=text(item.order_id); if (!key) continue;
    const order=index.get(key) || { orderId:key, platform:'CAFE24', products:[] };
    order.products.push({ name:item.product_name || '상품명 확인 필요', option:item.option_name || null, quantity:Number(item.quantity || 0) });
    index.set(key,order);
  }
  return index;
}

function auditIndex(audits = []) {
  const result = new Map();
  for (const audit of [...audits].sort((a,b)=>dateMs(b.executed_at || b.requested_at)-dateMs(a.executed_at || a.requested_at))) {
    const key=`${text(audit.target_type).toUpperCase()}:${text(audit.target_id)}`;
    if (!result.has(key)) result.set(key, {
      id:audit.id, status:audit.status, operationType:audit.operation_type,
      requestedAt:audit.requested_at || null, executedAt:audit.executed_at || null,
      errorMessage:audit.error_message || null
    });
  }
  return result;
}

function normalizeInquiry(item, orderIndex, audits, now) {
  const completed=Boolean(item.answered);
  const due=dueState({ occurredAt:item.inquired_at, completed, now });
  return {
    id:`COUPANG:INQUIRY:${item.inquiry_key || item.inquiry_id}`, platform:'COUPANG', kind:'INQUIRY',
    kindLabel:item.inquiry_type === 'CALL_CENTER' ? '고객센터 문의' : '상품 문의',
    sourceId:text(item.inquiry_id), occurredAt:item.inquired_at || null, completed, due,
    status:item.status || (completed ? 'ANSWERED' : 'WAITING'), orderId:text(item.order_id) || null,
    productId:text(item.vendor_item_id || item.seller_product_id || item.product_id) || null,
    title:item.inquiry_type === 'CALL_CENTER' ? '쿠팡 고객센터 이관 문의' : '쿠팡 상품 문의',
    content:item.question_text || '다음 수집부터 문의 원문이 표시됩니다.',
    order:orderIndex.get(text(item.order_id)) || null,
    audit:audits.get(`INQUIRY:${text(item.inquiry_id)}`) || null,
    source:item
  };
}

function caseKind(item, fallback) {
  const value=`${item.cancel_type || ''} ${item.status || ''}`.toUpperCase();
  if (/CANCEL|RELEASE_STOP/.test(value)) return 'CANCEL';
  return fallback;
}

function caseCompleted(item) {
  const status=text(item.status);
  if (!status) return false;
  if (ACTIVE_CASE_STATUS.has(status.toUpperCase())) return false;
  return COMPLETED_CASE_STATUS.test(status);
}

function normalizeCase(item, fallbackKind, orderIndex, audits, now) {
  const isReturn=fallbackKind === 'RETURN';
  const sourceId=text(isReturn ? item.receipt_id : item.exchange_id);
  const kind=caseKind(item,fallbackKind);
  const completed=caseCompleted(item);
  return {
    id:`COUPANG:${kind}:${sourceId}`, platform:'COUPANG', kind,
    kindLabel:{CANCEL:'취소',RETURN:'반품',EXCHANGE:'교환'}[kind], sourceId,
    occurredAt:item.requested_at || null, completed,
    due:dueState({ occurredAt:item.requested_at, completed, now }), status:item.status || 'REQUESTED',
    orderId:text(item.order_id) || null, title:item.reason_text || item.cancel_type || `${kind} 요청`,
    content:item.reason_text || item.cancel_type || '요청 사유 확인 필요',
    order:orderIndex.get(text(item.order_id)) || null,
    audit:audits.get(`${isReturn ? 'RETURN' : 'EXCHANGE'}:${sourceId}`) || null,
    source:item
  };
}

function buildChannelStates(channelConnections = [], rows = []) {
  return ['NAVER','COUPANG','CAFE24'].map(platform => {
    const connection=(channelConnections || []).find(item=>item.platform===platform);
    const inquiries=channelCapability(connection,'inquiries');
    const claims=channelCapability(connection,'claims');
    const permissionReady=inquiries.status === 'READY' || claims.status === 'READY';
    const collectedCount=rows.filter(row=>row.platform===platform).length;
    const liveCollectorConnected=platform === 'COUPANG' || collectedCount > 0;
    if (permissionReady && !liveCollectorConnected) {
      return {
        platform, label:PLATFORM_LABELS[platform], status:'VERIFY_REQUIRED',
        statusLabel:'수집 연결 대기',
        message:'읽기 권한은 확인됐고 실제 문의·클레임 수집 연결을 준비 중입니다.',
        inquiries:inquiries.status, claims:claims.status
      };
    }
    return {
      platform, label:PLATFORM_LABELS[platform], status:permissionReady ? 'READY' : inquiries.status,
      statusLabel:permissionReady ? '수집 가능' : inquiries.label,
      message:permissionReady
        ? `${collectedCount}건 통합 표시`
        : inquiries.reason || claims.reason || '채널 연결이 필요합니다.',
      inquiries:inquiries.status, claims:claims.status
    };
  });
}

function buildUnifiedCustomerService(input = {}) {
  const now=input.now || new Date();
  const orders=buildOrderIndex(input);
  const audits=auditIndex(input.operationAudits || []);
  const rows=[
    ...(input.coupangInquiries || []).map(item=>normalizeInquiry(item,orders,audits,now)),
    ...(input.coupangReturns || []).map(item=>normalizeCase(item,'RETURN',orders,audits,now)),
    ...(input.coupangExchanges || []).map(item=>normalizeCase(item,'EXCHANGE',orders,audits,now))
  ].sort((a,b)=>a.due.priority-b.due.priority || dateMs(b.occurredAt)-dateMs(a.occurredAt));
  const active=rows.filter(row=>!row.completed);
  return {
    phase:'11-4', generatedAt:new Date(now).toISOString(), rows, active,
    channelStates:buildChannelStates(input.channelConnections || [],rows),
    templates:REPLY_TEMPLATES,
    summary:{
      active:active.length,
      unanswered:active.filter(row=>row.kind==='INQUIRY').length,
      today:active.filter(row=>row.due.code==='TODAY').length,
      overdue:active.filter(row=>row.due.code==='OVERDUE').length,
      claims:active.filter(row=>row.kind!=='INQUIRY').length,
      linkedOrders:active.filter(row=>row.order).length,
      completed:rows.length-active.length
    }
  };
}

function filterRows(rows = [], filters = {}) {
  const query=text(filters.query).trim().toLowerCase();
  return rows.filter(row => {
    if (filters.platform && filters.platform !== 'ALL' && row.platform !== filters.platform) return false;
    if (filters.kind && filters.kind !== 'ALL' && row.kind !== filters.kind) return false;
    if (filters.due && filters.due !== 'ALL' && row.due.code !== filters.due) return false;
    if (filters.activeOnly !== false && row.completed) return false;
    if (query && ![row.sourceId,row.orderId,row.title,row.content,row.order?.products?.map(item=>`${item.name} ${item.option || ''}`).join(' ')].join(' ').toLowerCase().includes(query)) return false;
    return true;
  });
}

module.exports = { REPLY_TEMPLATES, dueState, buildOrderIndex, buildUnifiedCustomerService, filterRows, caseCompleted };
