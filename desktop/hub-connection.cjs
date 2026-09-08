'use strict';

const {
  HARIN_ORIGIN,
  LOGIN_URL,
  ORDER_SCOPES,
  READONLY_PARTITION,
  buildOrdersPageUrl,
  buildOrdersScopeUrl,
  isAllowedRemoteRequest,
  isTrustedRenderer,
} = require('./connection-policy.cjs');

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 20;
const SNAPSHOT_PATTERN = /^[0-9a-f]{64}$/;
const EMPTY_ORDERS = Object.freeze([]);
const {createShipmentRegistry}=require('./shipment-registry.cjs');
const {createShipmentTransport}=require('./shipment-transport.cjs');
const {createBusinessTransport}=require('./business-transport.cjs');
const {createHash}=require('node:crypto');
// Private identity-bound fingerprint, never included in IPC payloads or logs.
const shipmentFingerprints=new WeakMap();
const labelReceivers=new WeakMap();

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
    });
    const inputs={};
    for(const key of ['hubOrderId','platform','fulfillment','externalOrderId','shipmentId','productName','quantity','items','receiver','invoiceNumber','issuedInvoiceNumber','invoice','stage','cancelled','cancellationRequested'])inputs[key]=order?.[key]??null;
    shipmentFingerprints.set(projected,createHash('sha256').update(JSON.stringify(inputs)).digest('hex'));
    labelReceivers.set(projected,Object.freeze({...order?.receiver}));
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
}) {
  if (!BrowserWindow || !session || typeof getMainWindow !== 'function') {
    throw new TypeError('Hub connection dependencies are required');
  }

  let remoteSession = null;
  let policyInstalled = false;
  let loginWindow = null;
  let loginPromise = null;
  let activeRead = null;
  let activeAbortController = null;
  let disconnecting = null;
  let cleanupFailed = initialCleanupPending;
  let generation = 0;
  let pageCursor = null;
  let currentScope = 'ACTIVE';
  let reviewingShipment = false;
  let shipmentRegistry=null;
  let shipmentDrain=Promise.resolve();
  const shipmentPermits=new Map();
  const shipmentAuthReads=new Set();
  const businessReads=new Set();
  let activeOverview=null;
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
      if(authStatus){generation++;invalidateCursor();activeAbortController?.abort();void stopShipments();return empty(authStatus);}
      return result;
    })();
    let tracked;tracked=operation.finally(()=>{clearTimeout(timer);businessReads.delete(controller);if(activeOverview===tracked)activeOverview=null;});
    activeOverview=tracked;return tracked;
  }
  async function listBusinesses(){
    const empty=status=>Object.freeze({status,businesses:Object.freeze([])});
    if(disconnecting||cleanupFailed)return empty('DISCONNECTED');
    if(isLoginWindowActive())return empty('LOGIN_REQUIRED');
    const expected=generation,controller=new AbortController();businessReads.add(controller);
    try{
      const read=createBusinessTransport({fetch:(url,options)=>getRemoteSession().fetch(url,options)});
      const result=await read({signal:controller.signal});
      return expected===generation?result:empty('DISCONNECTED');
    }finally{businessReads.delete(controller);}
  }
  function stopShipments() {
    for(const controller of businessReads)controller.abort();
    labelPreview?.close();
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
          if([401,403].includes(response.status)){generation++;invalidateCursor();void stopShipments();}
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
  }

  async function performRead(readGeneration, { url, requestedOffset, expectedSnapshot, scope }) {
    const controller = new AbortController();
    activeAbortController = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await getRemoteSession().fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
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

      const payload = await readBoundedJson(response, controller);
      if (readGeneration !== generation) return safeEmpty('DISCONNECTED');
      const result = projectOrdersPayload(payload, now().toISOString(), { requestedOffset, expectedSnapshot, scope });
      pageCursor = Object.freeze({
        offset: payload.offset,
        nextOffset: payload.nextOffset,
        snapshot: payload.snapshot,
        scope,
      });
      return result;
    } catch {
      if (readGeneration === generation) invalidateCursor();
      return readGeneration === generation
        ? safeEmpty('UNAVAILABLE')
        : safeEmpty('DISCONNECTED');
    } finally {
      clearTimeout(timeout);
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
    return startRead({ url: buildOrdersScopeUrl(currentScope), requestedOffset: 0, expectedSnapshot: null, scope: currentScope });
  }

  function nextPage() {
    if (activeRead) return activeRead;
    const cursor = pageCursor;
    if (!cursor || cursor.nextOffset === null) {
      return Promise.resolve(safeEmpty('UNAVAILABLE', '이동할 다음 주문 페이지가 없습니다. 첫 페이지를 다시 조회하세요.'));
    }
    return startRead({
      url: buildOrdersPageUrl(cursor.nextOffset, cursor.snapshot, currentScope),
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
      url: buildOrdersPageUrl(previousOffset, cursor.snapshot, currentScope),
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
    return startRead({url:buildOrdersPageUrl(cursor.offset,cursor.snapshot,currentScope),requestedOffset:cursor.offset,expectedSnapshot:cursor.snapshot,scope:currentScope});
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
  async function previewLabel(hubOrderId){
    if(typeof hubOrderId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(hubOrderId))throw Error('Invalid label order');
    const expected=generation;
    const readTarget=async()=>{
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
      const result=await labelPreview.open({hubOrderId,trackingNo:order.details.invoice.number,expectedReceiver:labelReceivers.get(order),validate:async()=>{
        const latest=await readTarget();return !!latest&&shipmentFingerprints.get(latest)===shipmentFingerprints.get(order);
      }});
      return expected===generation?result:{status:'DISCONNECTED'};
    }catch{return {status:'PRINT_UNAVAILABLE'};}
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
    generation += 1;
    void stopShipments();
    currentScope = scope;
    invalidateCursor();
    activeRead = null;
    activeAbortController?.abort();
    return startRead({ url: buildOrdersScopeUrl(scope), requestedOffset: 0, expectedSnapshot: null, scope });
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
        [class*="loginPage"] { padding: 22px !important; min-height: 100vh !important; background:var(--login-canvas,#f3f6fa) !important; }
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
    generation += 1;
    const shipmentShutdown=stopShipments();
    currentScope = 'ACTIVE';
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
    generation += 1;
    void stopShipments();
    currentScope = 'ACTIVE';
    invalidateCursor();
    activeRead = null;
    activeAbortController?.abort();
    if (isLoginWindowActive()) loginWindow.destroy();
    loginWindow = null;
  }

  return Object.freeze({ readOverview, listBusinesses, connect, refresh, recheckPage, reviewShipment, confirmShipmentReview, issueShipment, checkShipment, previewLabel, nextPage, previousPage, viewActive, viewRegistered, viewInTransit, viewCompleted, disconnect, closeChildren });
}

function registerConnectionIpc({ ipcMain, getMainWindow, connection }) {
  for(const [channel,method] of [['moaon-hub:preview-label','previewLabel'],['moaon-hub:issue-shipment','issueShipment'],['moaon-hub:check-shipment','checkShipment']]){
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
    ['moaon-hub:read-overview', 'readOverview'],
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
  ];

  for (const [channel, method] of methods) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedRenderer(event, getMainWindow())) throw new Error('Untrusted renderer');
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
