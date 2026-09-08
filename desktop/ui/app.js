'use strict';

const orders = [
  {
    id: 'MOAON-S001',
    customer: '김모아',
    product: '바삭 김부각 선물세트',
    option: '3상자 · 샘플',
    amount: '42,000원',
    channel: '데모 스토어',
    status: '상품 준비 전',
    address: '서울시 중구 샘플로 12 · 가상 주소',
    note: '문 앞에 놓아주세요 · 샘플 메모',
  },
  {
    id: 'MOAON-S002',
    customer: '이온유',
    product: '들기름 김 스낵',
    option: '2봉 · 샘플',
    amount: '18,600원',
    channel: '데모 마켓',
    status: '발송 대기 예시',
    address: '경기도 성남시 샘플길 28 · 가상 주소',
    note: '배송 전 연락 · 샘플 메모',
  },
  {
    id: 'MOAON-S003',
    customer: '박하루',
    product: '구운 다시마칩 묶음',
    option: '4봉 · 샘플',
    amount: '25,600원',
    channel: '데모 스토어',
    status: '발송 대기 예시',
    address: '부산시 해운대구 예시로 7 · 가상 주소',
    note: '요청 사항 없음',
  },
];

const navButtons = [...document.querySelectorAll('[data-route]')];
const pages = [...document.querySelectorAll('[data-page]')];
const orderList = document.querySelector('#order-list');
const orderSearch = document.querySelector('#order-search');
const orderEmpty = document.querySelector('#order-empty');
const resultCount = document.querySelector('#order-result-count');
const detailPanel = document.querySelector('#order-detail');
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
const statusbar = document.querySelector('.statusbar');
let selectedOrderId = null;
let selectedOrderButton = null;

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

  if (options.focusHeading) {
    selectedPage.querySelector('h1')?.focus();
  }
}

function closeOrderDetail(options = {}) {
  selectedOrderId = null;
  for (const button of orderList.querySelectorAll('.order-row')) {
    button.setAttribute('aria-pressed', 'false');
  }

  detailPanel.replaceChildren();
  const empty = makeElement('div', 'detail-empty');
  const icon = makeElement('span', '', '▤');
  icon.setAttribute('aria-hidden', 'true');
  empty.append(
    icon,
    makeElement('strong', '', '주문을 선택하세요'),
    makeElement('p', '', '선택한 샘플 주문의 고객, 상품, 배송 정보를 여기에 표시합니다.'),
  );
  detailPanel.append(empty);

  if (options.restoreFocus && selectedOrderButton?.isConnected) {
    selectedOrderButton.focus();
  }
  selectedOrderButton = null;
}

function addDetailSection(parent, title, primary, secondary) {
  const section = makeElement('section', 'detail-section');
  section.append(
    makeElement('h3', '', title),
    makeElement('strong', '', primary),
    makeElement('span', '', secondary),
  );
  parent.append(section);
}

function showOrderDetail(order, button) {
  selectedOrderId = order.id;
  selectedOrderButton = button;

  for (const orderButton of orderList.querySelectorAll('.order-row')) {
    orderButton.setAttribute(
      'aria-pressed',
      String(orderButton.dataset.orderId === selectedOrderId),
    );
  }

  detailPanel.replaceChildren();

  const header = makeElement('header', 'detail-header');
  const heading = makeElement('div');
  heading.append(
    makeElement('span', 'eyebrow', 'SAMPLE DETAIL'),
    makeElement('h2', '', '주문 상세'),
  );
  const closeButton = makeElement('button', '', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '주문 상세 닫기');
  closeButton.addEventListener('click', () => closeOrderDetail({ restoreFocus: true }));
  header.append(heading, closeButton);

  const body = makeElement('div', 'detail-body');
  addDetailSection(body, '주문', order.id, `${order.channel} · ${order.status}`);
  addDetailSection(body, '고객', order.customer, order.address);
  addDetailSection(body, '상품', order.product, `${order.option} · ${order.amount} (샘플)`);
  addDetailSection(body, '배송 메모', order.note, '가상 정보이며 배송에 사용되지 않습니다.');
  body.append(
    makeElement(
      'p',
      'detail-notice',
      '이 시제품에는 송장 발급, 인쇄, 주문 상태 변경 버튼이 없습니다.',
    ),
  );

  detailPanel.append(header, body);
  closeButton.focus();
}

function createOrderRow(order) {
  const button = makeElement('button', 'order-row');
  button.type = 'button';
  button.dataset.orderId = order.id;
  button.setAttribute('aria-pressed', String(order.id === selectedOrderId));
  button.setAttribute(
    'aria-label',
    `${order.id}, ${order.customer}, ${order.product}, ${order.amount}, 샘플 주문 상세 열기`,
  );

  const primary = makeElement('span', 'order-primary');
  primary.append(
    makeElement('strong', '', order.product),
    makeElement('span', '', `${order.id} · ${order.customer}`),
  );

  const secondary = makeElement('span', 'order-secondary');
  secondary.append(
    makeElement('strong', '', order.channel),
    makeElement('span', '', order.status),
  );

  const amount = makeElement('span', 'order-amount');
  amount.append(
    makeElement('strong', '', order.amount),
    makeElement('span', 'order-tag', '샘플'),
  );

  button.append(primary, secondary, amount);
  button.addEventListener('click', () => showOrderDetail(order, button));
  return button;
}

function renderOrders() {
  const query = orderSearch.value.trim().toLocaleLowerCase('ko-KR');
  const visibleOrders = orders.filter((order) => {
    const searchable = [order.id, order.customer, order.product, order.channel]
      .join(' ')
      .toLocaleLowerCase('ko-KR');
    return searchable.includes(query);
  });

  orderList.replaceChildren(...visibleOrders.map(createOrderRow));
  orderList.hidden = visibleOrders.length === 0;
  orderEmpty.hidden = visibleOrders.length !== 0;
  resultCount.textContent = query
    ? `검색 결과 · 샘플 ${visibleOrders.length}건`
    : `샘플 ${visibleOrders.length}건 표시`;

  if (selectedOrderId && !visibleOrders.some((order) => order.id === selectedOrderId)) {
    closeOrderDetail();
  }
}

function applyTheme(theme) {
  const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalizedTheme;
  for (const button of themeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === normalizedTheme));
  }

  try {
    localStorage.setItem('moaon-preview-theme', normalizedTheme);
  } catch {
    // Theme persistence is optional; the visible setting still applies.
  }
}

for (const button of navButtons) {
  button.addEventListener('click', () => showRoute(button.dataset.route, { focusHeading: true }));
}

for (const button of themeButtons) {
  button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
}

orderSearch.addEventListener('input', renderOrders);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selectedOrderId) {
    event.preventDefault();
    closeOrderDetail({ restoreFocus: true });
    return;
  }

  if (event.ctrlKey && event.key.toLocaleLowerCase('en-US') === 'k') {
    event.preventDefault();
    showRoute('orders');
    orderSearch.focus();
    orderSearch.select();
    return;
  }

  if (event.ctrlKey && event.key.toLocaleLowerCase('en-US') === 'p') {
    event.preventDefault();
    statusbar.lastElementChild.textContent = '출력: 시제품에서 비활성';
  }
});

let savedTheme = 'light';
try {
  savedTheme = localStorage.getItem('moaon-preview-theme') || 'light';
} catch {
  savedTheme = 'light';
}

applyTheme(savedTheme);
renderOrders();
