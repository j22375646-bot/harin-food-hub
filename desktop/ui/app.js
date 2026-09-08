'use strict';

const sampleOrders = Object.freeze([
  Object.freeze({ id: 'MOAON-S001', customer: '김모아', product: '바삭 김부각 선물세트', option: '3상자 · 샘플', amount: '42,000원', channel: '데모 스토어', status: '상품 준비 전', address: '서울시 중구 샘플로 12 · 가상 주소', note: '문 앞에 놓아주세요 · 샘플 메모' }),
  Object.freeze({ id: 'MOAON-S002', customer: '이온유', product: '들기름 김 스낵', option: '2봉 · 샘플', amount: '18,600원', channel: '데모 마켓', status: '발송 대기 예시', address: '경기도 성남시 샘플길 28 · 가상 주소', note: '배송 전 연락 · 샘플 메모' }),
  Object.freeze({ id: 'MOAON-S003', customer: '박하루', product: '구운 다시마칩 묶음', option: '4봉 · 샘플', amount: '25,600원', channel: '데모 스토어', status: '발송 대기 예시', address: '부산시 해운대구 예시로 7 · 가상 주소', note: '요청 사항 없음' }),
]);

const scopeDetails = Object.freeze({
  ACTIVE: Object.freeze({ action: 'viewActive', label: '송장 발급 전', range: '저장된 송장 발급 전 주문', title: '송장 발급 전 주문을', description: '저장된 송장 발급 전 주문을 20건씩 조회합니다.' }),
  REGISTER: Object.freeze({ action: 'viewRegistered', label: '송장 등록 후', range: '저장된 송장 등록 후 주문', title: '송장 등록 후 주문을', description: '저장된 송장 등록 후 주문을 20건씩 조회합니다.' }),
  IN_TRANSIT: Object.freeze({ action: 'viewInTransit', label: '배송중', range: '저장된 배송중 주문', title: '배송중 주문을', description: '저장된 배송중 주문을 20건씩 조회합니다.' }),
  COMPLETED: Object.freeze({ action: 'viewCompleted', label: '완료·취소', range: '수집된 완료·취소 주문', title: '완료·취소 주문을', description: '수집된 완료·취소 주문만 20건씩 조회합니다. 전체 이력이나 특정 기간 전체를 뜻하지 않습니다.' }),
});
const scopeByAction = Object.freeze(Object.fromEntries(Object.entries(scopeDetails).map(([scope, detail]) => [detail.action, scope])));
const stageLabels = Object.freeze({
  PAID: '결제완료',
  PREPARING: '준비중',
  READY_TO_SHIP: '출고대기',
  WAITING_FOR_CARRIER: '배송대기중',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  CANCELLED: '취소',
});

const navButtons = [...document.querySelectorAll('[data-route]')];
const pages = [...document.querySelectorAll('[data-page]')];
const orderList = document.querySelector('#order-list');
const orderSearch = document.querySelector('#order-search');
const orderEmpty = document.querySelector('#order-empty');
const resultCount = document.querySelector('#order-result-count');
const detailPanel = document.querySelector('#order-detail');
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
const statusbar = document.querySelector('.statusbar');
const connectionMessages = [...document.querySelectorAll('[data-connection-message]')];
const connectionButtons = [...document.querySelectorAll('[data-action]')];
const statusElements = {
  businessStatus: document.querySelector('#business-status'), businessName: document.querySelector('#business-name'),
  businessDetail: document.querySelector('#business-detail'), topBusinessName: document.querySelector('#top-business-name'),
  global: document.querySelector('#global-connection-status'), globalBadge: document.querySelector('#global-mode-badge'),
  nav: document.querySelector('#orders-nav-detail'), todayContext: document.querySelector('#today-context'),
  todayTitleMode: document.querySelector('#today-title-mode'), todayTitleTail: document.querySelector('#today-title-tail'),
  todayDescription: document.querySelector('#today-description'),
  ordersContext: document.querySelector('#orders-context'), ordersTitleMode: document.querySelector('#orders-title-mode'),
  ordersDescription: document.querySelector('#orders-description'), ordersEyebrow: document.querySelector('#orders-eyebrow'),
  ordersRange: document.querySelector('#orders-range-label'), settingsChip: document.querySelector('#settings-connection-chip'),
  programDataScope: document.querySelector('#program-data-scope'), programNetwork: document.querySelector('#program-network-state'),
  statusbarData: document.querySelector('#statusbar-data'),
};
const sampleOnlySections = [...document.querySelectorAll('[data-sample-only]')];

