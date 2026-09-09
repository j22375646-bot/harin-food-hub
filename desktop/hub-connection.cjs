'use strict';

const {
  HARIN_ORIGIN,
  LOGIN_URL,
  ORDER_SCOPES,
  ORDER_CHANNELS,
  READONLY_PARTITION,
  buildOrdersPageUrl,
  buildOrdersScopeUrl,
  buildOrdersExportUrl,
  validSearch,
  isAllowedRemoteRequest,
  isTrustedRenderer,
} = require('./connection-policy.cjs');

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const FRESHNESS_INTERVAL_MS = 60_000;
const PAGE_SIZE = 20;
const SNAPSHOT_PATTERN = /^[0-9a-f]{64}$/;
const EMPTY_ORDERS = Object.freeze([]);
const {createShipmentRegistry}=require('./shipment-registry.cjs');
const {createShipmentTransport}=require('./shipment-transport.cjs');
const {createBusinessTransport}=require('./business-transport.cjs');
const {createCredentialTransport,validCredentialInput}=require('./credential-transport.cjs');
const {createFinanceTransport}=require('./finance-transport.cjs');
const {createSettlementTransport,settlementUrl}=require('./settlement-transport.cjs');
const {createInsightsTransport,INSIGHTS_URL}=require('./insights-transport.cjs');
const {createCsTransport,CS_URL}=require('./cs-transport.cjs');
const {createInventoryTransport,INVENTORY_URL}=require('./inventory-transport.cjs');
const {createOrderCollection}=require('./order-collection.cjs');
const {createShippingActionJournal,readShippingHistory}=require('./shipping-action-journal.cjs');
const {projectVisual}=require('./order-visual.cjs');
const {createHash}=require('node:crypto');
const {validDocumentIds,renderSelectedCsv}=require('./selected-documents.cjs');
// Private identity-bound fingerprint, never included in IPC payloads or logs.
const shipmentFingerprints=new WeakMap();
const labelReceivers=new WeakMap();
const deliveryTargets=new WeakMap();
const workflowFingerprints=new WeakMap();
const worklistOrders=new WeakMap();
const REGISTRATION_URL=`${HARIN_ORIGIN}/api/shipping/actions`;
function validRegistrationIds(ids){return Array.isArray(ids)&&ids.length>0&&ids.length<=20&&ids.every(id=>typeof id==='string'&&/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(id))&&new Set(ids).size===ids.length;}
function canRegister(order,partial){
  return partial===false&&['CAFE24','COUPANG'].includes(order?.platform)&&order.fulfillment==='SELLER'
    &&(order.platform==='CAFE24'?/^HR-C24-[A-F0-9]{8}$/:/^HR-CP-[A-F0-9]{8}$/).test(order.hubOrderId)
    &&order.shippingEligible===true&&order.shippingHistoryStatus==='READY'&&order.cancelled===false&&order.cancellationRequested===false
    &&['PAID','PREPARING','READY_TO_SHIP'].includes(order.stage)&&typeof order.externalOrderId==='string'&&order.externalOrderId.length>0
    &&(order.platform!=='COUPANG'||typeof order.shipmentId==='string'&&order.shipmentId.length>0)
    &&order.invoice?.status==='ISSUED'&&typeof order.invoice.number==='string'&&/^\d{13}$/.test(order.invoice.number);
}

const STATUS_MESSAGES = Object.freeze({
  READY: '저장된 주문을 조회했습니다.',
  PARTIAL: '일부 채널 자료를 확인하지 못했습니다. 표시된 저장 주문만 확인하세요.',
  LOGIN_REQUIRED: '하린식품 로그인이 필요합니다.',
  FORBIDDEN: '이 계정으로 주문을 조회할 권한이 없습니다.',
  UNAVAILABLE: '주문 조회를 완료하지 못했습니다. 잠시 후 다시 확인하세요.',
  DISCONNECTED: '하린식품 연결을 해제했습니다.',
  LOGIN_OPEN: '하린식품 로그인 창에서 로그인을 완료하세요.',
  SNAPSHOT_CHANGED: '주문 목록이 변경되었습니다. 첫 페이지를 다시 조회하세요.',
  SESSION_CLEAR_FAILED: '연결 정보를 안전하게 지우지 못했습니다. 앱을 다시 시작하세요.',
});

function safeEmpty(status, message = STATUS_MESSAGES[status]) {
  return Object.freeze({
    status,
    orders: EMPTY_ORDERS,
    total: null,
    offset: null,
    hasPrevious: null,
    hasMore: null,
    checkedAt: null,
    partial: false,
    message,
  });
}

function safeString(value) {
  return typeof value === 'string' ? value.slice(0, 500) : '';
}

function safeFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function projectOrderDetails(order) {
  const invoice = order?.invoice;
  const delivery = order?.listDeliveryBadge;
  return Object.freeze({
    externalOrderId: safeString(order?.externalOrderId),
    receiver: Object.freeze(Object.fromEntries(['name','contact','postCode','address','addressDetail','message'].map(key=>[key,safeString(order?.receiver?.[key])]))),
    items: Object.freeze((Array.isArray(order?.items) ? order.items.slice(0, 8) : []).map(item => Object.freeze({
      name: safeString(item?.name),
      option: safeString(item?.option),
      quantity: Number.isSafeInteger(item?.quantity) && item.quantity > 0 ? item.quantity : null,
    }))),
    invoice: ['REGISTERED', 'ISSUED'].includes(invoice?.status) && typeof invoice?.number === 'string' && /^\d{13}$/.test(invoice.number)
      ? Object.freeze({ status: invoice.status, number: invoice.number }) : null,
    delivery: ['RESERVED', 'IN_TRANSIT', 'DELIVERED', 'CHECK_REQUIRED'].includes(delivery?.status) && ['EPOST', 'CHANNEL'].includes(delivery?.source)
      ? Object.freeze({ status: delivery.status, source: delivery.source }) : null,
    cancelled: typeof order?.cancelled === 'boolean' ? order.cancelled : null,
    cancellationRequested: typeof order?.cancellationRequested === 'boolean' ? order.cancellationRequested : null,
  });
}

// A stored-data review aid only. This result is never accepted as a write permit.
function projectPreflight(order, partial) {
  const codes = [];
  const route = order?.fulfillment === 'ROCKET_GROWTH' ? 'COUPANG_ROCKET' : order?.platform === 'NAVER' ? 'NAVER'
    : ['CAFE24', 'COUPANG'].includes(order?.platform) ? 'HUB' : 'UNKNOWN';
  if (order?.cancelled === true || order?.stage === 'CANCELLED') codes.push('CANCELLED');
  if (order?.cancellationRequested === true) codes.push('CANCEL_REQUEST');
  if (['SHIPPING', 'DELIVERED', 'WAITING_FOR_CARRIER'].includes(order?.stage)
    || ['IN_TRANSIT', 'DELIVERED'].includes(order?.listDeliveryBadge?.status)) codes.push('SHIPPED');
  if ([order?.invoiceNumber, order?.issuedInvoiceNumber].some(value => value != null && value !== '') || order?.invoice != null) codes.push('INVOICE_EXISTS');
  const blocked = codes.length > 0;
  if (route === 'NAVER') codes.push('NAVER_ROUTE');
  if (route === 'COUPANG_ROCKET') codes.push('ROCKET_ROUTE');
  if (route === 'UNKNOWN' || !['SELLER', 'ROCKET_GROWTH'].includes(order?.fulfillment)) codes.push('ROUTE_UNKNOWN');
  if (!['PAID','PREPARING','READY_TO_SHIP'].includes(order?.stage) && !codes.includes('SHIPPED') && !codes.includes('CANCELLED')) codes.push('STAGE_UNKNOWN');
  if (typeof order?.cancelled !== 'boolean' || typeof order?.cancellationRequested !== 'boolean') codes.push('CANCEL_UNKNOWN');
  if (typeof order?.invoiceNumber !== 'string' || typeof order?.issuedInvoiceNumber !== 'string') codes.push('INVOICE_UNKNOWN');
  const hubIdPattern = order?.platform === 'CAFE24' ? /^HR-C24-[A-F0-9]{8}$/ : /^HR-CP-[A-F0-9]{8}$/;
  if (!safeString(order?.hubOrderId).trim() || !safeString(order?.externalOrderId).trim()
    || (route === 'HUB' && !hubIdPattern.test(order?.hubOrderId))) codes.push('ORDER_ID');
  if (route === 'HUB' && order?.shippingHistoryStatus !== 'READY') codes.push('HISTORY_UNAVAILABLE');
  if (order?.shippingEligible !== true || order?.selectionEligible !== true) codes.push('SERVER_CHECK');
  const receiver = order?.receiver;
  const contact = typeof receiver?.contact === 'string' ? receiver.contact.replace(/[\s-]/g, '') : '';
  if (!safeString(receiver?.name).trim() || !safeString(receiver?.address).trim()
    || !/^\d{5}$/.test(typeof receiver?.postCode === 'string' ? receiver.postCode : '') || !/^\d{9,12}$/.test(contact)) codes.push('DELIVERY_INFO');
  if (!Number.isSafeInteger(order?.quantity) || order.quantity <= 0) codes.push('QUANTITY');
  if (partial) codes.push('PARTIAL');
  return Object.freeze({ status: blocked ? 'BLOCKED' : ['NAVER','COUPANG_ROCKET'].includes(route) ? 'EXTERNAL' : codes.length ? 'CHECK_REQUIRED' : 'REVIEW_ONLY', route, codes:Object.freeze(codes) });
}

function projectOrdersPayload(payload, checkedAt, options = {}) {
  const requestedOffset = options.requestedOffset ?? 0;
  const expectedSnapshot = options.expectedSnapshot ?? null;
  const scope = options.scope ?? 'ACTIVE';
  if (
    !payload
    || payload.ok !== true
    || !Array.isArray(payload.orders)
    || typeof payload.total !== 'number'
    || !Number.isFinite(payload.total)
    || payload.total < 0
    || !Number.isInteger(payload.total)
    || !Number.isSafeInteger(payload.total)
    || !Number.isSafeInteger(payload.offset)
    || payload.offset < 0
    || payload.offset % PAGE_SIZE !== 0
    || payload.offset !== requestedOffset
    || payload.orders.length > PAGE_SIZE
    || payload.total < payload.offset + payload.orders.length
    || (payload.orders.length === 0 && (payload.offset !== 0 || payload.total !== 0))
    || typeof payload.snapshot !== 'string'
    || !SNAPSHOT_PATTERN.test(payload.snapshot)
    || (expectedSnapshot !== null && payload.snapshot !== expectedSnapshot)
    || payload.nextOffset !== (payload.offset + PAGE_SIZE < payload.total ? payload.offset + PAGE_SIZE : null)
    || typeof payload.partial !== 'boolean'
    || typeof checkedAt !== 'string'
    || !ORDER_SCOPES.includes(scope)
    || (options.requireSearchContract&&(payload.searchContractVersion !== 1||!validSearch(payload.appliedSearch)||['query','start','end'].some(key=>payload.appliedSearch[key]!==options.expectedSearch?.[key])))
  ) {
    throw new Error('Invalid orders payload');
  }

  const orders = Object.freeze(payload.orders.map((order) => {
    const projected=Object.freeze({
    hubOrderId: safeString(order?.hubOrderId),
    platform: safeString(order?.platform),
    productName: safeString(order?.productName),
    stage: safeString(order?.stage),
    quantity: safeFiniteNumber(order?.quantity),
    amount: safeFiniteNumber(order?.amount),
    orderedAt: order?.orderedAt === null ? null : safeString(order?.orderedAt),
    details: projectOrderDetails(order),
    preflight: projectPreflight(order, payload.partial),
    registrationEligible: canRegister(order,payload.partial),
    issueAndRegisterEligible: canRegister(order,payload.partial)||(projectPreflight(order,payload.partial).status==='REVIEW_ONLY'&&order?.fulfillment==='SELLER'&&['CAFE24','COUPANG'].includes(order?.platform)&&(order.platform!=='COUPANG'||typeof order.shipmentId==='string'&&order.shipmentId.length>0)),
    ...(projectVisual(order)?{visual:projectVisual(order)}:{}),
    });
    const inputs={};
    for(const key of ['hubOrderId','platform','fulfillment','externalOrderId','shipmentId','productName','quantity','amount','items','packagingInstructions','gifts','receiver','invoiceNumber','issuedInvoiceNumber','invoice','stage','cancelled','cancellationRequested'])inputs[key]=order?.[key]??null;
    shipmentFingerprints.set(projected,createHash('sha256').update(JSON.stringify(inputs)).digest('hex'));
    worklistOrders.set(projected,{hubOrderId:projected.hubOrderId,platform:projected.platform,externalOrderId:safeString(order?.externalOrderId),productName:projected.productName,stage:projected.stage,amount:projected.amount,items:order?.items,packagingInstructions:order?.packagingInstructions,gifts:order?.gifts,invoice:projected.details.invoice});
    const stable={};for(const key of ['hubOrderId','platform','fulfillment','externalOrderId','shipmentId','productName','quantity','items','receiver'])stable[key]=order?.[key]??null;
    workflowFingerprints.set(projected,createHash('sha256').update(JSON.stringify(stable)).digest('hex'));
    labelReceivers.set(projected,Object.freeze({...order?.receiver}));
    if(order?.platform==='COUPANG'&&order.fulfillment==='SELLER'&&typeof order.shipmentId==='string'&&/^\d{1,30}$/.test(order.shipmentId))deliveryTargets.set(projected,order.shipmentId);
    return projected;
  }));
  const partial = payload.partial;

  return Object.freeze({
    status: partial ? 'PARTIAL' : 'READY',
    orders,
    total: payload.total,
    offset: payload.offset,
    hasPrevious: payload.offset > 0,
    hasMore: payload.nextOffset !== null,
    checkedAt,
    partial,
    message: STATUS_MESSAGES[partial ? 'PARTIAL' : 'READY'],
    scope,
    ...(validSearch(payload.appliedSearch)?{search:Object.freeze({query:payload.appliedSearch.query,start:payload.appliedSearch.start,end:payload.appliedSearch.end})}:{}),
  });
}

