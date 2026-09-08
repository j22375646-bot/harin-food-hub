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

  const orders = Object.freeze(payload.orders.map((order) => Object.freeze({
    hubOrderId: safeString(order?.hubOrderId),
    platform: safeString(order?.platform),
    productName: safeString(order?.productName),
    stage: safeString(order?.stage),
    quantity: safeFiniteNumber(order?.quantity),
    amount: safeFiniteNumber(order?.amount),
    orderedAt: order?.orderedAt === null ? null : safeString(order?.orderedAt),
    details: projectOrderDetails(order),
    preflight: projectPreflight(order, payload.partial),
  })));
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
        invalidateCursor();
        return safeEmpty('LOGIN_REQUIRED');
      }
      if (response.status === 403) {
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

  function viewScope(scope) {
    const blocked = blockedReadResult();
    if (blocked) return blocked;
    if (scope === currentScope) return refresh();
    generation += 1;
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
        [class*="loginPage"] { padding: 16px !important; min-height: 100vh !important; }
        [class*="loginFrame"] { display: flex !important; flex-direction: column !important; min-height: 0 !important; width: 100% !important; animation: none !important; }
        [class*="loginHero"], [class*="frameFooter"], [class*="ownerAccess"] { display: none !important; }
        [class*="loginTopbar"] { min-height: 72px !important; padding: 14px 22px !important; }
        [class*="loginAccess"] { padding: 24px !important; }
        [class*="accessHeader"] > span { display: none !important; }
        [class*="accessHeader"] h2 { margin: 0 !important; font-size: 25px !important; }
        [class*="accessHeader"] p { margin-top: 8px !important; }
        [class*="loginForm"] { margin-top: 22px !important; }
        [class*="sessionNote"] { margin-top: 18px !important; padding-top: 16px !important; }
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
    currentScope = 'ACTIVE';
    invalidateCursor();
    activeRead = null;
    activeAbortController?.abort();
    if (isLoginWindowActive()) loginWindow.destroy();
    loginWindow = null;

    const operation = (async () => {
      try {
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
    currentScope = 'ACTIVE';
    invalidateCursor();
    activeRead = null;
    activeAbortController?.abort();
    if (isLoginWindowActive()) loginWindow.destroy();
    loginWindow = null;
  }

  return Object.freeze({ connect, refresh, recheckPage, reviewShipment, nextPage, previousPage, viewActive, viewRegistered, viewInTransit, viewCompleted, disconnect, closeChildren });
}

function registerConnectionIpc({ ipcMain, getMainWindow, connection }) {
  const methods = [
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