let selectedOrderId = null;
let selectedOrderButton = null;
let displayMode = 'sample';
let displayedOrders = sampleOrders;
let connectionResult = null;
let actionGeneration = 0;
let selectedScope = 'ACTIVE';
let scopeControlsAvailable = false;

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function showRoute(route, options = {}) {
  const selectedPage = pages.find((page) => page.dataset.page === route);
  if (!selectedPage) return;
  for (const button of navButtons) {
    const active = button.dataset.route === route;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const page of pages) {
    const active = page === selectedPage;
    page.hidden = !active;
    page.classList.toggle('is-visible', active);
  }
  if (options.focusHeading) selectedPage.querySelector('h1')?.focus();
}

const isSampleMode = () => displayMode === 'sample';
const orderId = (order) => isSampleMode() ? order.id : order.hubOrderId;
const formatNumber = (value, suffix = '') => typeof value === 'number' && Number.isFinite(value)
  ? `${value.toLocaleString('ko-KR')}${suffix}` : '확인 필요';
const stageLabel = (stage) => stageLabels[stage] || '상태 확인 필요';
const selectedScopeDetail = () => scopeDetails[selectedScope];

function formatTime(value) {
  if (!value) return '확인 시각 없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '확인 시각 확인 필요' : date.toLocaleString('ko-KR', { hour12: false });
}

function closeOrderDetail(options = {}) {
  selectedOrderId = null;
  for (const button of orderList.querySelectorAll('.order-row')) button.setAttribute('aria-pressed', 'false');
  detailPanel.replaceChildren();
  const empty = makeElement('div', 'detail-empty');
  const icon = makeElement('span', '', '▤');
  icon.setAttribute('aria-hidden', 'true');
  const description = isSampleMode()
    ? '선택한 샘플 주문의 고객, 상품, 배송 정보를 여기에 표시합니다.'
    : displayMode === 'live' ? `선택한 ${selectedScopeDetail().range}의 허용된 정보만 표시합니다.` : '연결 상태를 확인한 뒤 주문을 조회하세요.';
  empty.append(icon, makeElement('strong', '', '주문을 선택하세요'), makeElement('p', '', description));
  detailPanel.append(empty);
  if (options.restoreFocus && selectedOrderButton?.isConnected) selectedOrderButton.focus();
  selectedOrderButton = null;
}

function addDetailSection(parent, title, primary, secondary) {
  const section = makeElement('section', 'detail-section');
  section.append(makeElement('h3', '', title), makeElement('strong', '', primary), makeElement('span', '', secondary));
  parent.append(section);
}

function showOrderDetail(order, button) {
  selectedOrderId = orderId(order);
  selectedOrderButton = button;
  for (const orderButton of orderList.querySelectorAll('.order-row')) {
    orderButton.setAttribute('aria-pressed', String(orderButton.dataset.orderId === selectedOrderId));
  }
  detailPanel.replaceChildren();
  const header = makeElement('header', 'detail-header');
  const heading = makeElement('div');
  heading.append(makeElement('span', 'eyebrow', isSampleMode() ? 'SAMPLE DETAIL' : 'HARIN READ ONLY'), makeElement('h2', '', '주문 상세'));
  const closeButton = makeElement('button', '', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '주문 상세 닫기');
  closeButton.addEventListener('click', () => closeOrderDetail({ restoreFocus: true }));
  header.append(heading, closeButton);
  const body = makeElement('div', 'detail-body');
  if (isSampleMode()) {
    addDetailSection(body, '주문', order.id, `${order.channel} · ${order.status}`);
    addDetailSection(body, '고객', order.customer, order.address);
    addDetailSection(body, '상품', order.product, `${order.option} · ${order.amount} (샘플)`);
    addDetailSection(body, '배송 메모', order.note, '가상 정보이며 배송에 사용되지 않습니다.');
    body.append(makeElement('p', 'detail-notice', '이 시제품에는 송장 발급, 인쇄, 주문 상태 변경 버튼이 없습니다.'));
  } else {
    addDetailSection(body, '주문', order.hubOrderId || '주문번호 확인 필요', `${order.platform || '채널 확인 필요'} · ${stageLabel(order.stage)}`);
    addDetailSection(body, '상품', order.productName || '상품 정보 확인 필요', `${formatNumber(order.quantity, '개')} · ${formatNumber(order.amount, '원')}`);
    addDetailSection(body, '주문 시각', order.orderedAt ? formatTime(order.orderedAt) : '확인 필요', `목록 확인 ${formatTime(connectionResult?.checkedAt)}`);
    body.append(makeElement('p', 'detail-notice', `${selectedScopeDetail().description} 플랫폼 동기화 성공을 의미하지 않으며 발급·변경·전송 기능은 없습니다.`));
  }
  detailPanel.append(header, body);
  closeButton.focus();
}