async function readBoundedJson(response, abortController) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    abortController.abort();
    throw new Error('Response exceeds limit');
  }

  if (!response.body?.getReader) {
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_RESPONSE_BYTES) throw new Error('Response exceeds limit');
    return JSON.parse(new TextDecoder().decode(body));
  }

  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        abortController.abort();
        await reader.cancel().catch(() => {});
        throw new Error('Response exceeds limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
async function readBoundedBytes(response,abortController,limit){
  const declared=Number(response.headers?.get?.('content-length'));if(Number.isFinite(declared)&&declared>limit){abortController.abort();throw Error('Response exceeds limit');}
  const reader=response.body?.getReader?.();if(!reader)throw Error('Body');const chunks=[];let size=0;
  const stopped=new Promise((_,reject)=>abortController.signal.addEventListener('abort',()=>{void reader.cancel().catch(()=>{});reject(Error('Stopped'));},{once:true}));
  try{while(true){const {done,value}=await Promise.race([reader.read(),stopped]);if(done)break;size+=value.byteLength;if(size>limit){abortController.abort();await reader.cancel().catch(()=>{});throw Error('Response exceeds limit');}chunks.push(value);}}finally{reader.releaseLock?.();}
  const bytes=Buffer.alloc(size);let offset=0;for(const chunk of chunks){Buffer.from(chunk).copy(bytes,offset);offset+=chunk.byteLength;}return bytes;
}
function validXlsxPackage(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)return false;
  let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break;}if(eocd<0)return false;
  const count=bytes.readUInt16LE(eocd+10),offset=bytes.readUInt32LE(eocd+16),names=new Set();let cursor=offset;
  for(let i=0;i<count;i++){if(cursor+46>bytes.length||bytes.readUInt32LE(cursor)!==0x02014b50)return false;const nameLength=bytes.readUInt16LE(cursor+28),extraLength=bytes.readUInt16LE(cursor+30),commentLength=bytes.readUInt16LE(cursor+32);if(cursor+46+nameLength>bytes.length)return false;names.add(bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8'));cursor+=46+nameLength+extraLength+commentLength;}
  return names.has('[Content_Types].xml')&&names.has('xl/workbook.xml');
}

function createHubConnection({
  BrowserWindow,
  session,
  getMainWindow,
  now = () => new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  markCleanupPending = () => {},
  finishCleanup = () => {},
  initialCleanupPending = false,
  showShipmentReview = null,
  shipmentDirectory = null,
  labelPreview = null,
  selectedDocuments = null,
  worklistPreview = null,
  saveOrderExport = null,
  automaticPollDelayMs = 1000,
  automaticTimeoutMs = 60000,
}) {
  if (!BrowserWindow || !session || typeof getMainWindow !== 'function') {
    throw new TypeError('Hub connection dependencies are required');
  }
  if(!Number.isSafeInteger(automaticPollDelayMs)||automaticPollDelayMs<0||automaticPollDelayMs>2000||!Number.isSafeInteger(automaticTimeoutMs)||automaticTimeoutMs<1||automaticTimeoutMs>60000)throw new TypeError('Invalid automatic workflow timing');

  let remoteSession = null;
  let policyInstalled = false;
  let loginWindow = null;
  let loginPromise = null;
  let activeRead = null;
  let activeAbortController = null;
  let disconnecting = null;
  let cleanupFailed = initialCleanupPending;
  let generation = 0;
  let credentialPermit=null;
  function invalidateGeneration(){generation+=1;credentialTransport.cancel();credentialPermit=null;}
  const credentialTransport=createCredentialTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options),authorize:options=>listBusinesses(options),permit:value=>{credentialPermit=value;},blocked:()=>Boolean(disconnecting||cleanupFailed||isLoginWindowActive()),timeoutMs:Math.min(timeoutMs*2,30000)});
  const readCredentialMetadata=value=>credentialTransport.read(value),saveServerCredential=value=>credentialTransport.save(value);
  let pageCursor = null;
  let currentScope = 'ACTIVE';
  let currentChannel = 'ALL';
  let currentFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});
  let exportPermit=null,exportWork=null;
  let loadedOrders=EMPTY_ORDERS;
  let freshnessRead=null;
  let freshnessLastAt=-Infinity;
  let freshnessLastIdentity=null;
  let freshnessLastResult=null;
  const registrationAttempts=new Set();
  let registrationController=null;
  let registrationRequestActive=false;
  let automaticController=null;
  const automaticPermits=new Set();
  const deliveryPermits=new Set();
  let serverHistoryRequestActive=false;
  let trackingController=null;
  let trackingRequestMethod=null;
  let automaticTrackingRequestActive=false;
  let collectionPermit=null;
  const collection=createOrderCollection({authorize:verifyShipmentSession,fetch:(url,options)=>getRemoteSession().fetch(url,options),readJson:readBoundedJson,
    permit:(url,method)=>{collectionPermit=method?{url,method}:null;},timeoutMs:Math.min(timeoutMs*3,45000),
    blocked:()=>Boolean(disconnecting||cleanupFailed||isLoginWindowActive()||registrationController||automaticController||reviewingShipment),
  });
  let collectionWorkActive=false;
  async function runCollection(check){if(collectionWorkActive)return {status:'BUSY'};collectionWorkActive=true;try{return await collection[check?'check':'collect']();}finally{collectionWorkActive=false;}}
  const collectOrders=()=>runCollection(false),checkOrderCollection=()=>runCollection(true);
  async function enqueueRegisteredTracking(row,approved,controller,alive){
    const id=row?.hubOrderId;
    if(!alive()||controller.signal.aborted||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(id||'')
      ||row.platform!==(id.startsWith('HR-C24-')?'CAFE24':'COUPANG')
      ||row.preflight.route!=='HUB'||row.preflight.codes.some(code=>['PARTIAL','ORDER_ID','ROUTE_UNKNOWN'].includes(code))
      ||row.details.cancelled!==false||row.details.cancellationRequested!==false||row.stage==='CANCELLED'
      ||row.details.invoice?.status!=='REGISTERED'||row.details.invoice.number!==approved.details.invoice?.number
      ||workflowFingerprints.get(row)!==workflowFingerprints.get(approved))return 'CHECK_REQUIRED';
    const local=new AbortController(),stop=()=>local.abort();let timer;
    controller.signal.addEventListener('abort',stop,{once:true});
    automaticTrackingRequestActive=true;
    try{
      const stopped=new Promise(resolve=>{local.signal.addEventListener('abort',()=>resolve('CHECK_REQUIRED'),{once:true});timer=setTimeout(stop,timeoutMs);});
      return await Promise.race([(async()=>{
        const response=await getRemoteSession().fetch(`${HARIN_ORIGIN}/api/shipping/tracking`,{method:'POST',credentials:'include',cache:'no-store',redirect:'error',signal:local.signal,headers:{'Content-Type':'application/json',Origin:HARIN_ORIGIN},body:JSON.stringify({orderIds:[id],mode:'automatic'})});
        if(!alive()||local.signal.aborted||![200,202].includes(response.status))return 'CHECK_REQUIRED';
        const payload=await readBoundedJson(response,local),queued=payload?.queued?.[0];
        return alive()&&!local.signal.aborted&&payload?.ok===true&&Array.isArray(payload.queued)&&payload.queued.length===1
          &&queued?.trackingNo===row.details.invoice.number&&Array.isArray(queued.hubOrderIds)&&queued.hubOrderIds.includes(id)
          &&['PENDING','RUNNING','SUCCESS'].includes(queued.status)?'PENDING':'CHECK_REQUIRED';
      })(),stopped]);
    }catch{return 'CHECK_REQUIRED';}
    finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);local.abort();automaticTrackingRequestActive=false;}
  }
  function trackingRow(id){
    if(typeof id!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(id)||loadedOrders.length>20)return null;
    const rows=loadedOrders.filter(row=>row.hubOrderId===id);
    const row=rows[0];
    return rows.length===1&&row.preflight.route==='HUB'&&!row.preflight.codes.includes('ROUTE_UNKNOWN')&&!row.preflight.codes.includes('ORDER_ID')
      &&row.platform===(id.startsWith('HR-C24-')?'CAFE24':'COUPANG')
      &&row.details.cancelled===false&&row.details.cancellationRequested===false&&row.stage!=='CANCELLED'
      &&row.details.invoice?.status==='REGISTERED'?row:null;
  }
  const trackingUnknown=()=>({status:'READY',state:{status:'CHECK_REQUIRED',checkedAt:null}});
  function readTracking(id){return performTracking(id,'GET');}
  async function refreshTracking(id){
    const result=await performTracking(id,'POST');
    return result.status==='PENDING'?result:{status:'CHECK_REQUIRED'};
  }
  async function performTracking(id,method){
    const initial=trackingRow(id);
    if(!initial||trackingController||activeRead||registrationController||automaticController||findingOrder||disconnecting||cleanupFailed||isLoginWindowActive())return trackingUnknown();
    const expected=generation,controller=new AbortController();let timer;
    trackingController=controller;businessReads.add(controller);
    const alive=()=>expected===generation&&!controller.signal.aborted&&!disconnecting&&!cleanupFailed&&!isLoginWindowActive();
    try{
      const operation=(async()=>{
        const auth=await recheckPage();
        const row=trackingRow(id);
        if(!alive()||auth.status!=='READY'||!row||row.details.invoice.number!==initial.details.invoice.number||workflowFingerprints.get(row)!==workflowFingerprints.get(initial))return trackingUnknown();
        trackingRequestMethod=method;
        const response=await getRemoteSession().fetch(`${HARIN_ORIGIN}/api/shipping/tracking`,{method,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,...(method==='POST'?{headers:{'Content-Type':'application/json',Origin:HARIN_ORIGIN},body:JSON.stringify({orderIds:[id],mode:'manual'})}:{})});
        if(!alive()||!loadedOrders.includes(row)||![200,...(method==='POST'?[202]:[])].includes(response.status))return trackingUnknown();
        const payload=await readBoundedJson(response,controller);
        if(method==='POST'){
          if(!alive()||!loadedOrders.includes(row)||payload?.ok!==true||!Array.isArray(payload.queued)||payload.queued.length!==1)return trackingUnknown();
          const queued=payload.queued[0];
          return queued?.trackingNo===row.details.invoice.number&&Array.isArray(queued.hubOrderIds)&&queued.hubOrderIds.includes(id)&&['PENDING','RUNNING','SUCCESS'].includes(queued.status)?{status:'PENDING'}:trackingUnknown();
        }
        if(!alive()||!loadedOrders.includes(row)||payload?.ok!==true||!Array.isArray(payload.states)||payload.states.length>1000)return trackingUnknown();
        const matches=payload.states.filter(state=>state?.hubOrderId===id&&state.trackingNo===row.details.invoice.number);
        if(matches.length!==1)return trackingUnknown();
        const state=matches[0];
        if(['QUEUED','PENDING','RUNNING'].includes(state.status))return {status:'READY',state:{status:'PENDING',checkedAt:null}};
        const checkedAt=typeof state.checkedAt==='string'&&/^\d{4}-\d\d-\d\dT/.test(state.checkedAt)&&Number.isFinite(Date.parse(state.checkedAt))?new Date(state.checkedAt).toISOString():null;
        const status={ACCEPTED:'WAITING',NOT_FOUND:'WAITING',WAITING:'WAITING',IN_TRANSIT:'IN_TRANSIT',DELIVERED:'DELIVERED'}[state.statusCode];
        if(state.status!=='SUCCESS'||!checkedAt||!['WAITING','IN_TRANSIT','DELIVERED'].includes(status))return trackingUnknown();
        return {status:'READY',state:{status,checkedAt}};
      })();
      return await Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(trackingUnknown());},timeoutMs);}),new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve(trackingUnknown()),{once:true}))]);
    }catch{return trackingUnknown();}
    finally{clearTimeout(timer);trackingRequestMethod=null;businessReads.delete(controller);if(trackingController===controller)trackingController=null;}
  }
  const deliveryReads=new Map(),deliveryJobs=new WeakMap();
  function readDelivery(id){
    const row=loadedOrders.find(order=>order.hubOrderId===id);
    if(deliveryReads.has(row))return deliveryReads.get(row);
    const work=performReadDelivery(id).finally(()=>deliveryReads.delete(row));
    deliveryReads.set(row,work);return work;
  }
  async function performReadDelivery(id){
    const row=loadedOrders.find(order=>order.hubOrderId===id);
    if(disconnecting||cleanupFailed||!row)return {status:'UNAVAILABLE'};
    if(row.details.receiver.name&&row.details.receiver.address)return {status:'READY',receiver:row.details.receiver};
    const shipmentId=deliveryTargets.get(row);
    const coupang=row.platform==='COUPANG'&&/^HR-CP-[A-F0-9]{8}$/.test(id)&&shipmentId;
    if(!coupang&&(row.platform!=='CAFE24'||!/^HR-C24-[A-F0-9]{8}$/.test(id)||!/^[-A-Za-z0-9_]{1,80}$/.test(row.details.externalOrderId)))return {status:'CHECK_REQUIRED'};
    const expected=generation,controller=new AbortController();businessReads.add(controller);
    const url=`${HARIN_ORIGIN}/api/cafe24/orders/delivery-detail?orderId=${encodeURIComponent(row.details.externalOrderId)}`;
    const permits=new Set();let timer;
    const get=async target=>{
      if(controller.signal.aborted||expected!==generation||!loadedOrders.includes(row))throw Error('Stale delivery read');
      permits.add(target);deliveryPermits.add(target);
      return getRemoteSession().fetch(target,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
    };
    try{
      const operation=(async()=>{
        if(coupang){
          let job=deliveryJobs.get(row);
          if(!job){
            const queued=await get(`${HARIN_ORIGIN}/api/coupang/orders/detail?shipmentBoxId=${shipmentId}`);
            if(![200,202].includes(queued.status))return {status:'CHECK_REQUIRED'};
            const payload=await readBoundedJson(queued,controller);job=payload?.request?.id;
            if(payload?.ok!==true||typeof job!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(job))return {status:'CHECK_REQUIRED'};
            deliveryJobs.set(row,job);
          }
          for(let attempt=0;attempt<10;attempt++){
            const response=await get(`${HARIN_ORIGIN}/api/coupang/operations/${job}`);
            if(response.status===202){await new Promise(resolve=>setTimeout(resolve,1000));continue;}
            if(response.status!==200)return {status:'CHECK_REQUIRED'};
            const payload=await readBoundedJson(response,controller);
            if(payload?.ok!==true||payload.order?.shipmentBoxId!==shipmentId||!payload.order?.receiver)return {status:'CHECK_REQUIRED'};
            const receiver=projectOrderDetails({receiver:{...payload.order.receiver,contact:payload.order.receiver.safeNumber}}).receiver;
            return receiver.name&&receiver.address?{status:'READY',receiver}:{status:'CHECK_REQUIRED'};
          }
          return {status:'PENDING'};
        }
        const response=await get(url);
        if(response.status!==200)return {status:'CHECK_REQUIRED'};
        const payload=await readBoundedJson(response,controller);
        if(payload?.ok!==true||!payload.receiver)return {status:'CHECK_REQUIRED'};
        return {status:'READY',receiver:projectOrderDetails({receiver:payload.receiver}).receiver};
      })();
      const result=await Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({status:'CHECK_REQUIRED'});},timeoutMs);}),new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve({status:'CHECK_REQUIRED'}),{once:true}))]);
      return expected!==generation||!loadedOrders.includes(row)?{status:'DISCONNECTED'}:result;
    }catch{return {status:expected!==generation?'DISCONNECTED':'CHECK_REQUIRED'};}
    finally{clearTimeout(timer);for(const permit of permits)deliveryPermits.delete(permit);businessReads.delete(controller);}
  }
  let reviewingShipment = false;
  let shipmentRegistry=null;
  let shipmentDrain=Promise.resolve();
  const shipmentPermits=new Map();
  const shipmentAuthReads=new Set();
  const businessReads=new Set();
  let activeOverview=null;
  let activeFinance=null,activeFinanceController=null,financePermit=null;
  let activeSettlement=null,settlementController=null,settlementPermit=null,settlementDays=30;
  let activeCs=null,csController=null,csPermit=null;
  let activeInventory=null,inventoryController=null,inventoryPermit=null;
  let activeInsights=null,insightsController=null,insightsPermit=null;
  let activeCalendar=null,calendarPermit=null;
  function readTodayCalendar(){
    if(disconnecting||cleanupFailed||isLoginWindowActive())return Promise.resolve({status:'UNAVAILABLE',date:require('./today-calendar.cjs').calendarDay(now()),entries:[]});
    if(activeCalendar)return activeCalendar;
    const expected=generation,controller=new AbortController();businessReads.add(controller);
    const {calendarDay,projectCalendar}=require('./today-calendar.cjs'),date=calendarDay(now());
    const empty=status=>({status,date,entries:[]});let timer;
    const operation=(async()=>{
      try{return await Promise.race([(async()=>{
        const authResponse=await getRemoteSession().fetch(buildOrdersScopeUrl('ACTIVE'),{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
        const auth=[401,403].includes(authResponse.status)?(authResponse.status===401?'LOGIN_REQUIRED':'FORBIDDEN'):authResponse.status===200?projectOrdersPayload(await readBoundedJson(authResponse,controller),now().toISOString()).status:'UNAVAILABLE';
        if(expected!==generation||controller.signal.aborted)return empty('DISCONNECTED');
        if(!['READY','PARTIAL'].includes(auth))return empty(auth);
        const url=`${HARIN_ORIGIN}/api/calendar/entries?from=${date}&to=${date}`;calendarPermit=url;
        const response=await getRemoteSession().fetch(url,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
        if(expected!==generation||controller.signal.aborted)return empty('DISCONNECTED');
        if(response.status!==200)return empty(response.status===401?'LOGIN_REQUIRED':response.status===403?'FORBIDDEN':'UNAVAILABLE');
        const payload=await readBoundedJson(response,controller);
        return expected===generation&&!controller.signal.aborted?projectCalendar(payload,date):empty('DISCONNECTED');
      })(),new Promise(resolve=>{controller.signal.addEventListener('abort',()=>resolve(empty('UNAVAILABLE')),{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);})]);}
      catch{return empty('UNAVAILABLE');}
      finally{clearTimeout(timer);calendarPermit=null;businessReads.delete(controller);}
    })();
    activeCalendar=operation.finally(()=>{activeCalendar=null;});return activeCalendar;
  }
  let activeMonth=null,monthPermit=null,activeMonthKey=null;
  function readCalendarMonth(month){
    const {monthRange,projectMonth}=require('./today-calendar.cjs'),range=monthRange(month);
    if(!range)return Promise.resolve({status:'UNAVAILABLE',month,entries:[]});
    if(disconnecting||cleanupFailed||isLoginWindowActive())return Promise.resolve({status:'UNAVAILABLE',month,entries:[]});
    if(activeMonth)return month===activeMonthKey?activeMonth:Promise.resolve({status:'UNAVAILABLE',month,entries:[]});
    activeMonthKey=month;
    const expected=generation,controller=new AbortController();businessReads.add(controller);
    const {from,to}=range;
    const empty=status=>({status,month,entries:[]});let timer;
    const operation=(async()=>{
      try{return await Promise.race([(async()=>{
        const authResponse=await getRemoteSession().fetch(buildOrdersScopeUrl('ACTIVE'),{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
        const auth=[401,403].includes(authResponse.status)?(authResponse.status===401?'LOGIN_REQUIRED':'FORBIDDEN'):authResponse.status===200?projectOrdersPayload(await readBoundedJson(authResponse,controller),now().toISOString()).status:'UNAVAILABLE';
        if(expected!==generation||controller.signal.aborted)return empty('DISCONNECTED');
        if(!['READY','PARTIAL'].includes(auth))return empty(auth);
        const url=`${HARIN_ORIGIN}/api/calendar/entries?from=${from}&to=${to}`;monthPermit=url;
        const response=await getRemoteSession().fetch(url,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
        if(expected!==generation||controller.signal.aborted)return empty('DISCONNECTED');
        if(response.status!==200)return empty(response.status===401?'LOGIN_REQUIRED':response.status===403?'FORBIDDEN':'UNAVAILABLE');
        const payload=await readBoundedJson(response,controller);
        return expected===generation&&!controller.signal.aborted?projectMonth(payload,month):empty('DISCONNECTED');
      })(),new Promise(resolve=>{controller.signal.addEventListener('abort',()=>resolve(empty('UNAVAILABLE')),{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);})]);}
      catch{return empty('UNAVAILABLE');}
      finally{clearTimeout(timer);monthPermit=null;businessReads.delete(controller);}
    })();
    activeMonth=operation.finally(()=>{activeMonth=null;});return activeMonth;
  }
  function readOverview(){
    if(disconnecting||cleanupFailed||isLoginWindowActive())return Promise.resolve({status:'DISCONNECTED',scopes:{}});
    if(activeOverview)return activeOverview;
    const expected=generation,controller=new AbortController();businessReads.add(controller);
    let timer,authStatus=null;
    const empty=status=>({status,scopes:{}});
    const readScope=async scope=>{
      try{
        const response=await getRemoteSession().fetch(buildOrdersScopeUrl(scope),{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
        if(controller.signal.aborted||expected!==generation)return [scope,{status:'UNAVAILABLE',total:null}];
        if([401,403].includes(response.status)){authStatus=response.status===401?'LOGIN_REQUIRED':'FORBIDDEN';controller.abort();return [scope,{status:authStatus,total:null}];}
        if(response.status!==200)throw Error('Unavailable');
        const payload=await readBoundedJson(response,controller);
        if(controller.signal.aborted||expected!==generation)throw Error('Cancelled');
        const result=projectOrdersPayload(payload,now().toISOString(),{scope});
        return [scope,{status:result.status,total:result.total,checkedAt:result.checkedAt}];
      }catch{return [scope,{status:'UNAVAILABLE',total:null}];}
    };
    const operation=(async()=>{
      const result=await Promise.race([
        Promise.all(ORDER_SCOPES.map(readScope)).then(rows=>({status:'READY',scopes:Object.fromEntries(rows)})),
        new Promise(resolve=>{timer=setTimeout(()=>{resolve(empty('TIMEOUT'));controller.abort();},timeoutMs);}),
        new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve(empty('CANCELLED')),{once:true})),
      ]);
      if(expected!==generation)return empty('DISCONNECTED');
      if(authStatus){invalidateGeneration();invalidateCursor();activeAbortController?.abort();void stopShipments();return empty(authStatus);}
      return result;
    })();
    let tracked;tracked=operation.finally(()=>{clearTimeout(timer);businessReads.delete(controller);if(activeOverview===tracked)activeOverview=null;});
    activeOverview=tracked;return tracked;
  }
  function readFinance(){
    const empty=status=>Object.freeze({status,month:null,generatedAt:null,metrics:Object.freeze({sales:Object.freeze({value:null,status:'BLOCKED'}),profit:Object.freeze({value:null,status:'BLOCKED'}),balance:Object.freeze({value:null,status:'BLOCKED'})})});
    if(disconnecting||cleanupFailed)return Promise.resolve(empty('DISCONNECTED'));
    if(isLoginWindowActive())return Promise.resolve(empty('LOGIN_REQUIRED'));
    if(activeFinance)return activeFinance;
    const expected=generation,controller=new AbortController();activeFinanceController=controller;financePermit=require('./connection-policy.cjs').FINANCE_URL;
    const read=createFinanceTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options)});
    let tracked;tracked=read({signal:controller.signal}).then(result=>expected===generation?result:empty('CANCELLED')).finally(()=>{financePermit=null;if(activeFinanceController===controller)activeFinanceController=null;if(activeFinance===tracked)activeFinance=null;});
    activeFinance=tracked;return tracked;
  }
  function readCs(){
    const empty=status=>({status,items:[],generatedAt:null,truncated:false});
    if(disconnecting||cleanupFailed)return Promise.resolve(empty('DISCONNECTED'));
    if(isLoginWindowActive())return Promise.resolve(empty('LOGIN_REQUIRED'));
    if(activeCs)return activeCs;
    const expected=generation,controller=new AbortController();csController=controller;csPermit=CS_URL;
    const read=createCsTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options)});
    let tracked;tracked=read({signal:controller.signal}).then(result=>expected===generation?result:empty('CANCELLED')).finally(()=>{if(csController===controller){csController=null;csPermit=null;}if(activeCs===tracked)activeCs=null;});
    activeCs=tracked;return tracked;
  }
  function readInventory(){
    const empty=status=>({status,items:[],generatedAt:null,truncated:false});
    if(disconnecting||cleanupFailed)return Promise.resolve(empty('DISCONNECTED'));
    if(isLoginWindowActive())return Promise.resolve(empty('LOGIN_REQUIRED'));
    if(activeInventory)return activeInventory;
    const expected=generation,controller=new AbortController();inventoryController=controller;inventoryPermit=INVENTORY_URL;
    const read=createInventoryTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options)});
    let tracked;tracked=read({signal:controller.signal}).then(result=>expected===generation?result:empty('CANCELLED')).finally(()=>{if(inventoryController===controller){inventoryController=null;inventoryPermit=null;}if(activeInventory===tracked)activeInventory=null;});
    activeInventory=tracked;return tracked;
  }
  function readInsights(){
    const empty=status=>({status,channel:null,reports:[],caveats:[],generatedAt:null});
    if(disconnecting||cleanupFailed)return Promise.resolve(empty('DISCONNECTED'));
    if(isLoginWindowActive())return Promise.resolve(empty('LOGIN_REQUIRED'));
    if(activeInsights)return activeInsights;
    const expected=generation,controller=new AbortController();insightsController=controller;insightsPermit=INSIGHTS_URL;
    const read=createInsightsTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options)});
    let tracked;tracked=read({signal:controller.signal}).then(result=>expected===generation?result:empty('CANCELLED')).finally(()=>{if(insightsController===controller){insightsController=null;insightsPermit=null;}if(activeInsights===tracked)activeInsights=null;});
    activeInsights=tracked;return tracked;
  }
  function readSettlement(days=30){
    const empty=status=>({status,summary:null,channels:[],schedules:[],period:null,generatedAt:null});
    if(![7,30,90].includes(days))return Promise.resolve(empty('UNAVAILABLE'));
    if(disconnecting||cleanupFailed)return Promise.resolve(empty('DISCONNECTED'));
    if(isLoginWindowActive())return Promise.resolve(empty('LOGIN_REQUIRED'));
    if(activeSettlement&&settlementDays===days)return activeSettlement;
    settlementController?.abort();settlementDays=days;
    const expected=generation,controller=new AbortController();settlementController=controller;settlementPermit=settlementUrl(days);
    const read=createSettlementTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options)});
    let tracked;tracked=read({signal:controller.signal,days}).then(result=>expected===generation&&!controller.signal.aborted?result:empty('CANCELLED')).finally(()=>{if(settlementController===controller){settlementController=null;settlementPermit=null;}if(activeSettlement===tracked)activeSettlement=null;});
    activeSettlement=tracked;return tracked;
  }
  async function listBusinesses({signal}={}){
    const empty=status=>Object.freeze({status,businesses:Object.freeze([])});
    if(disconnecting||cleanupFailed)return empty('DISCONNECTED');
    if(isLoginWindowActive())return empty('LOGIN_REQUIRED');
    const expected=generation,controller=new AbortController();businessReads.add(controller);
    const stop=()=>controller.abort();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)controller.abort();
    try{
      const read=createBusinessTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options)});
      const result=await read({signal:controller.signal});
      return expected===generation?result:empty('DISCONNECTED');
    }finally{signal?.removeEventListener('abort',stop);businessReads.delete(controller);}
  }
  function stopShipments() {
    automaticController?.abort();
    registrationController?.abort();
    for(const controller of businessReads)controller.abort();
    labelPreview?.close();
    worklistPreview?.close();
    for(const controller of shipmentAuthReads)controller.abort();
    const old=shipmentRegistry;shipmentRegistry=null;
    shipmentPermits.clear();
    shipmentDrain=Promise.all([shipmentDrain,old?.suspend()]).then(()=>{});
    return shipmentDrain;
  }
  async function getShipmentRegistry(expectedGeneration) {
    await shipmentDrain;
    if(expectedGeneration!==generation||disconnecting||cleanupFailed||isLoginWindowActive()||!shipmentDirectory)throw Error('Shipment unavailable');
    if(!shipmentRegistry)shipmentRegistry=createShipmentRegistry({directory:shipmentDirectory,businessId:'harin',
      createTransport:hubOrderId=>createShipmentTransport({hubOrderId,fetch:async(url,options)=>{
        if(expectedGeneration!==generation||disconnecting||cleanupFailed||isLoginWindowActive()||options.signal.aborted)throw Error('Shipment disconnected');
        const key=`${options.method} ${url}`;
        shipmentPermits.set(key,(shipmentPermits.get(key)||0)+1);
        try {
          const response=await getRemoteSession().fetch(url,options);
          if([401,403].includes(response.status)){invalidateGeneration();invalidateCursor();void stopShipments();}
          return response;
        } finally {
          const remaining=(shipmentPermits.get(key)||0)-1;
          if(remaining>0)shipmentPermits.set(key,remaining);else shipmentPermits.delete(key);
        }
      }})});
    return shipmentRegistry;
  }

  function isLoginWindowActive() {
    return Boolean(loginWindow && !loginWindow.isDestroyed());
  }

  function getRemoteSession() {
    if (!remoteSession) {
      remoteSession = session.fromPartition(READONLY_PARTITION, { cache: false });
    }
    if (!policyInstalled) {
      remoteSession.setPermissionCheckHandler(() => false);
      remoteSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      remoteSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        callback({
          cancel: !isAllowedRemoteRequest(details, {
            loginWindowActive: isLoginWindowActive(),
            loginWebContentsId: isLoginWindowActive() ? loginWindow.webContents.id : null,
            shipmentRequestActive: shipmentPermits.has(`${details.method} ${details.url}`),
            registrationRequestActive,
            serverHistoryRequestActive,
            calendarPermit,
            monthPermit,
            financePermit,
            settlementPermit,
            insightsPermit,
            csPermit,inventoryPermit,
            trackingRequestMethod,
            automaticTrackingRequestActive,
            collectionPermit,
            credentialPermit,
            exportPermit,
            automaticRequestActive:automaticPermits.has(details.url),
            deliveryRequestActive:deliveryPermits.has(details.url),
            ...labelPreview?.context(),
          }),
        });
      });
      remoteSession.on('will-download', (event) => event.preventDefault());
      policyInstalled = true;
    }
    return remoteSession;
  }

  function invalidateCursor() {
    pageCursor = null;
    loadedOrders=EMPTY_ORDERS;
    freshnessLastIdentity=null;
    freshnessLastResult=null;
  }
  const hasExtendedFilters=()=>currentFilters.delayOnly||currentFilters.giftOnly||currentFilters.query||currentFilters.start||currentFilters.end;
  const ordersScopeUrl=(scope=currentScope,channel=currentChannel)=>hasExtendedFilters()?buildOrdersScopeUrl(scope,channel,currentFilters):buildOrdersScopeUrl(scope,channel);
  const ordersPageUrl=(offset,snapshot,scope=currentScope,channel=currentChannel)=>hasExtendedFilters()?buildOrdersPageUrl(offset,snapshot,scope,channel,currentFilters):buildOrdersPageUrl(offset,snapshot,scope,channel);

  function freshnessIdentity(){
    if(!pageCursor||loadedOrders===EMPTY_ORDERS)return null;
    return JSON.stringify([generation,currentScope,currentChannel,currentFilters,pageCursor.offset,pageCursor.snapshot]);
  }
  function freshnessResult(status){return Object.freeze({status,checkedAt:now().toISOString()});}
  function sameFreshnessPage(candidate){
    if(candidate.total!==pageCursor.total&&pageCursor.total!==undefined)return false;
    if(candidate.offset!==pageCursor.offset||candidate.orders.length!==loadedOrders.length)return false;
    return candidate.orders.every((row,index)=>row.hubOrderId===loadedOrders[index]?.hubOrderId&&shipmentFingerprints.get(row)===shipmentFingerprints.get(loadedOrders[index]));
  }
  function checkOrderFreshness(){
    const identity=freshnessIdentity();
    if(!identity)return Promise.resolve(freshnessResult('SKIPPED'));
    const mainWindow=getMainWindow();
    if(!mainWindow||mainWindow.isDestroyed?.()||mainWindow.isMinimized?.())return Promise.resolve(freshnessResult('SKIPPED'));
    if(activeRead||registrationController||automaticController||reviewingShipment||collectionWorkActive||trackingController||findingOrder||disconnecting||cleanupFailed||isLoginWindowActive()||serverHistoryRequestActive||businessReads.size)return Promise.resolve(freshnessResult('BUSY'));
    if(freshnessRead)return freshnessRead;
    const tick=now().getTime();
    if(tick-freshnessLastAt<FRESHNESS_INTERVAL_MS)return Promise.resolve(identity===freshnessLastIdentity&&freshnessLastResult?freshnessLastResult:freshnessResult('SKIPPED'));
    freshnessLastAt=tick;freshnessLastIdentity=identity;
    const expectedGeneration=generation,cursor=pageCursor,baseline=loadedOrders,controller=new AbortController();let timer,stop;
    const alive=()=>identity===freshnessIdentity()&&expectedGeneration===generation&&pageCursor===cursor&&loadedOrders===baseline&&!controller.signal.aborted;
    const stopped=new Promise(resolve=>{stop=()=>resolve(freshnessResult('UNAVAILABLE'));controller.signal.addEventListener('abort',stop,{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);});
    const operation=(async()=>{
      try{
        const response=await Promise.race([getRemoteSession().fetch(ordersPageUrl(cursor.offset,cursor.snapshot),{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal}),stopped]);
        if(response?.status==='UNAVAILABLE')return response;
        if(!alive()||!response||typeof response.status!=='number')return freshnessResult('SKIPPED');
        if(response.status===409)return freshnessResult('CHANGED');
        if([401,403].includes(response.status))return freshnessResult('AUTH_REQUIRED');
        if(response.status!==200)return freshnessResult('UNAVAILABLE');
        const payload=await Promise.race([readBoundedJson(response,controller),stopped]);
        if(payload?.status==='UNAVAILABLE')return payload;
        if(!alive())return freshnessResult('SKIPPED');
        const candidate=projectOrdersPayload(payload,now().toISOString(),{requestedOffset:cursor.offset,expectedSnapshot:cursor.snapshot,scope:currentScope});
        if(candidate.partial)return freshnessResult('UNAVAILABLE');
        return freshnessResult(sameFreshnessPage(candidate)?'CURRENT':'CHANGED');
      }catch{return freshnessResult(alive()?'UNAVAILABLE':'SKIPPED');}
      finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);controller.abort();}
    })();
    let tracked;tracked=operation.then(result=>{if(identity===freshnessIdentity()){freshnessLastResult=result;}return result;}).finally(()=>{if(freshnessRead===tracked)freshnessRead=null;});
    freshnessRead=tracked;return tracked;
  }

  async function performRead(readGeneration, { url, requestedOffset, expectedSnapshot, scope }) {
    const controller = new AbortController();
    activeAbortController = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // Abort must settle the host read even when an external transport/body ignores it.
    let stop;
    const stopped=new Promise((_,reject)=>{stop=()=>reject(Error('Order read stopped'));controller.signal.addEventListener('abort',stop,{once:true});});
    const bounded=promise=>Promise.race([promise,stopped]);
    try {
      const response = await bounded(getRemoteSession().fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }));
      if(controller.signal.aborted)throw Error('Order read stopped');
      if (readGeneration !== generation) return safeEmpty('DISCONNECTED');
      if (response.status === 401) {
        void stopShipments();
        invalidateCursor();
        return safeEmpty('LOGIN_REQUIRED');
      }
      if (response.status === 403) {
        void stopShipments();
        invalidateCursor();
        return safeEmpty('FORBIDDEN');
      }
      if (response.status === 409) {
        invalidateCursor();
        return safeEmpty('SNAPSHOT_CHANGED');
      }
      if (response.status !== 200) {
        invalidateCursor();
        return safeEmpty('UNAVAILABLE');
      }

      const payload = await bounded(readBoundedJson(response, controller));
      if(controller.signal.aborted)throw Error('Order read stopped');
      if (readGeneration !== generation) return safeEmpty('DISCONNECTED');
      const expectedSearch={query:currentFilters.query,start:currentFilters.start,end:currentFilters.end};
      const result = projectOrdersPayload(payload, now().toISOString(), { requestedOffset, expectedSnapshot, scope,requireSearchContract:/[?&](?:query=[^&]+|start=\d|end=\d)/.test(url),expectedSearch });
      pageCursor = Object.freeze({
        offset: payload.offset,
        nextOffset: payload.nextOffset,
        snapshot: payload.snapshot,
        total: payload.total,
        scope,
      });
      loadedOrders=result.orders;
      freshnessLastIdentity=null;
      freshnessLastResult=null;
      return Object.freeze({...result,channel:currentChannel,filters:Object.freeze({...currentFilters})});
    } catch {
      if (readGeneration === generation) invalidateCursor();
      return readGeneration === generation
        ? safeEmpty('UNAVAILABLE')
        : safeEmpty('DISCONNECTED');
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort',stop);
      if (activeAbortController === controller) activeAbortController = null;
    }
  }

  function blockedReadResult() {
    if (disconnecting || cleanupFailed) {
      return Promise.resolve(safeEmpty('UNAVAILABLE', cleanupFailed
        ? STATUS_MESSAGES.SESSION_CLEAR_FAILED
        : '연결 정보를 지우는 중입니다. 잠시 후 다시 확인하세요.'));
    }
    return null;
  }

  function startRead(request) {
    const blocked = blockedReadResult();
    if (blocked) return blocked;
    if (activeRead) return activeRead;
    const readGeneration = generation;
    let operation;
    operation = performRead(readGeneration, request).finally(() => {
      if (activeRead === operation) activeRead = null;
    });
    activeRead = operation;
    return activeRead;
  }

  function refresh() {
    if (activeRead) return activeRead;
    invalidateCursor();
    return startRead({ url: ordersScopeUrl(), requestedOffset: 0, expectedSnapshot: null, scope: currentScope });
  }

  function nextPage() {
    if (activeRead) return activeRead;
    const cursor = pageCursor;
    if (!cursor || cursor.nextOffset === null) {
      return Promise.resolve(safeEmpty('UNAVAILABLE', '이동할 다음 주문 페이지가 없습니다. 첫 페이지를 다시 조회하세요.'));
    }
    return startRead({
      url: ordersPageUrl(cursor.nextOffset,cursor.snapshot),
      requestedOffset: cursor.nextOffset,
      expectedSnapshot: cursor.snapshot,
      scope: currentScope,
    });
  }

  function previousPage() {
    if (activeRead) return activeRead;
    const cursor = pageCursor;
    if (!cursor || cursor.offset === 0) {
      return Promise.resolve(safeEmpty('UNAVAILABLE', '이동할 이전 주문 페이지가 없습니다. 첫 페이지를 다시 조회하세요.'));
    }
    const previousOffset = cursor.offset - PAGE_SIZE;
    return startRead({
      url: ordersPageUrl(previousOffset,cursor.snapshot),
      requestedOffset: previousOffset,
      expectedSnapshot: cursor.snapshot,
      scope: currentScope,
    });
  }

  function recheckPage() {
    const blocked = blockedReadResult();
    if (blocked) return blocked;
    if (activeRead) return Promise.resolve(safeEmpty('UNAVAILABLE', '조회가 진행 중입니다. 완료 후 다시 확인하세요.'));
    const cursor = pageCursor;
    if (!cursor) return Promise.resolve(safeEmpty('UNAVAILABLE', '목록을 먼저 조회하세요.'));
    return startRead({url:ordersPageUrl(cursor.offset,cursor.snapshot),requestedOffset:cursor.offset,expectedSnapshot:cursor.snapshot,scope:currentScope});
  }

  // Main-process preparation only, not an IPC method or a shipment permit.
  // Uses the existing authenticated read path; raw receiver fields never leave it.
  async function reviewShipment(hubOrderId) {
    if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId))throw new TypeError('Invalid shipment review order');
    const reviewGeneration=generation;
    const result=await recheckPage();
    const refused=status=>Object.freeze({status,order:null,checkedAt:null});
    if(reviewGeneration!==generation)return refused('DISCONNECTED');
    if(result.status!=='READY')return refused(result.status);
    const matches=result.orders.filter(order=>order.hubOrderId===hubOrderId);
    if(matches.length!==1)return refused('ORDER_CHANGED');
    const order=matches[0];
    if(order.preflight.status!=='REVIEW_ONLY'||order.preflight.route!=='HUB')return refused('CHECK_REQUIRED');
    return Object.freeze({status:'REVIEW_ONLY',order,checkedAt:result.checkedAt});
  }

  async function confirmShipmentReview(hubOrderId,issue=false) {
    const result=status=>Object.freeze({status});
    if(reviewingShipment)return result('BUSY');
    if(typeof showShipmentReview!=='function')return result('UNAVAILABLE');
    reviewingShipment=true;
    const reviewGeneration=generation;
    try {
      if(issue&&!shipmentDirectory)return result('UNAVAILABLE');
      const before=await reviewShipment(hubOrderId);
      if(before.status!=='REVIEW_ONLY')return result(before.status);
      let registry;
      if(issue){
        registry=await getShipmentRegistry(reviewGeneration);
        const saved=await registry.snapshot(hubOrderId);
        if(reviewGeneration!==generation)return result('DISCONNECTED');
        if(saved.status!=='EMPTY')return saved;
      }
      const parent=getMainWindow();
      if(!parent||parent.isDestroyed())return result('DISCONNECTED');
      const order=before.order;
      const answer=await showShipmentReview(parent,{
        type:issue?'warning':'info',title:issue?'모아온 · 우체국 송장 발급':'모아온 · 출고 내용 확인',
        message:issue?'이 주문 1건의 실제 우체국 송장을 발급할까요?':'내용 확인만 합니다. 송장을 발급하지 않습니다.',
        detail:`하린식품\n주문: ${order.hubOrderId}\n상품: ${order.productName}\n수량: ${order.quantity}\n확인 후 저장 주문을 다시 조회합니다.`,
        buttons:['취소',issue?'실제 송장 발급':'내용 확인'],defaultId:0,cancelId:0,noLink:true,
      });
      if(reviewGeneration!==generation)return result('DISCONNECTED');
      if(answer?.response!==1)return result('REVIEW_CANCELLED');
      const after=await reviewShipment(hubOrderId);
      if(reviewGeneration!==generation)return result('DISCONNECTED');
      if(after.status!=='REVIEW_ONLY')return result(after.status);
      if(JSON.stringify(before.order)!==JSON.stringify(after.order))return result('ORDER_CHANGED');
      if(!shipmentFingerprints.has(before.order)||shipmentFingerprints.get(before.order)!==shipmentFingerprints.get(after.order))return result('ORDER_CHANGED');
      if(issue)return await registry.submit(hubOrderId,{confirm:true});
      // Informational acknowledgement only; never accepted as an execution token.
      return result('REVIEW_CONFIRMED');
    } catch {return result('UNAVAILABLE');}
    finally {reviewingShipment=false;}
  }

  const issueShipment=hubOrderId=>confirmShipmentReview(hubOrderId,true);
  async function issueAndRegister(ids){
    if(!validRegistrationIds(ids))throw new TypeError('Invalid automatic shipping selection');
    const empty=status=>({status,results:[]});
    if(reviewingShipment)return empty('BUSY');
    if(disconnecting||cleanupFailed||isLoginWindowActive()||!shipmentDirectory||typeof showShipmentReview!=='function')return empty('UNAVAILABLE');
    const initial=ids.map(id=>loadedOrders.filter(row=>row.hubOrderId===id));
    if(initial.some(rows=>rows.length!==1||rows[0].issueAndRegisterEligible!==true))return empty('CHECK_REQUIRED');
    const expected=generation,results=[];
    const alive=()=>generation===expected&&!disconnecting&&!cleanupFailed&&!isLoginWindowActive()&&getMainWindow()&&!getMainWindow().isDestroyed();
    const same=(left,right)=>left&&right&&workflowFingerprints.get(left)===workflowFingerprints.get(right);
    const controller=new AbortController();let deadline;
    const uploadJournal=row=>createShippingActionJournal({directory:shipmentDirectory,hubOrderId:row.hubOrderId,action:'UPLOAD_INVOICE',fingerprint:createHash('sha256').update(`${workflowFingerprints.get(row)}:${row.details.invoice.number}`).digest('hex')});
    async function hasCheckpoint(row){
      const stable=workflowFingerprints.get(row);
      const prepare=await createShippingActionJournal({directory:shipmentDirectory,hubOrderId:row.hubOrderId,action:'PREPARE',fingerprint:createHash('sha256').update(`${stable}:`).digest('hex')}).read();
      const issued=await createShippingActionJournal({directory:shipmentDirectory,hubOrderId:row.hubOrderId,action:'ISSUE',fingerprint:stable}).read();
      const upload=row.details.invoice?await uploadJournal(row).read():null;
      return prepare!==null||issued!==null||upload!==null;
    }
    async function freshRecoveryRow(hubOrderId){
      for(const scope of ['ACTIVE','REGISTER']){
        let offset=0,snapshot=null;
        for(let page=0;page<5;page++){
          if(!alive()||controller.signal.aborted)return null;
          const local=new AbortController();let timer;
          const stop=()=>local.abort();controller.signal.addEventListener('abort',stop,{once:true});
          try{
            const response=await Promise.race([(async()=>{
              const value=await getRemoteSession().fetch(snapshot===null?buildOrdersScopeUrl(scope,currentChannel):buildOrdersPageUrl(offset,snapshot,scope,currentChannel),{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:local.signal});
              if(value.status!==200)throw Error('Recovery read unavailable');
              return await readBoundedJson(value,local);
            })(),new Promise((_,reject)=>{local.signal.addEventListener('abort',()=>reject(Error('Recovery stopped')),{once:true});timer=setTimeout(stop,timeoutMs);})]);
            if(!alive()||controller.signal.aborted)return null;
            const result=projectOrdersPayload(response,now().toISOString(),{requestedOffset:offset,expectedSnapshot:snapshot,scope});
            if(result.status!=='READY')return null;
            const rows=result.orders.filter(row=>row.hubOrderId===hubOrderId);if(rows.length)return rows.length===1?rows[0]:null;
            if(response.nextOffset===null)break;offset=response.nextOffset;snapshot=response.snapshot;
          }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);}
        }
      }
      return null;
    }
    reviewingShipment=true;
    automaticController=controller;
    try{
      let recovery;
      try{recovery=await Promise.all(initial.map(([row])=>hasCheckpoint(row)));}catch{return empty('CHECK_REQUIRED');}
      let targets;
      if(recovery.some(Boolean)){
        targets=[];
        for(const [index,[original]] of initial.entries()){
          const row=await freshRecoveryRow(original.hubOrderId);
          if(!row||!same(original,row)||!recovery[index]&&shipmentFingerprints.get(original)!==shipmentFingerprints.get(row))return empty('CHECK_REQUIRED');
          const completed=row.details.invoice?.status==='REGISTERED'&&await uploadJournal(row).read()!==null;
          if(!row.issueAndRegisterEligible&&!completed)return empty('CHECK_REQUIRED');
          targets.push([row]);
        }
      }else{
        const before=await recheckPage();if(!alive())return empty('DISCONNECTED');
        if(before.status!=='READY')return empty('CHECK_REQUIRED');
        targets=ids.map(id=>before.orders.filter(row=>row.hubOrderId===id));
        if(targets.some((rows,i)=>rows.length!==1||!rows[0].issueAndRegisterEligible||shipmentFingerprints.get(rows[0])!==shipmentFingerprints.get(initial[i][0])))return empty('CHECK_REQUIRED');
      }
      if(!alive())return empty('DISCONNECTED');
      const answer=await showShipmentReview(getMainWindow(),{type:'warning',title:'모아온 · 송장 발급·쇼핑몰 등록',message:`선택한 ${ids.length}건의 실제 우체국 송장을 발급하고 쇼핑몰에 등록할까요?`,detail:`하린식품\n${targets.map(([row])=>`${row.platform} · ${row.hubOrderId} · ${row.quantity}개 · ${row.details.invoice?.status==='REGISTERED'?'등록 결과 확인':row.registrationEligible?'기존 발급 번호 등록':'실제 계약소포 발급'}`).join('\n')}\n결제완료 주문은 상품준비중으로 변경합니다. 기존 발급 작업은 재발급하지 않고 상태를 확인합니다. 등록 확인 후 배송 추적 조회를 요청합니다.`,buttons:['취소','실제 발급·쇼핑몰 등록'],defaultId:0,cancelId:0,noLink:true});
      if(!alive())return empty('DISCONNECTED');if(answer?.response!==1)return empty('REVIEW_CANCELLED');
      if(recovery.some(Boolean)){
        for(const [row] of targets){const latest=await freshRecoveryRow(row.hubOrderId);if(!latest||shipmentFingerprints.get(row)!==shipmentFingerprints.get(latest))return empty('CHECK_REQUIRED');}
      }else{
        const after=await recheckPage();if(!alive())return empty('DISCONNECTED');
        if(after.status!=='READY'||targets.some(([row])=>{const matches=after.orders.filter(other=>other.hubOrderId===row.hubOrderId);return matches.length!==1||shipmentFingerprints.get(row)!==shipmentFingerprints.get(matches[0]);}))return empty('CHECK_REQUIRED');
      }
      if(!alive())return empty('DISCONNECTED');
      automaticController=controller;
      deadline=setTimeout(()=>{controller.abort();void stopShipments();},automaticTimeoutMs);
      const active=()=>alive()&&!controller.signal.aborted;
      const pause=()=>new Promise(resolve=>{if(!active())return resolve();const timer=setTimeout(done,automaticPollDelayMs);function done(){clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
      async function jsonRequest(url,method='GET',body){
        if(!active())throw Error('Workflow stopped');
        const local=new AbortController();const stop=()=>local.abort();controller.signal.addEventListener('abort',stop,{once:true});let timer;
        const aborted=new Promise((_,reject)=>{local.signal.addEventListener('abort',()=>reject(Error('Request stopped')),{once:true});timer=setTimeout(stop,15000);});
        automaticPermits.add(url);if(method==='POST')registrationRequestActive=true;
        try{return await Promise.race([(async()=>{
          const response=await getRemoteSession().fetch(url,{method,credentials:'include',cache:'no-store',redirect:'error',signal:local.signal,headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json',Origin:HARIN_ORIGIN}:{})},...(body?{body:JSON.stringify(body)}:{})});
          if(!active()||local.signal.aborted)throw Error('Request stopped');
          if([401,403].includes(response.status)){controller.abort();throw Error('Authorization expired');}
          return {status:response.status,body:await readBoundedJson(response,local)};
        })(),aborted]);}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',stop);automaticPermits.delete(url);if(method==='POST')registrationRequestActive=false;}
      }
      async function readTarget(id,scope){
        let offset=0,snapshot=null;
        for(let page=0;page<5&&active();page++){
          const response=await jsonRequest(snapshot===null?buildOrdersScopeUrl(scope,currentChannel):buildOrdersPageUrl(offset,snapshot,scope,currentChannel));
          if(response.status!==200)return null;
          const result=projectOrdersPayload(response.body,now().toISOString(),{requestedOffset:offset,expectedSnapshot:snapshot,scope});
          if(result.status!=='READY')return null;
          const matches=result.orders.filter(row=>row.hubOrderId===id);if(matches.length)return matches.length===1?matches[0]:null;
          if(response.body.nextOffset===null)return null;offset=response.body.nextOffset;snapshot=response.body.snapshot;
        }
        return null;
      }
      async function action(row,kind){
        const fingerprint=createHash('sha256').update(`${workflowFingerprints.get(row)}:${kind==='UPLOAD_INVOICE'?row.details.invoice.number:''}`).digest('hex');
        const journal=createShippingActionJournal({directory:shipmentDirectory,hubOrderId:row.hubOrderId,action:kind,fingerprint});
        let record=await journal.read();
        if(record===null){
          record=await journal.write({status:'INTENT'});if(!active())return 'CHECK_REQUIRED';
          const input={hubOrderId:row.hubOrderId,...(kind==='UPLOAD_INVOICE'?{invoiceNumber:row.details.invoice.number,deliveryCompanyCode:row.platform==='CAFE24'?'0012':'EPOST'}:{})};
          const response=await jsonRequest(REGISTRATION_URL,'POST',{confirm:true,action:kind,orders:[input]});
          const matches=Array.isArray(response.body?.results)?response.body.results.filter(item=>item?.hubOrderId===row.hubOrderId):[];
          const item=matches.length===1?matches[0]:null;
          const status=response.status===200&&response.body?.ok===true&&item?.ok===true&&item.status==='SUCCESS'?'SUCCESS':response.status===409&&response.body?.ok===false&&item?.ok===false?'FAILED':response.status===202&&response.body?.ok===true&&item?.ok===true&&['QUEUED','RUNNING'].includes(item.status)&&row.platform==='COUPANG'&&typeof item.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.requestId)?'PENDING':'UNKNOWN';
          record=await journal.write({status,requestId:status==='PENDING'?item.requestId:null});
        }
        for(let poll=0;active()&&poll<5&&['PENDING','RUNNING'].includes(record.status);poll++){
          if(poll)await pause();if(!active())break;
          const response=await jsonRequest(`${HARIN_ORIGIN}/api/coupang/operations/${record.requestId}`);
          const item=response.body?.request;
          const status=response.status===202&&response.body?.ok===true&&item?.id===record.requestId&&['PENDING','RUNNING'].includes(item.status)?item.status:response.status===200&&response.body?.ok===true&&item?.id===record.requestId&&item.status==='SUCCESS'?'SUCCESS':response.status===502&&response.body?.ok===false&&response.body.code==='COUPANG_FIXED_IP_OPERATION_FAILED'?'FAILED':'UNKNOWN';
          record=await journal.write({status,requestId:record.requestId});
        }
        return record.status==='SUCCESS'?'SUCCESS':record.status==='FAILED'?'FAILED':['PENDING','RUNNING'].includes(record.status)?'PENDING':'CHECK_REQUIRED';
      }
      const registry=await getShipmentRegistry(expected);
      async function confirmedInvoice(hubOrderId,issued){
        const transport=createShipmentTransport({hubOrderId,fetch:async(url,options)=>{
          if(!active())throw Error('Stopped');const key=`${options.method} ${url}`;shipmentPermits.set(key,(shipmentPermits.get(key)||0)+1);
          try{return await getRemoteSession().fetch(url,options);}finally{const count=(shipmentPermits.get(key)||0)-1;if(count>0)shipmentPermits.set(key,count);else shipmentPermits.delete(key);}
        }});
        const proof=await transport.poll(issued.requestId,{signal:controller.signal});
        const value=proof.body?.result?.trackingNo;
        return proof.status===200&&proof.body?.ok===true&&proof.body.request?.id===issued.requestId&&proof.body.request?.hubOrderId===hubOrderId&&proof.body.request?.status==='SUCCESS'&&typeof value==='string'&&/^\d{13}$/.test(value)?value:null;
      }
      for(const [approved] of targets){
        const hubOrderId=approved.hubOrderId;let phase=approved.registrationEligible?'REGISTER':approved.stage==='PAID'?'PREPARE':'ISSUE';
        try{
          if(!active()){results.push({hubOrderId,phase,status:'CHECK_REQUIRED'});continue;}
          let row=await readTarget(hubOrderId,'ACTIVE');
          if(!row&&approved.details.invoice?.status==='REGISTERED')row=await readTarget(hubOrderId,'REGISTER');
          if(row&&same(approved,row)&&row.details.invoice?.status==='REGISTERED'&&await uploadJournal(row).read()!==null){
            const outcome=await action(row,'UPLOAD_INVOICE');
            const verified=outcome==='SUCCESS'?await readTarget(hubOrderId,'REGISTER'):null;
            const result={hubOrderId,phase:'REGISTER',status:outcome==='SUCCESS'?verified&&same(approved,verified)&&verified.details.invoice?.status==='REGISTERED'&&verified.details.invoice.number===row.details.invoice.number?'REGISTERED':'CHECK_REQUIRED':outcome};
            results.push(result);
            if(result.status==='REGISTERED')result.trackingStatus=await enqueueRegisteredTracking(verified,row,controller,active);
            continue;
          }
          if(!row||!same(approved,row)||!row.issueAndRegisterEligible){results.push({hubOrderId,phase,status:'CHECK_REQUIRED'});continue;}
          if(row.registrationEligible){
            // A resumed automatic issue must still be bound to its original
            // private identity and authoritative tracking number after restart.
            const identity=await createShippingActionJournal({directory:shipmentDirectory,hubOrderId,action:'ISSUE',fingerprint:workflowFingerprints.get(row)}).read();
            if(identity!==null){
              let issued=await registry.snapshot(hubOrderId);
              for(let poll=0;active()&&poll<5&&['PENDING','RUNNING','SUBMITTING'].includes(issued.status);poll++){if(poll)await pause();if(!active())break;issued=await registry.poll(hubOrderId);}
              if(issued.status!=='SUCCEEDED'||await confirmedInvoice(hubOrderId,issued)!==row.details.invoice.number){results.push({hubOrderId,phase:'ISSUE',status:['PENDING','RUNNING'].includes(issued.status)?'PENDING':'CHECK_REQUIRED'});continue;}
            }
          }
          const prepareRecord=await createShippingActionJournal({directory:shipmentDirectory,hubOrderId,action:'PREPARE',fingerprint:createHash('sha256').update(`${workflowFingerprints.get(row)}:`).digest('hex')}).read();
          if(!row.registrationEligible&&row.stage==='PAID'||prepareRecord!==null&&prepareRecord.status!=='SUCCESS'){
            const prepared=await action(row,'PREPARE');
            if(prepared!=='SUCCESS'){results.push({hubOrderId,phase:'PREPARE',status:prepared});continue;}
            row=await readTarget(hubOrderId,'ACTIVE');
            // PREPARE confirms the provider update, not a local order sync.
            // /api/epost/issue itself permits PAID as well as prepared stages.
            if(!row||!same(approved,row)||!row.issueAndRegisterEligible||!['PAID','PREPARING','READY_TO_SHIP'].includes(row.stage)){results.push({hubOrderId,phase:'PREPARE',status:'CHECK_REQUIRED'});continue;}
          }
          if(!row.registrationEligible){
            phase='ISSUE';let issued=await registry.snapshot(hubOrderId);
            const identityJournal=createShippingActionJournal({directory:shipmentDirectory,hubOrderId,action:'ISSUE',fingerprint:workflowFingerprints.get(row)});
            const identity=await identityJournal.read();
            if(issued.status==='EMPTY'){
              if(identity!==null||!active()){results.push({hubOrderId,phase,status:'CHECK_REQUIRED'});continue;}
              await identityJournal.write({status:'INTENT'});
              if(!active())throw Error('Stopped');issued=await registry.submit(hubOrderId,{confirm:true});
            }else if(identity===null){results.push({hubOrderId,phase,status:'CHECK_REQUIRED'});continue;}
            for(let poll=0;active()&&poll<5&&['PENDING','RUNNING','SUBMITTING'].includes(issued.status);poll++){if(poll)await pause();if(!active())break;issued=await registry.poll(hubOrderId);}
            if(issued.status!=='SUCCEEDED'){results.push({hubOrderId,phase,status:['PENDING','RUNNING','SUBMITTING'].includes(issued.status)?'PENDING':['FAILED','CANCELLED'].includes(issued.status)?'FAILED':'CHECK_REQUIRED'});continue;}
            // The durable issuance job intentionally stores no tracking number.
            // Re-read its authoritative result and require the stored order to
            // carry exactly that invoice before sending it to the platform.
            const confirmed=await confirmedInvoice(hubOrderId,issued);
            if(confirmed===null){results.push({hubOrderId,phase,status:'CHECK_REQUIRED'});continue;}
            row=await readTarget(hubOrderId,'ACTIVE');
            if(!row||!same(approved,row)||!row.registrationEligible||row.details.invoice.number!==confirmed){results.push({hubOrderId,phase,status:'CHECK_REQUIRED'});continue;}
            await identityJournal.write({status:'SUCCESS',requestId:issued.requestId});
          }
          phase='REGISTER';
          if(!active())throw Error('Stopped');
          const registered=await action(row,'UPLOAD_INVOICE');
          if(registered!=='SUCCESS'){results.push({hubOrderId,phase,status:registered});continue;}
          const verified=await readTarget(hubOrderId,'REGISTER');
          const result={hubOrderId,phase,status:verified&&same(approved,verified)&&verified.details.invoice?.status==='REGISTERED'&&verified.details.invoice.number===row.details.invoice.number?'REGISTERED':'CHECK_REQUIRED'};
          results.push(result);
          if(result.status==='REGISTERED')result.trackingStatus=await enqueueRegisteredTracking(verified,row,controller,active);
        }catch{results.push({hubOrderId,phase,status:'CHECK_REQUIRED'});}
      }
      if(!alive())return empty('DISCONNECTED');
      return {status:results.every(row=>row.status==='REGISTERED')?'COMPLETED':'PARTIAL',results};
    }catch{return alive()?{status:'UNAVAILABLE',results}:empty('DISCONNECTED');}
    finally{clearTimeout(deadline);controller.abort();if(automaticController===controller)automaticController=null;reviewingShipment=false;}
  }
  async function registerInvoices(ids){
    if(!validRegistrationIds(ids))throw new TypeError('Invalid invoice selection');
    const empty=status=>({status,results:[]});
    if(reviewingShipment)return empty('BUSY');
    if(disconnecting||cleanupFailed||isLoginWindowActive()||typeof showShipmentReview!=='function')return empty('UNAVAILABLE');
    const selected=ids.map(id=>loadedOrders.filter(row=>row.hubOrderId===id));
    if(selected.some(rows=>rows.length!==1||!rows[0].registrationEligible))return empty('CHECK_REQUIRED');
    const expected=generation,initial=selected.map(rows=>rows[0]);
    const alive=()=>expected===generation&&!disconnecting&&!cleanupFailed&&!isLoginWindowActive()&&getMainWindow()&&!getMainWindow().isDestroyed();
    const same=(left,right)=>left&&right&&left.hubOrderId===right.hubOrderId&&right.registrationEligible&&shipmentFingerprints.get(left)===shipmentFingerprints.get(right);
    const reread=async baseline=>{
      const page=await recheckPage();if(!alive()||page.status!=='READY')return null;
      const rows=ids.map(id=>page.orders.filter(order=>order.hubOrderId===id));
      return rows.every((row,i)=>row.length===1&&same(baseline[i],row[0]))?rows.map(row=>row[0]):null;
    };
    reviewingShipment=true;let sent=false,timer;
    try{
      const before=await reread(initial);if(!before)return empty(alive()?'ORDER_CHANGED':'DISCONNECTED');
      const keys=before.map(row=>`${row.hubOrderId}:${row.details.invoice.number}`);
      if(keys.some(key=>registrationAttempts.has(key)))return empty('CHECK_REQUIRED');
      const uploadJournals=[];
      if(shipmentDirectory)for(const row of before){
        const fingerprint=createHash('sha256').update(`${workflowFingerprints.get(row)}:${row.details.invoice.number}`).digest('hex');
        const journal=createShippingActionJournal({directory:shipmentDirectory,hubOrderId:row.hubOrderId,action:'UPLOAD_INVOICE',fingerprint});
        if(await journal.read()!==null)return empty('CHECK_REQUIRED');
        uploadJournals.push(journal);
      }
      const answer=await showShipmentReview(getMainWindow(),{type:'warning',title:'모아온 · 쇼핑몰 송장 등록',message:`선택한 ${ids.length}건의 발급 송장을 쇼핑몰에 등록할까요?`,detail:`하린식품\n${before.map(row=>`${row.platform} · ${row.hubOrderId} · ${row.details.invoice.number}`).join('\n')}\n쿠팡은 처리 대기 상태로 접수될 수 있습니다. 등록 확인 후 배송 추적 조회를 요청합니다.`,buttons:['취소','송장 등록'],defaultId:0,cancelId:0,noLink:true});
      if(!alive())return empty('DISCONNECTED');
      if(answer?.response!==1)return empty('REVIEW_CANCELLED');
      const approved=await reread(before);if(!approved)return empty(alive()?'ORDER_CHANGED':'DISCONNECTED');
      // The manual and automatic paths share one durable upload intent. A lost
      // manual response must never become a fresh automatic registration POST.
      for(const journal of uploadJournals)await journal.write({status:'INTENT'});
      if(!alive())return empty('DISCONNECTED');
      const controller=new AbortController();registrationController=controller;
      const stopped=new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('Registration stopped')),{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);});
      const request=(async()=>{
        if(!alive())throw Error('Disconnected');
        keys.forEach(key=>registrationAttempts.add(key));sent=true;registrationRequestActive=true;
        try{
          const response=await getRemoteSession().fetch(REGISTRATION_URL,{method:'POST',credentials:'include',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Origin:HARIN_ORIGIN},body:JSON.stringify({confirm:true,action:'UPLOAD_INVOICE',orders:approved.map(row=>({hubOrderId:row.hubOrderId,invoiceNumber:row.details.invoice.number,deliveryCompanyCode:row.platform==='CAFE24'?'0012':'EPOST'}))})});
          if(!alive()||controller.signal.aborted)throw Error('Disconnected');
          if(![200,202,409].includes(response.status))throw Error('Registration unavailable');
          return {httpStatus:response.status,body:await readBoundedJson(response,controller)};
        }finally{registrationRequestActive=false;}
      })();
      const received=await Promise.race([request,stopped]),payload=received.body;
      if(!alive())return empty('DISCONNECTED');
      for(const [index,journal] of uploadJournals.entries()){
        const rows=Array.isArray(payload?.results)?payload.results.filter(row=>row?.hubOrderId===ids[index]):[];
        const row=rows.length===1?rows[0]:null;
        const pending=received.httpStatus===202&&payload?.ok===true&&row?.ok===true&&['QUEUED','RUNNING'].includes(row.status)&&typeof row.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.requestId);
        await journal.write({status:pending?'PENDING':[200,202].includes(received.httpStatus)&&payload?.ok===true&&row?.ok===true&&row.status==='SUCCESS'?'SUCCESS':row?.ok===false?'FAILED':'UNKNOWN',requestId:pending?row.requestId:null});
      }
      // Successful rows move from ACTIVE to REGISTER. Read that fixed workspace
      // privately without changing the user's displayed scope or page cursor.
      const verify=async()=>{
        const found=[];let offset=0,snapshot=null;
        const successIds=ids.filter(id=>Array.isArray(payload?.results)&&payload.results.some(row=>row?.hubOrderId===id&&row.ok===true&&row.status==='SUCCESS'));
        if(!successIds.length)return {status:'READY',orders:[]};
        for(let page=0;page<5;page++){
          if(!alive()||controller.signal.aborted)throw Error('Verification stopped');
          const url=snapshot===null?buildOrdersScopeUrl('REGISTER',currentChannel):buildOrdersPageUrl(offset,snapshot,'REGISTER',currentChannel);
          const response=await getRemoteSession().fetch(url,{method:'GET',credentials:'include',redirect:'error',cache:'no-store',signal:controller.signal});
          if(response.status!==200)return {status:'UNAVAILABLE',orders:[]};
          const body=await readBoundedJson(response,controller);
          if(!alive()||controller.signal.aborted)throw Error('Verification stopped');
          const result=projectOrdersPayload(body,now().toISOString(),{requestedOffset:offset,expectedSnapshot:snapshot,scope:'REGISTER'});
          if(result.status!=='READY')return {status:'UNAVAILABLE',orders:[]};
          found.push(...result.orders);
          if(successIds.every(id=>found.some(row=>row.hubOrderId===id))||body.nextOffset===null)break;
          snapshot=body.snapshot;offset=body.nextOffset;
        }
        return {status:'READY',orders:found};
      };
      const verified=await Promise.race([verify(),stopped]).catch(()=>({status:'UNAVAILABLE',orders:[]}));
      if(!alive())return empty('DISCONNECTED');
      const results=ids.map((hubOrderId,index)=>{
        const outcomes=Array.isArray(payload?.results)?payload.results.filter(row=>row?.hubOrderId===hubOrderId):[];
        const outcome=outcomes.length===1?outcomes[0]:null;
        let status='CHECK_REQUIRED';
        if(outcome?.ok===false)status='FAILED';
        else if(outcome?.ok===true&&['QUEUED','RUNNING'].includes(outcome.status))status='PENDING';
        else if(outcome?.ok===true&&outcome.status==='SUCCESS'&&verified.status==='READY'){
          const rows=verified.orders.filter(row=>row.hubOrderId===hubOrderId);
          if(rows.length===1&&rows[0].details.invoice?.status==='REGISTERED'&&rows[0].details.invoice.number===approved[index].details.invoice.number&&workflowFingerprints.get(rows[0])===workflowFingerprints.get(approved[index]))status='REGISTERED';
        }
        return {hubOrderId,status};
      });
      for(const [index,result] of results.entries())if(result.status==='REGISTERED')result.trackingStatus=await enqueueRegisteredTracking(verified.orders.find(row=>row.hubOrderId===result.hubOrderId),approved[index],controller,alive);
      if(!alive())return empty('DISCONNECTED');
      return {status:results.every(row=>row.status==='REGISTERED')?'COMPLETED':'PARTIAL',results};
    }catch{return alive()?{status:sent?'PARTIAL':'UNAVAILABLE',results:sent?ids.map(hubOrderId=>({hubOrderId,status:'CHECK_REQUIRED'})):[]}:empty('DISCONNECTED');}
    finally{clearTimeout(timer);registrationController=null;registrationRequestActive=false;reviewingShipment=false;}
  }
  async function previewLabel(hubOrderId){
    if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId))throw Error('Invalid label order');
    if(reviewingShipment||collectionWorkActive||trackingController)return {status:'BUSY'};
    const expected=generation;
    let opening=true;reviewingShipment=true;
    const readTarget=async()=>{
      if(collectionWorkActive||trackingController||(!opening&&reviewingShipment))return null;
      const page=await recheckPage();
      if(expected!==generation||page.status!=='READY')return null;
      const rows=page.orders.filter(order=>order.hubOrderId===hubOrderId);
      const order=rows[0];
      if(rows.length!==1||order.preflight.route!=='HUB'||order.stage==='CANCELLED'||order.details.cancelled!==false||order.details.cancellationRequested!==false||order.details.invoice?.status!=='REGISTERED')return null;
      return order;
    };
    try{
      if(!labelPreview)return {status:'PRINT_UNAVAILABLE'};
      const order=await readTarget();if(!order)return {status:'PRINT_CHECK_REQUIRED'};
      const result=await labelPreview.open({hubOrderId,trackingNo:order.details.invoice.number,expectedReceiver:labelReceivers.get(order),goodsName:order.productName,quantity:order.quantity,businessName:'하린식품',channelLabel:order.platform,validate:async()=>{
        const latest=await readTarget();return !!latest&&shipmentFingerprints.get(latest)===shipmentFingerprints.get(order);
      }});
      return expected===generation?result:{status:'DISCONNECTED'};
    }catch{return {status:'PRINT_UNAVAILABLE'};}
    finally{opening=false;reviewingShipment=false;}
  }
  async function selectedDocument(ids,kind){
    if(!validDocumentIds(ids)||(kind==='label'&&!validRegistrationIds(ids)))throw Error('Invalid document selection');
    if(reviewingShipment||registrationController||automaticController||trackingController||collectionWorkActive)return {status:'BUSY'};
    const expected=generation,scope=currentScope,channel=currentChannel,offset=pageCursor?.offset;
    const initial=ids.map(id=>loadedOrders.filter(row=>row.hubOrderId===id));
    if(offset==null||initial.some(rows=>rows.length!==1))return {status:'DOCUMENT_CHANGED'};
    const baseline=initial.map(rows=>rows[0]);
    const alive=()=>generation===expected&&currentScope===scope&&currentChannel===channel&&pageCursor?.offset===offset&&!disconnecting&&!cleanupFailed&&!isLoginWindowActive();
    const fingerprint=row=>shipmentFingerprints.get(row)+'|'+renderSelectedCsv([row]);
    let opening=true;
    const read=async()=>{
      if(!alive()||collectionWorkActive||trackingController||(!opening&&reviewingShipment))return null;
      const page=await recheckPage();
      if(!alive()||page.status!=='READY'||page.offset!==offset)return null;
      const rows=ids.map(id=>page.orders.filter(row=>row.hubOrderId===id));
      if(rows.some((found,index)=>found.length!==1||fingerprint(found[0])!==fingerprint(baseline[index])))return null;
      const selected=rows.map(found=>found[0]);
      if(selected.some(row=>row.platform!==(row.hubOrderId.startsWith('HR-C24-')?'CAFE24':row.hubOrderId.startsWith('HR-CP-')?'COUPANG':'NAVER')))return null;
      if(kind==='label'&&(selected.some(row=>row.preflight.route!=='HUB'||row.stage==='CANCELLED'||row.details.cancelled!==false||row.details.cancellationRequested!==false||row.details.invoice?.status!=='REGISTERED')||new Set(selected.map(row=>row.details.invoice.number)).size!==selected.length))return null;
      return selected;
    };
    reviewingShipment=true;
    try{
      const rows=await read();if(!rows)return {status:'DOCUMENT_CHANGED'};
      const validate=async()=>!!await read();
      const result=kind==='csv'?await selectedDocuments?.save({orders:rows,validate}):await labelPreview?.open({labels:rows.map(row=>({hubOrderId:row.hubOrderId,trackingNo:row.details.invoice.number,expectedReceiver:labelReceivers.get(row),goodsName:row.productName,quantity:row.quantity,businessName:'하린식품',channelLabel:row.platform})),validate});
      return generation===expected?(result||{status:'DOCUMENT_UNAVAILABLE'}):{status:'DISCONNECTED'};
    }catch{return {status:'DOCUMENT_UNAVAILABLE'};}
    finally{opening=false;reviewingShipment=false;}
  }
  const previewLabels=ids=>selectedDocument(ids,'label');
  const exportSelectedCsv=ids=>selectedDocument(ids,'csv');
  async function previewWorklist(ids,type){
    if(!validDocumentIds(ids)||!['packing','dispatch'].includes(type))throw Error('Invalid worklist selection');
    if(reviewingShipment||registrationController||automaticController||trackingController||collectionWorkActive)return {status:'BUSY'};
    const expected=generation,scope=currentScope,channel=currentChannel,offset=pageCursor?.offset;
    const initial=ids.map(id=>loadedOrders.filter(row=>row.hubOrderId===id));if(offset==null||initial.some(rows=>rows.length!==1))return {status:'DOCUMENT_CHANGED'};
    const baseline=initial.map(rows=>rows[0]),alive=()=>generation===expected&&currentScope===scope&&currentChannel===channel&&pageCursor?.offset===offset&&!disconnecting&&!cleanupFailed&&!isLoginWindowActive();
    let opening=true;const read=async()=>{if(!alive()||collectionWorkActive||trackingController||registrationController||automaticController||(!opening&&reviewingShipment))return null;const page=await recheckPage();if(!alive()||page.status!=='READY'||page.offset!==offset)return null;const rows=ids.map(id=>page.orders.filter(row=>row.hubOrderId===id));if(rows.some((found,index)=>found.length!==1||shipmentFingerprints.get(found[0])!==shipmentFingerprints.get(baseline[index])))return null;return rows.map(found=>found[0]);};
    reviewingShipment=true;
    try{const rows=await read();if(!rows)return {status:'DOCUMENT_CHANGED'};const documents=rows.map(row=>worklistOrders.get(row));if(documents.some(row=>Array.isArray(row?.items)&&row.items.length===8))return {status:'DOCUMENT_ITEM_LIMIT'};const result=await worklistPreview?.open({type,orders:documents,validate:async()=>!!await read()});return generation===expected?(result||{status:'DOCUMENT_UNAVAILABLE'}):{status:'DISCONNECTED'};}catch{return {status:'DOCUMENT_UNAVAILABLE'};}finally{opening=false;reviewingShipment=false;}
  }
  async function verifyShipmentSession() {
    if(disconnecting||cleanupFailed||isLoginWindowActive())return 'UNAVAILABLE';
    const controller=new AbortController();shipmentAuthReads.add(controller);
    let timer;
    try {
      return await Promise.race([
        (async()=>{
          // A fresh auth read independent of the displayed page cursor. Issuing
          // changes the order snapshot; polling must not depend on the old one.
          const response=await getRemoteSession().fetch(buildOrdersScopeUrl('ACTIVE'),{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
          if([401,403].includes(response.status)){void stopShipments();return response.status===401?'LOGIN_REQUIRED':'FORBIDDEN';}
          if(response.status!==200)return 'UNAVAILABLE';
          const payload=await readBoundedJson(response,controller);
          return projectOrdersPayload(payload,now().toISOString()).status;
        })(),
        new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('Shipment auth stopped')),{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);}),
      ]);
    } catch {return 'UNAVAILABLE';}
    finally {clearTimeout(timer);shipmentAuthReads.delete(controller);}
  }
  async function checkShipment(hubOrderId) {
    if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId))throw new TypeError('Invalid shipment order');
    const expected=generation;
    try {
      const status=await verifyShipmentSession();
      if(expected!==generation)return Object.freeze({status:'DISCONNECTED'});
      if(status!=='READY')return Object.freeze({status});
      const registry=await getShipmentRegistry(expected);
      const value=await registry.poll(hubOrderId);
      return expected===generation ? value : Object.freeze({status:'DISCONNECTED'});
    } catch {return Object.freeze({status:'UNAVAILABLE'});}
  }

  function viewScope(scope) {
    const blocked = blockedReadResult();
    if (blocked) return blocked;
    if (scope === currentScope) return refresh();
    invalidateGeneration();
    void stopShipments();
    currentScope = scope;
    invalidateCursor();
    activeRead = null;
    activeAbortController?.abort();
    return startRead({ url: ordersScopeUrl(scope), requestedOffset: 0, expectedSnapshot: null, scope });
  }

  function viewChannel(channel){
    if(!ORDER_CHANNELS.includes(channel))throw new TypeError('Invalid orders channel');
    const blocked=blockedReadResult();if(blocked)return blocked;
    invalidateGeneration();void stopShipments();currentChannel=channel;invalidateCursor();activeRead=null;activeAbortController?.abort();
    return startRead({url:ordersScopeUrl(),requestedOffset:0,expectedSnapshot:null,scope:currentScope});
  }

  function setOrderFilters(filters){
    if(filters&&Object.keys(filters).length===2)filters={...currentFilters,...filters};
    if(!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).length!==5||typeof filters.delayOnly!=='boolean'||typeof filters.giftOnly!=='boolean'||!validSearch({query:filters.query,start:filters.start,end:filters.end}))return Promise.resolve(safeEmpty('UNAVAILABLE','올바른 주문 필터를 선택하세요.'));
    if(registrationController||automaticController||reviewingShipment||collectionWorkActive||trackingController||findingOrder)return Promise.resolve(safeEmpty('UNAVAILABLE','다른 작업이 진행 중입니다. 완료 후 필터를 변경하세요.'));
    invalidateGeneration();void stopShipments();currentFilters=Object.freeze({...filters});invalidateCursor();activeRead=null;activeAbortController?.abort();
    return startRead({url:ordersScopeUrl(),requestedOffset:0,expectedSnapshot:null,scope:currentScope});
  }
  function applyOrderSearch(search){
    if(!validSearch(search))return Promise.resolve(safeEmpty('UNAVAILABLE','올바른 검색어와 기간을 입력하세요.'));
    return setOrderFilters(Object.freeze({...currentFilters,...search}));
  }
  function exportOrdersXlsx(){
    if(exportWork)return exportWork;
    if(typeof saveOrderExport!=='function'||!pageCursor||activeRead||registrationController||automaticController||reviewingShipment||collectionWorkActive||trackingController||findingOrder)return Promise.resolve({status:'BUSY'});
    const expected=generation,controller=new AbortController();let timer;businessReads.add(controller);
    exportWork=(async()=>{try{
      const auth=await recheckPage();if(expected!==generation||!['READY'].includes(auth.status))return {status:auth.status==='PARTIAL'?'PARTIAL_EXPORT_BLOCKED':'DOCUMENT_CHANGED'};
      const exportSnapshot=pageCursor?.snapshot;if(!exportSnapshot)return {status:'DOCUMENT_CHANGED'};
      const url=buildOrdersExportUrl(currentScope,currentChannel,currentFilters);exportPermit=url;
      const stopped=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Stopped')),{once:true}));timer=setTimeout(()=>controller.abort(),timeoutMs);
      const response=await Promise.race([getRemoteSession().fetch(url,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal}),stopped]);exportPermit=null;
      if(expected!==generation||[401,403].includes(response.status))return {status:response.status===401?'LOGIN_REQUIRED':response.status===403?'FORBIDDEN':'DOCUMENT_CHANGED'};
      if(response.status===404)return {status:'NO_ORDERS'};if(response.status===413)return {status:'EXPORT_LIMIT_EXCEEDED'};if(response.status!==200)return {status:'EXPORT_UNAVAILABLE'};
      const mime=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase();if(mime!=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return {status:'EXPORT_UNAVAILABLE'};
      const count=Number(response.headers.get('x-moaon-export-count')),downloadSnapshot=response.headers.get('x-moaon-export-snapshot');if(response.headers.get('x-moaon-search-contract')!=='1'||!Number.isSafeInteger(count)||count<1||count>5000||downloadSnapshot!==exportSnapshot)return {status:'EXPORT_UNAVAILABLE'};
      const bytes=await readBoundedBytes(response,controller,10*1024*1024);if(!validXlsxPackage(bytes))return {status:'EXPORT_UNAVAILABLE'};
      if(expected!==generation||pageCursor?.snapshot!==exportSnapshot)return {status:'DOCUMENT_CHANGED'};return {status:await saveOrderExport(bytes,async()=>{if(expected!==generation||disconnecting||cleanupFailed)return false;const proof=await recheckPage();return expected===generation&&proof.status==='READY'&&pageCursor?.snapshot===exportSnapshot;})};
    }catch{return {status:'EXPORT_UNAVAILABLE'};}finally{clearTimeout(timer);exportPermit=null;businessReads.delete(controller);controller.abort();exportWork=null;}})();return exportWork;
  }
  function resetOrderFilters(){
    if(registrationController||automaticController||reviewingShipment||collectionWorkActive||trackingController||findingOrder)return Promise.resolve(safeEmpty('UNAVAILABLE','다른 작업이 진행 중입니다. 완료 후 필터를 초기화하세요.'));
    invalidateGeneration();void stopShipments();currentChannel='ALL';currentFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});invalidateCursor();activeRead=null;activeAbortController?.abort();
    return startRead({url:ordersScopeUrl(),requestedOffset:0,expectedSnapshot:null,scope:currentScope});
  }

  const viewActive = () => viewScope('ACTIVE');
  const viewRegistered = () => viewScope('REGISTER');
  const viewInTransit = () => viewScope('IN_TRANSIT');
  const viewCompleted = () => viewScope('COMPLETED');

  function connect() {
    if (disconnecting || cleanupFailed) {
      return Promise.resolve(safeEmpty('UNAVAILABLE', cleanupFailed
        ? STATUS_MESSAGES.SESSION_CLEAR_FAILED
        : '연결 정보를 지우는 중입니다. 잠시 후 다시 확인하세요.'));
    }
    if (isLoginWindowActive() || loginPromise) return Promise.resolve(safeEmpty('LOGIN_OPEN'));
    void stopShipments();

    const parent = getMainWindow();
    if (!parent || parent.isDestroyed()) return Promise.resolve(safeEmpty('UNAVAILABLE'));
    getRemoteSession();
    const loginGeneration = generation;
    let loginOutcome = 'cancelled';
    let loginSubmissionStarted = false;

    loginWindow = new BrowserWindow({
      parent,
      modal: true,
      width: 520,
      height: 600,
      minWidth: 440,
      minHeight: 560,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {color:'#f3f3f8',symbolColor:'#6f6d80',height:36},
      backgroundColor: '#f3f6fa',
      webPreferences: {
        partition: READONLY_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        devTools: false,
        spellcheck: false,
      },
    });

    const windowAtOpen = loginWindow;
    const contents = windowAtOpen.webContents;
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('dom-ready', () => {
      let url;
      try { url = new URL(contents.getURL()); } catch { return; }
      if (url.origin !== HARIN_ORIGIN || url.pathname !== '/login') return;
      // Presentation only: retain the server form, validation and authentication.
      void contents.insertCSS(`
        [class*="loginPage"] { --login-canvas:#f3f3f8 !important; --login-surface:#fff !important; --login-soft:#f8f7fc !important; --login-ink:#282836 !important; --login-muted:#6f6d80 !important; --login-line:#e4e2ed !important; --login-blue:#7565b4 !important; --login-blue-soft:#ede9fa !important; --login-mint:#247867 !important; --login-navy:#282836 !important; --login-rose:#b64f5e !important; color:#282836 !important; font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif !important; }
        [class*="loginPage"] input,[class*="loginPage"] button { font-family:inherit !important; }
        html::before { content:''; position:fixed; top:0; left:0; right:138px; height:36px; -webkit-app-region:drag; z-index:9999; }
        [class*="loginPage"] { padding: 44px 22px 22px !important; min-height: 100vh !important; background:var(--login-canvas,#f3f6fa) !important; }
        [class*="loginFrame"] { display: flex !important; flex-direction: column !important; min-height: 0 !important; width: 100% !important; background:var(--login-surface,#fff) !important; border:1px solid var(--login-line,#dfe5ee) !important; border-radius:24px !important; box-shadow:0 18px 60px #1720360d !important; animation:moaonLoginArrive .35s ease-out both !important; }
        [class*="loginHero"], [class*="frameFooter"], [class*="ownerAccess"] { display: none !important; }
        [class*="loginTopbar"] { min-height: 72px !important; padding: 14px 22px !important; }
        [class*="loginAccess"] { padding: 24px !important; }
        [class*="accessHeader"] > span { display: none !important; }
        [class*="accessHeader"] h2 { margin: 0 !important; font-size: 25px !important; }
        [class*="accessHeader"] p { margin-top: 8px !important; }
        [class*="loginForm"] { margin-top: 22px !important; }
        [class*="sessionNote"] { margin-top: 18px !important; padding-top: 16px !important; }
        [class*="loginPasswordField"] { border-radius:12px !important; box-shadow:none !important; }
        [class*="submitButton"] { border-radius:12px !important; min-height:50px !important; background:#7565b4 !important; color:#fff !important; font-weight:600 !important; transition:background .18s ease,transform .18s ease !important; }
        [class*="submitButton"]:not(:disabled):hover { background:#64549d !important; transform:translateY(-1px); }
        @keyframes moaonLoginArrive { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @media(prefers-reduced-motion:reduce) { [class*="loginFrame"] { animation:none !important; } [class*="submitButton"] { transition:none !important; transform:none !important; } }
      `).catch(() => { /* A navigation may replace the styled document. */ });
    });
    const guardNavigation = (event, targetUrl) => {
      if (targetUrl === `${HARIN_ORIGIN}/` || targetUrl === HARIN_ORIGIN) {
        event.preventDefault();
        loginOutcome = 'redirected';
        windowAtOpen.destroy();
        return;
      }
      let allowed = false;
      try {
        const url = new URL(targetUrl);
        // Native form POST is a main-frame navigation too. The session policy
        // separately restricts this exact endpoint to POST from this login window.
        allowed = (url.origin === HARIN_ORIGIN && url.pathname === '/login')
          || targetUrl === `${HARIN_ORIGIN}/api/dashboard/login`;
      } catch {
        allowed = false;
      }
      if (!allowed) event.preventDefault();
      if (allowed && targetUrl === `${HARIN_ORIGIN}/api/dashboard/login`) loginSubmissionStarted = true;
    };
    contents.on('will-navigate', guardNavigation);
    contents.on('will-redirect', guardNavigation);
    contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
      if (isMainFrame && errorCode !== -3 && loginOutcome !== 'redirected') {
        loginOutcome = 'load-failed';
        windowAtOpen.destroy();
      }
    });
    windowAtOpen.once('ready-to-show', () => windowAtOpen.show());

    loginPromise = new Promise((resolve) => {
      windowAtOpen.once('closed', async () => {
        if (loginWindow === windowAtOpen) loginWindow = null;
        const outcome = loginOutcome;
        loginPromise = null;
        if (loginGeneration !== generation) {
          resolve(safeEmpty('DISCONNECTED'));
        } else if (outcome === 'redirected') {
          resolve(await refresh());
        } else if (outcome === 'load-failed') {
          resolve(safeEmpty('UNAVAILABLE', '하린식품 로그인 화면을 열지 못했습니다.'));
        } else {
          resolve(safeEmpty('LOGIN_REQUIRED', '하린식품 로그인이 취소되었습니다.'));
        }
      });
    });

    windowAtOpen.loadURL(LOGIN_URL).catch((error) => {
      // A native form submission supersedes the initial document load.
      // Only that known navigation may cancel the old load without closing login.
      if (loginSubmissionStarted && (error?.code === 'ERR_ABORTED' || error?.errno === -3)) return;
      if (!windowAtOpen.isDestroyed()) {
        loginOutcome = 'load-failed';
        windowAtOpen.destroy();
      }
    });
    return loginPromise;
  }

  function disconnect() {
    if (disconnecting) return disconnecting;
    collection.reset();
    invalidateGeneration();
    activeFinanceController?.abort();financePermit=null;
    settlementController?.abort();settlementPermit=null;insightsController?.abort();insightsPermit=null;csController?.abort();csPermit=null;inventoryController?.abort();inventoryPermit=null;
    const shipmentShutdown=stopShipments();
    currentScope = 'ACTIVE';
    currentChannel = 'ALL';
    currentFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});
    invalidateCursor();
    activeRead = null;
    activeAbortController?.abort();
    if (isLoginWindowActive()) loginWindow.destroy();
    loginWindow = null;

    const operation = (async () => {
      try {
        await shipmentShutdown;
        await markCleanupPending();
        getRemoteSession();
      } catch {
        cleanupFailed = true;
        return safeEmpty('UNAVAILABLE', STATUS_MESSAGES.SESSION_CLEAR_FAILED);
      }
      const results = await Promise.allSettled([
        () => remoteSession.clearStorageData(),
        () => remoteSession.clearCache(),
        () => remoteSession.clearAuthCache(),
      ].map((clear) => Promise.resolve().then(clear)));
      if (results.some((result) => result.status === 'rejected')) {
        cleanupFailed = true;
        return safeEmpty('UNAVAILABLE', STATUS_MESSAGES.SESSION_CLEAR_FAILED);
      }
      try { await finishCleanup(); } catch {
        cleanupFailed = true;
        return safeEmpty('UNAVAILABLE', STATUS_MESSAGES.SESSION_CLEAR_FAILED);
      }
      cleanupFailed = false;
      return safeEmpty('DISCONNECTED');
    })();
    let wrappedOperation;
    wrappedOperation = operation.finally(() => {
      if (disconnecting === wrappedOperation) disconnecting = null;
    });
    disconnecting = wrappedOperation;
    return wrappedOperation;
  }

  function closeChildren() {
    collection.reset();
    invalidateGeneration();
    activeFinanceController?.abort();financePermit=null;
    settlementController?.abort();settlementPermit=null;insightsController?.abort();insightsPermit=null;csController?.abort();csPermit=null;inventoryController?.abort();inventoryPermit=null;
    void stopShipments();
    currentScope = 'ACTIVE';
    currentChannel = 'ALL';
    currentFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});
    invalidateCursor();
    activeRead = null;
    activeAbortController?.abort();
    if (isLoginWindowActive()) loginWindow.destroy();
    loginWindow = null;
  }

  let findingOrder=false;
  async function findOrder(id){
    if(typeof id!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(id))return {status:'CHECK_REQUIRED'};
    if(findingOrder||activeRead||registrationController||automaticController||disconnecting||cleanupFailed||isLoginWindowActive())return {status:'BUSY'};
    findingOrder=true;let count=0,last,partial=false;
    try{
      currentScope='ACTIVE';currentFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});
      let pending=viewChannel(id.startsWith('HR-CP-')?'COUPANG':'CAFE24'),expected=generation;
      for(const scope of ORDER_SCOPES){
        if(scope!=='ACTIVE'){pending=viewScope(scope);expected=generation;}
        while(true){
          last=await pending;
          if(expected!==generation)return {status:'DISCONNECTED'};
          if(!['READY','PARTIAL'].includes(last?.status))return {status:'CHECK_REQUIRED',page:last};
          count++;
          partial=partial||last.partial;
          if(last.orders.some(order=>order.hubOrderId===id))return {status:'FOUND',page:last};
          if(count>=8)return {status:'SEARCH_LIMIT',page:last};
          if(!last.hasMore)break;
          pending=nextPage();
        }
      }
      return {status:partial?'CHECK_REQUIRED':'NOT_FOUND',page:last};
    }finally{findingOrder=false;}
  }
  async function readServerShippingHistory(){
    const empty=()=>({status:'CHECK_REQUIRED',orders:[]});
    if(serverHistoryRequestActive||disconnecting||cleanupFailed||registrationController||automaticController||findingOrder)return empty();
    const expected=generation,controller=new AbortController();let timer;
    serverHistoryRequestActive=true;businessReads.add(controller);
    try{
      const operation=(async()=>{
        const auth=await recheckPage();
        if(expected!==generation||controller.signal.aborted||!['READY','PARTIAL'].includes(auth.status))return empty();
        const response=await getRemoteSession().fetch(REGISTRATION_URL,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
        if(response.status!==200)return empty();
        const payload=await readBoundedJson(response,controller);
        if(payload?.ok!==true||!Array.isArray(payload.results)||payload.results.length>300)return empty();
        const seen=new Set(),orders=[];
        for(const row of payload.results){
          if(!row||typeof row.hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(row.hubOrderId)||seen.has(row.hubOrderId))return empty();
          if(row.platform!==(row.hubOrderId.startsWith('HR-CP-')?'COUPANG':'CAFE24'))return empty();
          seen.add(row.hubOrderId);orders.push({hubOrderId:row.hubOrderId,status:row.status==='SUCCESS'?'REGISTERED':['QUEUED','PENDING','RUNNING'].includes(row.status)?'PENDING':row.status==='FAILED'?'FAILED':'CHECK_REQUIRED'});
        }
        return {status:'READY',orders};
      })();
      const result=await Promise.race([operation,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty());},timeoutMs);}),new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve(empty()),{once:true}))]);
      return expected===generation&&!disconnecting?result:empty();
    }catch{return empty();}
    finally{clearTimeout(timer);serverHistoryRequestActive=false;businessReads.delete(controller);}
  }
  async function restoreShippingHistory(){
    const expected=generation;
    if(!shipmentDirectory||disconnecting||cleanupFailed||registrationController||automaticController)return {status:'CHECK_REQUIRED',orders:[]};
    const auth=await recheckPage();
    if(expected!==generation||!['READY','PARTIAL'].includes(auth.status))return {status:'CHECK_REQUIRED',orders:[]};
    const result=await readShippingHistory(shipmentDirectory);
    return expected===generation&&!disconnecting?result:{status:'CHECK_REQUIRED',orders:[]};
  }
