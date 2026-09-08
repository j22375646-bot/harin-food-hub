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
  let cleanupFailed = false;
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

    loginWindow = new BrowserWindow({
      parent,
      modal: true,
      width: 520,
      height: 720,
      minWidth: 440,
      minHeight: 620,
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

    windowAtOpen.loadURL(LOGIN_URL).catch(() => {
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
      if (!remoteSession) return safeEmpty('DISCONNECTED');
      const results = await Promise.allSettled([
        () => remoteSession.clearStorageData(),
        () => remoteSession.clearCache(),
        () => remoteSession.clearAuthCache(),
      ].map((clear) => Promise.resolve().then(clear)));
      if (results.some((result) => result.status === 'rejected')) {
        cleanupFailed = true;
        return safeEmpty('UNAVAILABLE', STATUS_MESSAGES.SESSION_CLEAR_FAILED);
      }
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

  return Object.freeze({ connect, refresh, nextPage, previousPage, viewActive, viewRegistered, viewInTransit, viewCompleted, disconnect, closeChildren });
}

function registerConnectionIpc({ ipcMain, getMainWindow, connection }) {
  const methods = [
    ['moaon-hub:connect', 'connect'],
    ['moaon-hub:refresh', 'refresh'],
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