function createOrderRow(order) {
  const id = orderId(order);
  const button = makeElement('button', 'order-row');
  button.type = 'button';
  button.dataset.orderId = id;
  button.setAttribute('aria-pressed', String(id === selectedOrderId));
  const primary = makeElement('span', 'order-primary');
  const secondary = makeElement('span', 'order-secondary');
  const amount = makeElement('span', 'order-amount');
  if (isSampleMode()) {
    button.setAttribute('aria-label', `${order.id}, ${order.customer}, ${order.product}, ${order.amount}, 샘플 주문 상세 열기`);
    primary.append(makeElement('strong', '', order.product), makeElement('span', '', `${order.id} · ${order.customer}`));
    secondary.append(makeElement('strong', '', order.channel), makeElement('span', '', order.status));
    amount.append(makeElement('strong', '', order.amount), makeElement('span', 'order-tag', '샘플'));
  } else {
    const product = order.productName || '상품 정보 확인 필요';
    const channel = order.platform || '채널 확인 필요';
    const stage = stageLabel(order.stage);
    button.setAttribute('aria-label', `${id || '주문번호 확인 필요'}, ${product}, ${channel}, ${stage}, 조회 전용 주문 상세 열기`);
    primary.append(makeElement('strong', '', product), makeElement('span', '', id || '주문번호 확인 필요'));
    secondary.append(makeElement('strong', '', channel), makeElement('span', '', stage));
    amount.append(makeElement('strong', '', formatNumber(order.amount, '원')), makeElement('span', 'order-tag live-tag', '조회 전용'));
  }
  button.append(primary, secondary, amount);
  button.addEventListener('click', () => showOrderDetail(order, button));
  return button;
}

function renderOrders() {
  const query = orderSearch.value.trim().toLocaleLowerCase('ko-KR');
  const visibleOrders = displayedOrders.filter((order) => {
    const fields = isSampleMode()
      ? [order.id, order.customer, order.product, order.channel]
      : [order.hubOrderId, order.productName, order.platform, order.stage, stageLabel(order.stage)];
    return fields.join(' ').toLocaleLowerCase('ko-KR').includes(query);
  });
  orderList.replaceChildren(...visibleOrders.map(createOrderRow));
  orderList.hidden = visibleOrders.length === 0;
  orderEmpty.hidden = visibleOrders.length !== 0;
  if (isSampleMode()) {
    resultCount.textContent = query ? `검색 결과 · 샘플 ${visibleOrders.length}건` : `샘플 ${visibleOrders.length}건 표시`;
    orderEmpty.textContent = '검색 결과가 없습니다. 다른 주문번호, 고객명 또는 상품명을 입력하세요.';
  } else if (displayMode === 'live') {
    resultCount.textContent = query ? `현재 페이지 검색 · ${visibleOrders.length}건` : `현재 페이지 ${displayedOrders.length}건`;
    orderEmpty.textContent = query ? '현재 페이지에서 검색 결과가 없습니다.' : '현재 페이지에 표시할 주문이 없습니다.';
  } else {
    resultCount.textContent = displayMode === 'connecting' ? '연결 확인 중 · 주문 목록 비움' : '표시 중인 실제 주문 없음';
    orderEmpty.textContent = displayMode === 'connecting' ? '하린식품 연결 상태를 확인하고 있습니다.' : '연결 상태를 확인하거나 샘플 화면으로 돌아가세요.';
  }
  if (selectedOrderId && !visibleOrders.some((order) => orderId(order) === selectedOrderId)) closeOrderDetail();
  else if (selectedOrderId) selectedOrderButton = [...orderList.querySelectorAll('.order-row')].find((button) => button.dataset.orderId === selectedOrderId) || null;
}