return Object.freeze({ readCredentialMetadata, saveServerCredential, readCalendarMonth, readInventory, readCs, readInsights, readSettlement, exportSelectedCsv, exportOrdersXlsx, applyOrderSearch, previewLabels, previewWorklist, collectOrders, checkOrderCollection, checkOrderFreshness, readTracking, refreshTracking, readServerShippingHistory, findOrder, restoreShippingHistory, readDelivery, readFinance, readOverview, readTodayCalendar, listBusinesses, connect, refresh, recheckPage, reviewShipment, confirmShipmentReview, issueShipment, issueAndRegister, registerInvoices, checkShipment, previewLabel, nextPage, previousPage, viewChannel, setOrderFilters, resetOrderFilters, viewActive, viewRegistered, viewInTransit, viewCompleted, disconnect, closeChildren });
}

function registerConnectionIpc({ ipcMain, getMainWindow, connection }) {
  for(const [channel,method,write] of [['moaon-hub:read-credential-metadata','readCredentialMetadata',false],['moaon-hub:save-server-credential','saveServerCredential',true]]){
    ipcMain.handle(channel,async(event,...args)=>{
      if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
      if(args.length!==1||!validCredentialInput(args[0],write))return Object.freeze({status:'INVALID'});
      return connection[method](args[0]);
    });
  }
  for(const [channel,method] of [['moaon-hub:read-tracking','readTracking'],['moaon-hub:refresh-tracking','refreshTracking']]){
    ipcMain.handle(channel,async(event,...args)=>{
      if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
      if(args.length!==1||typeof args[0]!=='string'||!/^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/.test(args[0]))throw Error('Invalid tracking arguments');
      return connection[method](args[0]);
    });
  }
  ipcMain.handle('moaon-hub:read-delivery',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    if(args.length!==1||typeof args[0]!=='string'||!/^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/.test(args[0]))throw Error('Invalid delivery arguments');
    return connection.readDelivery(args[0]);
  });
  ipcMain.handle('moaon-hub:preview-worklist',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    if(args.length!==2||!validDocumentIds(args[0])||!['packing','dispatch'].includes(args[1]))throw Error('Invalid worklist arguments');
    return connection.previewWorklist(args[0],args[1]);
  });
  for(const [channel,method,valid] of [['moaon-hub:preview-labels','previewLabels',validRegistrationIds],['moaon-hub:export-selected-csv','exportSelectedCsv',validDocumentIds]]){
    ipcMain.handle(channel,async(event,...args)=>{
      if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
      if(args.length!==1||!valid(args[0]))throw Error('Invalid document arguments');
      return connection[method](args[0]);
    });
  }
  ipcMain.handle('moaon-hub:issue-and-register',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    if(args.length!==1||!validRegistrationIds(args[0]))throw Error('Invalid automatic shipping arguments');
    return connection.issueAndRegister(args[0]);
  });
  ipcMain.handle('moaon-hub:view-channel',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    if(args.length!==1||!ORDER_CHANNELS.includes(args[0]))throw Error('Invalid channel arguments');
    return connection.viewChannel(args[0]);
  });
  ipcMain.handle('moaon-hub:set-order-filters',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    const filters=args[0];
    if(args.length!==1||!filters||typeof filters!=='object'||Array.isArray(filters)||![2,5].includes(Object.keys(filters).length)||typeof filters.delayOnly!=='boolean'||typeof filters.giftOnly!=='boolean'||(Object.keys(filters).length===5&&!validSearch({query:filters.query,start:filters.start,end:filters.end})))throw Error('Invalid filter arguments');
    return connection.setOrderFilters(filters);
  });
  ipcMain.handle('moaon-hub:apply-order-search',async(event,...args)=>{if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');if(args.length!==1||!validSearch(args[0]))throw Error('Invalid search arguments');return connection.applyOrderSearch(args[0]);});
  ipcMain.handle('moaon-hub:reset-order-filters',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    if(args.length)throw Error('Arguments are not allowed');
    return connection.resetOrderFilters();
  });
  ipcMain.handle('moaon-hub:register-invoices',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    if(args.length!==1||!validRegistrationIds(args[0]))throw Error('Invalid registration arguments');
    return connection.registerInvoices(args[0]);
  });
  for(const [channel,method] of [['moaon-hub:find-order','findOrder'],['moaon-hub:preview-label','previewLabel'],['moaon-hub:issue-shipment','issueShipment'],['moaon-hub:check-shipment','checkShipment']]){
    ipcMain.handle(channel,async(event,...args)=>{
      if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
      if(args.length!==1||typeof args[0]!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(args[0]))throw Error('Invalid shipment arguments');
      return connection[method](args[0]);
    });
  }
  ipcMain.handle('moaon-hub:confirm-shipment-review',async(event,...args)=>{
    if(!isTrustedRenderer(event,getMainWindow()))throw Error('Untrusted renderer');
    if(args.length!==1||typeof args[0]!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(args[0]))throw Error('Invalid review arguments');
    return connection.confirmShipmentReview(args[0]);
  });
  const methods = [
    ['moaon-hub:read-calendar-month', 'readCalendarMonth'],
    ['moaon-hub:collect-orders', 'collectOrders'],
    ['moaon-hub:check-order-collection', 'checkOrderCollection'],
    ['moaon-hub:check-order-freshness', 'checkOrderFreshness'],
    ['moaon-hub:server-shipping-history', 'readServerShippingHistory'],
    ['moaon-hub:restore-shipping-history', 'restoreShippingHistory'],
    ['moaon-hub:read-overview', 'readOverview'],
    ['moaon-hub:read-finance', 'readFinance'],
    ['moaon-hub:read-settlement', 'readSettlement'],
    ['moaon-hub:read-insights', 'readInsights'],
    ['moaon-hub:read-inventory', 'readInventory'],
    ['moaon-hub:read-cs', 'readCs'],
    ['moaon-hub:read-today-calendar', 'readTodayCalendar'],
    ['moaon-hub:list-businesses', 'listBusinesses'],
    ['moaon-hub:connect', 'connect'],
    ['moaon-hub:refresh', 'refresh'],
    ['moaon-hub:recheck-page', 'recheckPage'],
    ['moaon-hub:next-page', 'nextPage'],
    ['moaon-hub:previous-page', 'previousPage'],
    ['moaon-hub:view-active', 'viewActive'],
    ['moaon-hub:view-registered', 'viewRegistered'],
    ['moaon-hub:view-in-transit', 'viewInTransit'],
    ['moaon-hub:view-completed', 'viewCompleted'],
    ['moaon-hub:disconnect', 'disconnect'],
    ['moaon-hub:export-orders-xlsx', 'exportOrdersXlsx'],
  ];

  for (const [channel, method] of methods) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedRenderer(event, getMainWindow())) throw new Error('Untrusted renderer');
      if(method==='readCalendarMonth'){
        if(args.length!==1||!require('./today-calendar.cjs').monthRange(args[0]))throw Error('Arguments are not allowed');
        return connection.readCalendarMonth(args[0]);
      }
      if(method==='readSettlement'){
        if(args.length>1||args.length===1&&![7,30,90].includes(args[0]))throw Error('Arguments are not allowed');
        return connection.readSettlement(args.length?args[0]:30);
      }
      if (args.length !== 0) throw new Error('Arguments are not allowed');
      return connection[method]();
    });
  }
}

module.exports = Object.freeze({
  createHubConnection,
  projectOrdersPayload,
  registerConnectionIpc,
});