function setButtons(mode) {
  const busy = mode === 'connecting';
  for (const button of connectionButtons) {
    const action = button.dataset.action;
    button.disabled = busy && action !== 'hub-disconnect';
    if (action === 'hub-connect') button.hidden = !['sample', 'error', 'disconnected'].includes(mode);
    if (action === 'hub-refresh') button.hidden = !['live', 'error'].includes(mode);
    if (action === 'hub-previousPage') {
      button.hidden = mode !== 'live';
      button.disabled = busy || connectionResult?.hasPrevious !== true;
    }
    if (action === 'hub-nextPage') {
      button.hidden = mode !== 'live';
      button.disabled = busy || connectionResult?.hasMore !== true;
    }
    if (action.startsWith('hub-view')) {
      button.hidden = !scopeControlsAvailable;
      button.disabled = busy;
      button.setAttribute('aria-pressed', String(scopeByAction[action.replace('hub-', '')] === selectedScope));
    }
    if (action === 'hub-disconnect') button.hidden = !['connecting', 'live', 'error'].includes(mode);
    if (action === 'sample-mode') button.hidden = mode === 'sample';
  }
}

function updateConnectionChrome(message) {
  const live = displayMode === 'live';
  const sample = displayMode === 'sample';
  const partial = connectionResult?.status === 'PARTIAL';
  const pageStart = live && displayedOrders.length ? connectionResult.offset + 1 : 0;
  const pageEnd = live ? connectionResult.offset + displayedOrders.length : 0;
  const scope = selectedScopeDetail();
  const pageRange = live ? `${pageStart.toLocaleString('ko-KR')}–${pageEnd.toLocaleString('ko-KR')} / ${scope.range} ${connectionResult.total.toLocaleString('ko-KR')}건` : '';
  statusElements.businessStatus.textContent = sample ? '가상 사업장' : live ? '조회 전용' : '연결 확인';
  statusElements.businessName.textContent = live ? '하린식품' : sample ? '모아온 데모' : '하린식품';
  statusElements.businessDetail.textContent = live ? `${scope.label} ${pageStart.toLocaleString('ko-KR')}–${pageEnd.toLocaleString('ko-KR')}` : sample ? '시험 자료만 표시 중' : '실제 주문 표시 안 함';
  statusElements.topBusinessName.textContent = live ? '하린식품' : sample ? '모아온 데모' : '하린식품';
  statusElements.global.textContent = live ? `하린식품 · 저장 주문 조회 전용${partial ? ' · 부분 확인' : ''}` : sample ? '시험 자료 · 하린식품 연결 안 됨' : message;
  statusElements.globalBadge.textContent = live ? '조회' : sample ? '시험' : '확인';
  statusElements.nav.textContent = live ? `${scope.label} ${pageStart.toLocaleString('ko-KR')}–${pageEnd.toLocaleString('ko-KR')}` : sample ? '샘플 주문 3건' : '실제 주문 표시 안 함';
  statusElements.todayContext.textContent = live ? `하린식품 · ${scope.range} · ${formatTime(connectionResult.checkedAt)} 확인` : sample ? 'Windows 시제품 · 샘플 모드' : '하린식품 · 연결 상태 확인 필요';
  statusElements.todayTitleMode.textContent = live ? '하린식품 주문을' : sample ? '지금 가능한 일' : '실제 주문을 비우고';
  statusElements.todayTitleTail.textContent = live ? ' 조회 전용으로 확인합니다' : sample ? '부터 확인하세요' : ' 연결 상태를 확인합니다';
  statusElements.todayDescription.textContent = live ? `${scope.description} 플랫폼 동기화 성공이나 전체 주문 현황을 뜻하지 않습니다.` : sample ? '실제 사업장에 연결하기 전, 앱의 화면 구조와 기본 조작만 안전하게 살펴봅니다.' : message;
  statusElements.ordersContext.textContent = live ? `하린식품 · ${scope.range} · ${formatTime(connectionResult.checkedAt)} 확인` : sample ? '주문·배송 · 샘플 3건' : '하린식품 · 연결 상태 확인 필요';
  statusElements.ordersTitleMode.textContent = live ? scope.title : sample ? '가상 주문만' : scopeControlsAvailable ? scope.title : '비운 목록을';
  statusElements.ordersDescription.textContent = live ? `${scope.description} 검색은 현재 페이지에만 적용되며 플랫폼 동기화·실업무 처리 화면이 아닙니다.` : sample ? '검색하거나 주문을 선택해 우측 상세를 확인할 수 있습니다. 발급과 상태 변경은 없습니다.' : message;
  statusElements.ordersEyebrow.textContent = live ? 'HARIN STORED ORDERS · READ ONLY' : sample ? 'SAMPLE ORDERS' : 'NO LIVE DATA';
  statusElements.ordersRange.textContent = live ? pageRange : sample ? '실제 발급 버튼 없음' : '실제 주문 자료 비움';
  statusElements.settingsChip.textContent = live ? partial ? '부분 확인' : '조회 전용' : sample ? '샘플' : '확인 필요';
  statusElements.settingsChip.className = `status-chip ${live && !partial ? 'status-ready' : sample ? 'status-sample' : 'status-blocked'}`;
  statusElements.programDataScope.textContent = live ? `하린식품 · ${scope.label} 페이지 조회` : sample ? '가상 사업장 · 샘플 주문' : '실제 주문 표시 안 함';
  statusElements.programNetwork.textContent = live ? '명시적 조회만' : sample ? '연결 안 됨' : '연결 상태 확인 필요';
  statusElements.statusbarData.textContent = live ? `데이터: 하린식품 저장 주문 조회 전용 · ${formatTime(connectionResult.checkedAt)}` : sample ? '데이터: 시험 자료 · 네트워크 연결 없음' : '데이터: 실제 주문 자료 비움';
  for (const section of sampleOnlySections) section.hidden = !sample;
  for (const element of connectionMessages) element.textContent = message;
  setButtons(displayMode);
}

function clearDisplayedOrders(mode, message) {
  displayMode = mode;
  displayedOrders = Object.freeze([]);
  connectionResult = null;
  orderSearch.value = '';
  closeOrderDetail();
  renderOrders();
  updateConnectionChrome(message);
}

function applyHubResult(result) {
  if (result?.status === 'READY' || result?.status === 'PARTIAL') {
    if (scopeDetails[result.scope]) selectedScope = result.scope;
    scopeControlsAvailable = true;
    displayMode = 'live';
    connectionResult = result;
    displayedOrders = Object.freeze(result.orders.map((order) => Object.freeze({
      hubOrderId: typeof order.hubOrderId === 'string' ? order.hubOrderId : '', platform: typeof order.platform === 'string' ? order.platform : '',
      productName: typeof order.productName === 'string' ? order.productName : '', stage: typeof order.stage === 'string' ? order.stage : '',
      quantity: typeof order.quantity === 'number' && Number.isFinite(order.quantity) ? order.quantity : null,
      amount: typeof order.amount === 'number' && Number.isFinite(order.amount) ? order.amount : null,
      orderedAt: typeof order.orderedAt === 'string' ? order.orderedAt : null,
    })));
    orderSearch.value = '';
    closeOrderDetail();
    renderOrders();
    updateConnectionChrome(result.message);
    return;
  }
  if (result?.status === 'LOGIN_OPEN') {
    scopeControlsAvailable = false;
    clearDisplayedOrders('connecting', result.message || '하린식품 로그인 창에서 로그인을 완료하세요.');
    return;
  }
  if (['LOGIN_REQUIRED', 'FORBIDDEN', 'DISCONNECTED'].includes(result?.status)) scopeControlsAvailable = false;
  clearDisplayedOrders(result?.status === 'DISCONNECTED' ? 'disconnected' : 'error', result?.message || '주문 조회를 완료하지 못했습니다. 잠시 후 다시 확인하세요.');
}

async function runHubAction(action) {
  const generation = ++actionGeneration;
  const requestedScope = scopeByAction[action];
  if (requestedScope) {
    selectedScope = requestedScope;
    scopeControlsAvailable = true;
    clearDisplayedOrders('connecting', `${selectedScopeDetail().range} 첫 페이지를 조회하고 있습니다.`);
  }
  if (action === 'connect' || action === 'refresh') {
    if (action === 'connect') scopeControlsAvailable = false;
    clearDisplayedOrders('connecting', action === 'connect' ? '별도 하린식품 로그인 창을 확인하세요. 로그인 완료 후 저장 주문을 조회합니다.' : `${selectedScopeDetail().range}을 다시 조회하고 있습니다.`);
  }
  if (action === 'nextPage' || action === 'previousPage') clearDisplayedOrders('connecting', action === 'nextPage' ? '다음 주문 페이지를 조회하고 있습니다.' : '이전 주문 페이지를 조회하고 있습니다.');
  if (action === 'disconnect') {
    selectedScope = 'ACTIVE';
    scopeControlsAvailable = false;
    clearDisplayedOrders('connecting', '실제 주문을 비우고 연결 정보를 지우고 있습니다.');
  }
  try {
    const bridge = window.moaonHub;
    if (!bridge || typeof bridge[action] !== 'function') throw new Error('Bridge unavailable');
    const result = await bridge[action]();
    if (generation === actionGeneration) applyHubResult(result);
  } catch {
    if (generation === actionGeneration) clearDisplayedOrders('error', '하린식품 연결 요청을 완료하지 못했습니다.');
  }
}

async function returnToSample() {
  const generation = ++actionGeneration;
  clearDisplayedOrders('connecting', '실제 주문을 비우고 샘플 화면으로 돌아가고 있습니다.');
  try { await window.moaonHub?.disconnect?.(); } catch { /* Local sample reset remains available. */ }
  if (generation !== actionGeneration) return;
  displayMode = 'sample';
  selectedScope = 'ACTIVE';
  scopeControlsAvailable = false;
  displayedOrders = sampleOrders;
  connectionResult = null;
  orderSearch.value = '';
  closeOrderDetail();
  renderOrders();
  updateConnectionChrome('현재는 샘플 화면입니다. 사용자가 연결을 누르기 전에는 운영 서버를 조회하지 않습니다.');
}

function applyTheme(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalizedTheme;
  for (const button of themeButtons) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === normalizedTheme));
  try { localStorage.setItem('moaon-preview-theme', normalizedTheme); } catch { /* Visible theme still applies. */ }
}

for (const button of navButtons) button.addEventListener('click', () => showRoute(button.dataset.route, { focusHeading: true }));
for (const button of themeButtons) button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
for (const button of connectionButtons) button.addEventListener('click', () => button.dataset.action === 'sample-mode' ? void returnToSample() : void runHubAction(button.dataset.action.replace('hub-', '')));
orderSearch.addEventListener('input', renderOrders);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selectedOrderId) { event.preventDefault(); closeOrderDetail({ restoreFocus: true }); return; }
  if (event.ctrlKey && event.key.toLocaleLowerCase('en-US') === 'k') { event.preventDefault(); showRoute('orders'); orderSearch.focus(); orderSearch.select(); return; }
  if (event.ctrlKey && event.key.toLocaleLowerCase('en-US') === 'p') { event.preventDefault(); statusbar.lastElementChild.textContent = '출력: 이 버전에서 비활성'; }
});

let savedTheme = 'light';
try { savedTheme = localStorage.getItem('moaon-preview-theme') || 'light'; } catch { savedTheme = 'light'; }
applyTheme(savedTheme);
closeOrderDetail();
renderOrders();
updateConnectionChrome('현재는 샘플 화면입니다. 사용자가 연결을 누르기 전에는 운영 서버를 조회하지 않습니다.');
