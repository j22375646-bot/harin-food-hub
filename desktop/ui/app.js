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
const orderChannel = document.querySelector('#order-channel');
const orderSort = document.querySelector('#order-sort');
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
const selectedOrderIds = new Set();
let registrationBusy = false;
let selectedChannel = 'ALL';
let serverFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});
let selectedOrderButton = null;
let displayMode = 'sample';
let collectionState=null,collectionBusy=false,collectionGeneration=0;
const collectionShipmentLocks=new Set();
let displayedOrders = sampleOrders;
let connectionResult = null;
let actionGeneration = 0;
let freshnessGeneration = 0;
let freshnessChanged = false;
let freshnessReloadBusy = false;
let selectedScope = 'ACTIVE';
let scopeControlsAvailable = false;
let businessGeneration=0,businessLoaded=false,businessBusy=false;
let overviewValues={},overviewGeneration=0,overviewBusy=false,overviewLastAttempt=0;
let calendarGeneration=0,calendarBusy=false,calendarLastAttempt=0;
let financeValue=null,financeGeneration=0,financeBusy=false,financeLastAttempt=0;
const financeDetails=Object.freeze({sales:{label:'이번 달 결제 매출',note:'결제 기준'},profit:{label:'이번 달 계산 이익',note:'계산 기준'},balance:{label:'향후 30일 예상 잔액',note:'추정치 · 실제 정산 아님'}});
function renderFinance(){
 const section=document.querySelector('#finance-panel'),cards=document.querySelector('#finance-cards');section.hidden=displayMode!=='live';document.querySelector('#finance-refresh').disabled=financeBusy||displayMode!=='live';
 cards.replaceChildren(...Object.entries(financeDetails).map(([key,detail])=>{const metric=financeValue?.metrics?.[key],known=['READY','PARTIAL'].includes(metric?.status)&&typeof metric.value==='number'&&Number.isFinite(metric.value),card=makeElement('article','finance-card');card.dataset.finance=key;card.dataset.state=known?metric.status:'BLOCKED';if(key==='profit'&&known&&metric.value<0)card.dataset.negative='true';card.append(makeElement('span','',detail.label),makeElement('strong','',known?`${metric.value.toLocaleString('ko-KR')}원`:'확인 필요'),makeElement('small','',known?`${metric.status==='PARTIAL'?'부분 확인 · ':''}${detail.note}`:'누락된 금액을 숫자로 판단하지 마세요.'));return card;}));
 const month=financeValue?.month?.match(/^(\d{4})-(\d{2})$/),checked=financeValue?.generatedAt;document.querySelector('#finance-meta').textContent=month&&checked?`${month[1]}년 ${Number(month[2])}월 · ${formatTime(checked)} 확인`:'기준 월과 조회 시각을 확인할 수 없습니다.';
}
function clearFinance(){financeGeneration++;financeValue=null;financeBusy=false;financeLastAttempt=0;document.querySelector('#finance-status').textContent='조회하지 않은 금액은 확인 필요로 표시합니다.';renderFinance();}
async function refreshFinance(){if(financeBusy||displayMode!=='live')return;const expected=++financeGeneration;financeBusy=true;financeLastAttempt=Date.now();financeValue=null;renderFinance();const status=document.querySelector('#finance-status');status.textContent='이번 달 자금 판단을 확인하고 있습니다…';try{const result=await window.moaonHub.readFinance();if(expected!==financeGeneration)return;if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}if(result?.status!=='READY'){status.textContent='금액을 확인하지 못했습니다. 다시 확인해 주세요.';return;}financeValue=result;status.textContent=Object.values(result.metrics).some(metric=>metric.status!=='READY')?'부분 확인 또는 확인 필요 항목은 금액을 확정해 판단하지 마세요.':'서버 계산 기준의 조회 결과입니다.';}catch{if(expected===financeGeneration)status.textContent='금액을 확인하지 못했습니다. 다시 확인해 주세요.';}finally{if(expected===financeGeneration){financeBusy=false;renderFinance();}}}
document.querySelector('#finance-refresh').addEventListener('click',refreshFinance);
function clearTodayCalendar(){calendarGeneration++;calendarBusy=false;calendarLastAttempt=0;document.querySelector('#calendar-list').replaceChildren();document.querySelector('#calendar-status').textContent='연결 후 오늘 일정을 확인합니다.';document.querySelector('#today-calendar').hidden=true;}
async function refreshTodayCalendar(){
 if(calendarBusy||displayMode!=='live')return;
 const expected=++calendarGeneration;calendarBusy=true;calendarLastAttempt=Date.now();
 const section=document.querySelector('#today-calendar'),button=document.querySelector('#calendar-refresh'),status=document.querySelector('#calendar-status'),list=document.querySelector('#calendar-list');
 section.hidden=false;button.disabled=true;list.replaceChildren();status.textContent='오늘 일정을 불러오는 중입니다…';
 try{
  const result=await window.moaonHub.readTodayCalendar();if(expected!==calendarGeneration)return;
  if(['LOGIN_REQUIRED','FORBIDDEN','DISCONNECTED'].includes(result?.status)){applyHubResult(result);return;}
  if(result?.status!=='READY'){status.textContent='일정을 확인하지 못했습니다. 다시 조회해 주세요.';return;}
  status.textContent=result.date+' · 한국 시간 기준 · '+(result.entries.length?result.entries.length+'건':'오늘 등록된 일정이 없습니다.');
  list.replaceChildren(...result.entries.map(entry=>{
   const row=makeElement('li'),time=makeElement('time'),title=makeElement('span'),state=makeElement('span');
   time.textContent=entry.time||'종일';title.textContent=entry.title;state.textContent=entry.status==='DONE'?'완료':'예정';
   state.className='calendar-state';row.dataset.done=String(entry.status==='DONE');row.append(time,title,state);return row;
  }));
 }catch{if(expected===calendarGeneration)status.textContent='일정을 확인하지 못했습니다. 다시 조회해 주세요.';}
 finally{if(expected===calendarGeneration){calendarBusy=false;button.disabled=false;}}
}
document.querySelector('#calendar-refresh').addEventListener('click',refreshTodayCalendar);
function clearOverview(){window.moaonMonth?.clear();window.moaonInsights?.clear();window.moaonSettlement?.clear();clearFinance();clearTodayCalendar();overviewGeneration++;overviewValues={};overviewBusy=false;overviewLastAttempt=0;renderOverview();}
function ensureTodayOverview(){
 if(displayMode==='live'&&document.querySelector('[data-page="today"]').classList.contains('is-visible')&&(!financeLastAttempt||Date.now()-financeLastAttempt>=300000))void refreshFinance();
 if(displayMode==='live'&&document.querySelector('[data-page="today"]').classList.contains('is-visible')&&(!calendarLastAttempt||Date.now()-calendarLastAttempt>=60000))void refreshTodayCalendar();
 if(displayMode!=='live'||overviewBusy||!document.querySelector('[data-page="today"]').classList.contains('is-visible'))return;
 if(overviewLastAttempt&&Date.now()-overviewLastAttempt<60000)return;
 void refreshOverview();
}
function renderOverview(){
 const section=document.querySelector('#today-overview');section.hidden=displayMode!=='live';
 document.querySelector('#overview-refresh').disabled=overviewBusy||displayMode!=='live';
 const values=Object.values(overviewValues),active=overviewValues.ACTIVE;
 const complete=values.length===4&&values.every(value=>value?.status==='READY'&&Number.isSafeInteger(value.total)&&value.total>=0);
 document.querySelector('#overview-priority').textContent=overviewBusy?'업무 현황을 불러오는 중입니다.':!complete?'일부 상태는 확인이 필요합니다. 누락된 수치는 0건으로 계산하지 않습니다.':active.total>0?`송장 발급 전 ${active.total.toLocaleString('ko-KR')}건을 먼저 살펴보세요. 자동 발급 가능 여부는 주문별로 확인합니다.`:'현재 수집된 송장 발급 전 주문은 없습니다. 배송중·완료 현황을 확인하세요.';
 document.querySelector('#overview-cards').replaceChildren(...Object.entries(scopeDetails).map(([scope,detail])=>{
  const value=overviewValues[scope],button=makeElement('button');button.type='button';button.dataset.scope=scope;
  button.dataset.state=value?.status||'UNKNOWN';button.disabled=displayMode!=='live';
  const known=['READY','PARTIAL'].includes(value?.status)&&Number.isSafeInteger(value?.total)&&value.total>=0;
  button.append(makeElement('span','',detail.label),makeElement('strong','',known?`${value.total.toLocaleString('ko-KR')}건`:'확인 필요'),
   makeElement('small','',known?`${value.status==='PARTIAL'?'부분 확인 · ':''}${formatTime(value.checkedAt)} 조회`:'아직 조회하지 않았거나 조회 실패'),makeElement('small','','주문 목록 열기 →'));
  button.addEventListener('click',async()=>{button.disabled=true;await runHubAction(detail.action);if(displayMode==='live')showRoute('orders');});
  return button;
 }));
}
async function refreshOverview(){
 if(overviewBusy||displayMode!=='live')return;
 const expected=++overviewGeneration;overviewBusy=true;overviewLastAttempt=Date.now();overviewValues={};renderOverview();
 const status=document.querySelector('#overview-status');status.textContent='저장 주문의 네 가지 상태를 확인하고 있습니다…';
 try{
  const result=await window.moaonHub.readOverview();
  if(expected!==overviewGeneration)return;
  if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
  overviewValues=result?.scopes||{};
  status.textContent=result?.status==='READY'?'상태별 조회 시각을 확인하세요. 부분 확인·실패는 전체 건수로 판단하지 마세요.':'요약을 완료하지 못했습니다. 전체 상태 조회로 다시 확인하세요.';
 }catch{if(expected===overviewGeneration)status.textContent='요약 조회 실패 · 다시 확인하세요.';}
 finally{if(expected===overviewGeneration){overviewBusy=false;renderOverview();}}
}
document.querySelector('#overview-refresh').addEventListener('click',refreshOverview);
function clearBusinesses(){
 businessGeneration++;businessLoaded=false;businessBusy=false;
 document.querySelector('#business-list').replaceChildren();
 document.querySelector('#business-list-status').textContent='로그인 후 사업장 목록을 확인합니다.';
 document.querySelector('#business-list-refresh').disabled=true;
}
async function refreshBusinesses(){
 if(businessBusy||displayMode!=='live')return;
 const expected=++businessGeneration;businessBusy=true;
 const button=document.querySelector('#business-list-refresh'),status=document.querySelector('#business-list-status'),list=document.querySelector('#business-list');
 button.disabled=true;list.replaceChildren();status.textContent='소속 사업장을 확인하고 있습니다.';
 try{
  const result=await window.moaonHub.listBusinesses();
  if(expected!==businessGeneration)return;
  const messages={LOGIN_REQUIRED:'로그인이 만료되었습니다. 다시 로그인해주세요.',FORBIDDEN:'사업장 목록을 볼 권한이 없습니다.',TIMEOUT:'조회 시간이 초과됐습니다. 다시 확인해주세요.',UNAVAILABLE:'목록을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.',DISCONNECTED:'연결이 해제됐습니다.',CANCELLED:'조회가 취소됐습니다.'};
  if(result.status!=='READY'){status.textContent=messages[result.status]||messages.UNAVAILABLE;return;}
  status.textContent=result.businesses.length?`소속 사업장 ${result.businesses.length}개 · 연결과 권한이 준비된 사업장만 열 수 있습니다.`:'등록된 소속 사업장이 없습니다. 기존 하린식품 업무 연결과는 별도입니다.';
  list.replaceChildren(...result.businesses.map(business=>{
   const supported=business.tenantId==='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
   const canOpen=supported&&business.role==='OWNER';
   const item=makeElement('li'),info=makeElement('div','business-info');
   info.append(makeElement('strong','',business.displayName),makeElement('span','business-role',({OWNER:'소유자',OPERATOR:'운영자',VIEWER:'조회 담당자'})[business.role]));
   const detail=makeElement('p','business-reason',canOpen?'주문을 다시 확인한 뒤 업무 화면을 엽니다.':supported?'현재 이 앱은 소유자 권한이 필요합니다.':'이 사업장의 독립된 주문·플랫폼 연결은 준비 중입니다.');
   const actions=makeElement('div','business-actions');
   const badge=makeElement('span',`business-readiness${canOpen?' is-ready':''}`,canOpen?'현재 연결':supported?'권한 확인 필요':'연결 준비 중');
   const open=makeElement('button','secondary-action',canOpen?'주문 업무 열기':'아직 열 수 없음');open.type='button';open.disabled=!canOpen;
   open.addEventListener('click',async()=>{
    if(open.disabled||expected!==businessGeneration||displayMode!=='live')return;
    open.disabled=true;open.textContent='권한 확인 중…';
    await runHubAction('viewActive');
    if(expected!==businessGeneration)return;
    if(displayMode==='live')showRoute('orders');
    open.disabled=false;open.textContent='주문 업무 열기';
   });
   info.append(detail);actions.append(badge,open);item.append(info,actions);return item;
  }));
 }catch{if(expected===businessGeneration)status.textContent='목록을 불러오지 못했습니다. 다시 확인해주세요.';}
 finally{if(expected===businessGeneration){businessBusy=false;button.disabled=false;}}
}
document.querySelector('#business-list-refresh').addEventListener('click',refreshBusinesses);
let reviewFilter = 'ALL';
const reviewLabels = Object.freeze({ALL:'전체',REVIEW_ONLY:'확인 후보',BLOCKED:'제외',EXTERNAL:'별도 처리',CHECK_REQUIRED:'확인 필요'});
const reviewStatus = order => Object.hasOwn(reviewLabels, order.preflight?.status) && order.preflight.status !== 'ALL'
  ? order.preflight.status : 'CHECK_REQUIRED';

function renderReviewFilters(orders) {
  const overview = document.querySelector('#review-overview');
  const group = document.querySelector('#review-filters');
  overview.hidden = displayMode !== 'live';
  if (overview.hidden) { group.replaceChildren(); reviewFilter = 'ALL'; return; }
  const focused = group.contains(document.activeElement) ? document.activeElement.dataset.reviewFilter : null;
  group.replaceChildren(...Object.entries(reviewLabels).map(([status, label]) => {
    const count = status === 'ALL' ? orders.length : orders.filter(order => reviewStatus(order) === status).length;
    const button = makeElement('button', 'secondary-action', `${label} ${count}건`);
    button.type = 'button';
    button.dataset.reviewFilter = status;
    button.setAttribute('aria-pressed', String(reviewFilter === status));
    button.addEventListener('click', () => { reviewFilter = status; renderOrders(); });
    return button;
  }));
  if (focused) [...group.children].find(button => button.dataset.reviewFilter === focused)?.focus();
}

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
  if(route==='orders')void checkVisibleOrderFreshness();
  if(route==='today')ensureTodayOverview();
  if(route==='settlement')window.moaonSettlement?.ensure();
  if(route==='insights')window.moaonInsights?.ensure();
  if(route==='calendar')window.moaonMonth?.ensure();
}

const freshnessRow=document.querySelector('#order-freshness');
const freshnessStatus=document.querySelector('#order-freshness-status');
const freshnessCheckedAt=document.querySelector('#order-freshness-checked-at');
const freshnessReload=document.querySelector('#order-freshness-reload');
const ordersAreVisible=()=>displayMode==='live'&&!document.hidden&&document.querySelector('[data-page="orders"]')?.classList.contains('is-visible');
function renderFreshness(status='IDLE',checkedAt=null){
  freshnessRow.hidden=displayMode!=='live';
  if(freshnessRow.hidden)return;
  const effective=freshnessChanged&&!['UNAVAILABLE','AUTH_REQUIRED'].includes(status)?'CHANGED':status;
  freshnessRow.dataset.status=effective;
  freshnessStatus.textContent=effective==='CHANGED'?'주문 또는 사은품 기준이 변경됐어요':effective==='CURRENT'?'새 변경 없음':effective==='AUTH_REQUIRED'?'로그인 상태 확인 필요':effective==='UNAVAILABLE'?'변경 여부 확인 필요':'새 주문 변경을 확인합니다.';
  freshnessCheckedAt.textContent=checkedAt?`${formatTime(checkedAt)} 확인`:'';
  freshnessCheckedAt.dateTime=checkedAt||'';
  freshnessReload.hidden=!freshnessChanged;freshnessReload.disabled=freshnessReloadBusy||orderToolsBusy();
}
async function checkVisibleOrderFreshness(){
  if(!ordersAreVisible()||freshnessReloadBusy||typeof window.moaonHub?.checkOrderFreshness!=='function')return;
  const expectedAction=actionGeneration,expectedFreshness=++freshnessGeneration;
  try{
    const result=await window.moaonHub.checkOrderFreshness();
    if(expectedAction!==actionGeneration||expectedFreshness!==freshnessGeneration||!ordersAreVisible())return;
    if(result?.status==='CHANGED')freshnessChanged=true;
    if(['CURRENT','CHANGED','UNAVAILABLE','AUTH_REQUIRED'].includes(result?.status))renderFreshness(result.status,result.checkedAt);
  }catch{if(expectedAction===actionGeneration&&expectedFreshness===freshnessGeneration&&ordersAreVisible())renderFreshness('UNAVAILABLE');}
}
freshnessReload.addEventListener('click',async()=>{
  if(freshnessReloadBusy||orderToolsBusy()||!freshnessChanged||!ordersAreVisible())return;
  freshnessReloadBusy=true;freshnessReload.disabled=true;selectedOrderIds.clear();closeOrderDetail();renderOrders();renderCollection();
  const expected=++actionGeneration;++freshnessGeneration;
  try{
    const result=await window.moaonHub.refresh();
    if(expected!==actionGeneration)return;
    if(result?.status==='READY'){freshnessChanged=false;applyHubResult(result);renderFreshness('CURRENT',result.checkedAt);}
    else renderFreshness(result?.status==='LOGIN_REQUIRED'||result?.status==='FORBIDDEN'?'AUTH_REQUIRED':'UNAVAILABLE');
  }catch{if(expected===actionGeneration)renderFreshness('UNAVAILABLE');}
  finally{freshnessReloadBusy=false;if(expected===actionGeneration){renderOrders();renderCollection();}}
});
setInterval(()=>void checkVisibleOrderFreshness(),60_000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkVisibleOrderFreshness();});
window.addEventListener('focus',()=>void checkVisibleOrderFreshness());
window.moaonHub?.onWindowRestored?.(()=>void checkVisibleOrderFreshness());

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
  document.querySelector('.orders-layout').classList.add('is-detail-closed');
  detailPanel.inert = true;
  detailPanel.setAttribute('aria-hidden','true');
  renderSelection();
  for (const button of orderList.querySelectorAll('.order-row')) button.setAttribute('aria-pressed', 'false');
  // A user close keeps the painted content for the exit motion. Data/scope
  // changes still clear synchronously so hidden customer data cannot linger.
  if (!options.animate) {
  detailPanel.replaceChildren();
  const empty = makeElement('div', 'detail-empty');
  const icon = makeElement('span', '', '▤');
  icon.setAttribute('aria-hidden', 'true');
  const description = isSampleMode()
    ? '선택한 샘플 주문의 고객, 상품, 배송 정보를 여기에 표시합니다.'
    : displayMode === 'live' ? `선택한 ${selectedScopeDetail().range}의 허용된 정보만 표시합니다.` : '연결 상태를 확인한 뒤 주문을 조회하세요.';
  empty.append(icon, makeElement('strong', '', '주문을 선택하세요'), makeElement('p', '', description));
  detailPanel.append(empty);
  }
  if (options.restoreFocus && selectedOrderButton?.isConnected) selectedOrderButton.focus();
  selectedOrderButton = null;
}

function addDetailSection(parent, title, primary, secondary) {
  const section = makeElement('section', 'detail-section');
  section.append(makeElement('h3', '', title), makeElement('strong', '', primary), makeElement('span', '', secondary));
  parent.append(section);
}

function trackingSection(order){
  const panel=makeElement('section','tracking-section'),generation=actionGeneration,id=orderId(order);
  panel.setAttribute('role','region');panel.setAttribute('aria-label','우체국 배송추적');
  const state=makeElement('strong','','추적 기록 확인 전'),time=makeElement('p','','송장 등록과 실제 배송 상태는 다릅니다.');
  state.setAttribute('role','status');
  const buttons=makeElement('div','tracking-actions');
  const read=makeElement('button','secondary-action','저장 추적 조회'),refresh=makeElement('button','secondary-action','배송상태 갱신 요청');
  read.type=refresh.type='button';buttons.append(read,refresh);
  const reload=makeElement('button','secondary-action','주문 목록 다시 조회');reload.type='button';reload.hidden=true;buttons.append(reload);
  panel.append(makeElement('h3','','우체국 배송추적'),state,time,buttons);
  let busy=false;
  const current=()=>generation===actionGeneration&&displayMode==='live'&&selectedOrderId===id&&panel.isConnected;
  const run=async renew=>{
    if(!current()||busy||registrationBusy)return;
    busy=true;reload.hidden=true;read.disabled=refresh.disabled=true;panel.setAttribute('aria-busy','true');
    state.textContent=renew?'배송상태 갱신 요청 중…':'저장 추적 조회 중…';time.textContent='';
    try{
      const result=await (renew?window.moaonHub.refreshTracking(id):window.moaonHub.readTracking(id));
      if(!current())return;
      if(result?.status==='PENDING'){
        state.textContent='조회 요청 접수 · 완료 아님';time.textContent='잠시 뒤 저장 추적 조회로 결과를 확인하세요. 송장을 새로 발급하지 않습니다.';
      }else if(result?.status==='READY'&&result.state){
        const labels={WAITING:'배송 이동 확인 전',IN_TRANSIT:'배송중',DELIVERED:'배송완료',PENDING:'조회 처리 대기',CHECK_REQUIRED:'추적 확인 필요'};
        state.textContent=labels[result.state.status]||labels.CHECK_REQUIRED;
        reload.hidden=!['WAITING','IN_TRANSIT','DELIVERED'].includes(result.state.status);
        time.textContent=result.state.checkedAt?`기록 확인 ${formatTime(result.state.checkedAt)} · 저장 추적 기준`:'확인 시각 없음 · 저장 추적 기준';
      }else{state.textContent='추적 확인 필요';time.textContent='기록이 없거나 조회하지 못했습니다. 잠시 뒤 다시 확인하세요.';}
    }catch{if(current()){state.textContent='추적 확인 필요';time.textContent='연결을 확인한 뒤 다시 조회하세요.';}}
    finally{busy=false;read.disabled=refresh.disabled=false;panel.removeAttribute('aria-busy');}
  };
  read.addEventListener('click',()=>void run(false));refresh.addEventListener('click',()=>void run(true));
  reload.addEventListener('click',()=>{if(current()&&!busy&&!registrationBusy)void runHubAction('refresh');});
  // Wait until the detail section is attached; read once, never enqueue on open.
  queueMicrotask(()=>void run(false));
  return panel;
}

function showOrderDetail(order, button, options = {}) {
  document.querySelector('.orders-layout').classList.remove('is-detail-closed');
  detailPanel.inert = false;
  detailPanel.removeAttribute('aria-hidden');
  selectedOrderId = orderId(order);
  renderSelection();
  selectedOrderButton = button;
  for (const orderButton of orderList.querySelectorAll('.order-row')) {
    orderButton.setAttribute('aria-pressed', String(orderButton.dataset.orderId === selectedOrderId));
  }
  detailPanel.replaceChildren();
  const header = makeElement('header', 'detail-header');
  const heading = makeElement('div');
  const detailTitle=makeElement('h2','','선택한 주문');
  detailTitle.setAttribute('aria-label','주문 상세');
  heading.append(makeElement('span', 'eyebrow', isSampleMode() ? 'SAMPLE DETAIL' : 'HARIN ORDER DESK'),detailTitle);
  const closeButton = makeElement('button', '', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '주문 상세 닫기');
  closeButton.addEventListener('click', () => closeOrderDetail({ restoreFocus: true, animate: true }));
  header.append(heading, closeButton);
  const body = makeElement('div', 'detail-body');
  const productHero=makeElement('section','detail-product');
  const productText=makeElement('div');
  productText.append(makeElement('small','',isSampleMode()?order.channel:order.platform||'채널 확인 필요'),makeElement('h2','',order.productName||order.product||'상품 확인 필요'));
  productText.append(makeElement('span','',isSampleMode()?order.option:order.details?.items?.[0]?.option||formatNumber(order.quantity,'개')));
  const present=giftBadge(order);
  if(present)productText.append(present);
  productHero.append(productThumbnail(order),productText);body.append(productHero);
  const facts=makeElement('dl','detail-facts');
  const fact=(title,value)=>facts.append(makeElement('dt','',title),makeElement('dd','',value));
  fact('결제금액',isSampleMode()?`${order.amount} · 샘플`:formatNumber(order.amount,'원'));
  fact('수량',isSampleMode()?order.option:formatNumber(order.quantity,'개'));
  body.append(facts);
  if(!isSampleMode()){
    const receiver=order.details?.receiver||{};
    const delivery=makeElement('section','detail-section delivery-information');delivery.setAttribute('aria-label','배송정보');
    delivery.append(makeElement('h3','','배송정보'));
    const fields=makeElement('dl','detail-facts');
    for(const [label,value] of [['받는 분',receiver.name],['연락처',receiver.contact],['우편번호',receiver.postCode],['주소',[receiver.address,receiver.addressDetail].filter(Boolean).join(' ')],['배송 메모',receiver.message||'배송 메모 없음']])fields.append(makeElement('dt','',label),makeElement('dd','',value||'확인 필요'));
    delivery.append(fields);body.append(delivery);
    const hasRequiredDelivery=value=>['name','address','contact','postCode'].every(key=>typeof value?.[key]==='string'&&value[key].trim().length>0);
    if(!hasRequiredDelivery(receiver)&&['CAFE24','COUPANG'].includes(order.platform)&&window.moaonHub?.readDelivery){
      const state=makeElement('p','detail-notice','배송정보 불러오는 중…');delivery.append(state);
      state.setAttribute('role','status');
      const retry=makeElement('button','secondary-action','배송정보 다시 확인');retry.type='button';retry.hidden=true;delivery.append(retry);
      const expected=actionGeneration;
      const current=()=>expected===actionGeneration&&delivery.isConnected&&selectedOrderId===orderId(order);
      let busy=false;
      const load=async()=>{
        if(busy||!current())return;busy=true;retry.hidden=true;delivery.setAttribute('aria-busy','true');state.textContent='배송정보 불러오는 중…';
        try{
          const result=await window.moaonHub.readDelivery(orderId(order));if(!current())return;
          if(result?.status!=='READY'){state.textContent=result?.status==='PENDING'?'쿠팡 조회 처리 대기 중 · 잠시 뒤 다시 확인하세요.':'배송정보 조회 확인 필요 · 다시 확인해주세요.';retry.hidden=false;return;}
          const fresh=result.receiver||{},values=[fresh.name,fresh.contact,fresh.postCode,[fresh.address,fresh.addressDetail].filter(Boolean).join(' '),fresh.message||'배송 메모 없음'];
          fields.querySelectorAll('dd').forEach((node,index)=>node.textContent=values[index]||'확인 필요');state.textContent='배송정보 조회 완료';
          if(!hasRequiredDelivery(fresh)){
            state.textContent='필수 배송정보가 아직 누락되어 있습니다. 다시 조회하거나 판매 채널의 원본 정보를 확인하세요.';
            retry.hidden=false;return;
          }
          if(!order.issueAndRegisterEligible&&order.preflight?.route==='HUB'){
            state.textContent='배송정보 조회 완료 · 발급 가능 여부는 서버 주문을 다시 확인해야 합니다.';
            const verify=makeElement('button','secondary-action','발급 조건 다시 확인');verify.type='button';
            verify.addEventListener('click',()=>{
              if(!current()||registrationBusy||verify.disabled)return;
              verify.disabled=true;void recheckSelectedOrder();
            });delivery.append(verify);
          }
        }catch{if(current()){state.textContent='배송정보 조회 확인 필요';retry.hidden=false;}}
        finally{busy=false;delivery.removeAttribute('aria-busy');}
      };
      retry.addEventListener('click',()=>void load());queueMicrotask(()=>void load());
    }
  }
  if(!isSampleMode()&&['CAFE24','COUPANG'].includes(order.platform)&&order.details?.invoice?.status==='REGISTERED'&&/^\d{13}$/.test(order.details.invoice.number||''))body.append(trackingSection(order));
  const more=makeElement('details','detail-more');
  more.append(makeElement('summary','','주문 · 배송 추가 정보'));
  for(const gift of order.visual?.gifts||[])addDetailSection(body,'동봉할 사은품',gift.name,gift.quantity+'개 · 조회 시점 캘린더 이벤트 판정');
  if (isSampleMode()) {
    addDetailSection(more, '주문', order.id, `${order.channel} · ${order.status}`);
    addDetailSection(more, '고객', order.customer, order.address);
    addDetailSection(more, '상품', order.product, `${order.option} · ${order.amount} (샘플)`);
    addDetailSection(more, '배송 메모', order.note, '가상 정보이며 배송에 사용되지 않습니다.');
    body.append(more);
    body.append(makeElement('p', 'detail-notice', '샘플 주문은 발급·인쇄·상태 변경을 실행하지 않습니다.'));
  } else {
    const preflight = order.preflight;
    const preflightLabels = {BLOCKED:'출고 대상에서 제외',EXTERNAL:'별도 플랫폼에서 처리',CHECK_REQUIRED:'출고 전 정보 확인 필요',REVIEW_ONLY:'발급 전 재확인 후보'};
    const reasonLabels = {CANCELLED:'취소된 주문',CANCEL_REQUEST:'취소·반품 요청 먼저 확인',SHIPPED:'배송 진행 또는 완료 상태',INVOICE_EXISTS:'기존 송장 기록 확인',NAVER_ROUTE:'네이버에서 송장 처리',ROCKET_ROUTE:'로켓그로스는 쿠팡에서 출고',ROUTE_UNKNOWN:'처리 경로 확인 필요',STAGE_UNKNOWN:'주문 단계 확인 필요',CANCEL_UNKNOWN:'취소 여부 확인 필요',INVOICE_UNKNOWN:'송장 이력 확인 필요',ORDER_ID:'주문 식별번호 확인 필요',SERVER_CHECK:'웹 허브의 출고 제한 확인 필요',DELIVERY_INFO:'배송정보 누락 또는 형식 확인 필요',QUANTITY:'상품 수량 확인 필요',PARTIAL:'일부 채널 자료 누락'};
    reasonLabels.HISTORY_UNAVAILABLE = '송장 이력 조회 상태 확인 필요';
    const checkSection = makeElement('section', 'detail-section preflight-summary');
    checkSection.dataset.state = preflight?.status || 'CHECK_REQUIRED';
    checkSection.setAttribute('aria-label', '출고 사전 확인');
    checkSection.append(makeElement('h3', '', '출고 사전 확인 · 저장 자료 기준'), makeElement('strong', '', preflightLabels[preflight?.status] || '출고 전 정보 확인 필요'));
    const reasons = makeElement('ul');
    for (const code of preflight?.codes || []) reasons.append(makeElement('li', '', reasonLabels[code] || '추가 확인 필요'));
    const reasonDetails=makeElement('details','preflight-reasons');
    reasonDetails.append(makeElement('summary','',`확인할 항목 ${reasons.childElementCount}개`),reasons,makeElement('span','','발급 직전에 최신 주문·배송정보·송장 이력을 다시 확인합니다.'));
    checkSection.append(reasonDetails);
    addDetailSection(more, '주문', order.hubOrderId || '주문번호 확인 필요', `${order.platform || '채널 확인 필요'} · ${stageLabel(order.stage)}`);
    const details = order.details || {};
    addDetailSection(more, '플랫폼 주문번호', details.externalOrderId || '확인 필요', '위 허브 주문번호와 구분되는 쇼핑몰 원본 번호입니다.');
    if (details.items?.length) {
      for (const [index, item] of details.items.entries()) {
        addDetailSection(more, `상품 구성 ${index + 1}`, item.name || '상품명 확인 필요', `${item.option || '옵션 정보 없음'} · ${formatNumber(item.quantity, '개')}`);
      }
      more.append(makeElement('p', 'detail-notice', '목록 API가 제공한 상품 구성입니다. 최대 8개까지만 표시되며 전체 구성은 웹 허브에서 확인하세요.'));
    } else addDetailSection(more, '상품 구성', '세부 상품 정보 확인 필요', '대표 상품만으로 전체 포장 구성을 판단하지 마세요.');
    addDetailSection(more, '저장된 송장', details.invoice?.number || '송장 정보 확인 필요', details.invoice
      ? details.invoice.status === 'REGISTERED' ? '플랫폼 등록 완료 · 저장 자료 기준' : '발급 완료 · 플랫폼 등록 필요'
      : '정보가 없다고 미발급으로 확정하지 않습니다.');
    const deliveryLabels = {RESERVED:'예약',IN_TRANSIT:'배송중',DELIVERED:'배송완료',CHECK_REQUIRED:'확인 필요'};
    addDetailSection(more, '저장된 배송상태', deliveryLabels[details.delivery?.status] || '배송상태 확인 필요', details.delivery
      ? `${details.delivery.source === 'EPOST' ? '우체국 조회 자료 기준' : '쇼핑몰 상태 기준'} · 실시간 재조회 아님`
      : '확인된 배송상태 자료가 없습니다.');
    const cancellation = details.cancelled === true || order.stage === 'CANCELLED' ? '취소된 주문 · 출고하지 마세요'
      : details.cancellationRequested === true ? '취소 요청 있음 · 출고 전 확인 필요'
      : details.cancelled === false && details.cancellationRequested === false ? '저장 자료에 취소 요청 없음' : '취소 여부 확인 필요';
    addDetailSection(more, '출고 전 확인', cancellation, '최신 채널 상태를 확인하세요. 이 표시는 출고 가능 승인이나 발급 실행이 아닙니다.');
    addDetailSection(more, '주문 시각', order.orderedAt ? formatTime(order.orderedAt) : '확인 필요', `목록 확인 ${formatTime(connectionResult?.checkedAt)}`);
    body.append(more,checkSection);
  }
  detailPanel.append(header, body);
  if (!isSampleMode()) {
    const actions = makeElement('section', 'review-actions');
    actions.setAttribute('aria-label', '주문 재확인');
    actions.append(makeElement('strong', 'review-result', '송장·출력'));
    const recheck = makeElement('button', 'secondary-action order-refresh-link', '주문 정보 새로고침');
    recheck.type = 'button';
    recheck.addEventListener('click', () => void recheckSelectedOrder());
    if(order.issueAndRegisterEligible===true){
      const automatic=makeElement('button','primary-action','자동 발급·등록');automatic.type='button';automatic.dataset.autoShip=orderId(order);automatic.disabled=registrationBusy;
      automatic.addEventListener('click',()=>void runAutomaticShipping([orderId(order)]));actions.append(automatic);
    }
    if(order.registrationEligible===true){
      const register=makeElement('button','primary-action','이 주문 송장 등록');
      register.type='button';register.dataset.invoiceRegistration=orderId(order);register.disabled=registrationBusy;
      register.addEventListener('click',()=>{
        if(registrationBusy)return;
        selectedOrderIds.clear();selectedOrderIds.add(orderId(order));renderSelection();void registerSelectedInvoices();
      });
      actions.append(register);
    }
    if(order.preflight?.status==='REVIEW_ONLY'&&order.preflight?.route==='HUB'){
      const confirm=makeElement('button','secondary-action','출고 내용 확인 (발급 안 함)');
      confirm.type='button';
      confirm.addEventListener('click',async()=>{
        if(registrationBusy)return;
        const reasons=detailPanel.querySelector('.preflight-reasons');if(reasons)reasons.open=true;
        const generation=actionGeneration,id=selectedOrderId;
        confirm.disabled=true;
        const label=actions.querySelector('.review-result');
        label.setAttribute('role','status');label.textContent='저장 주문 확인 중…';
        try{
          const result=await window.moaonHub.confirmShipmentReview(id);
          if(generation!==actionGeneration||selectedOrderId!==id||!actions.isConnected)return;
          label.textContent=result.status==='REVIEW_CONFIRMED'?'내용 확인 완료 · 송장 발급 안 함':result.status==='REVIEW_CANCELLED'?'내용 확인 취소 · 송장 발급 안 함':'확인 불가 · 저장 주문을 다시 확인하세요';
        }catch{if(actions.isConnected)label.textContent='확인 실패 · 저장 주문을 다시 확인하세요';}
        finally{confirm.disabled=false;}
      });
      actions.append(confirm);
    }
    if(/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(order.hubOrderId)){
      const issue=makeElement('button','secondary-action','우체국 송장 발급');issue.type='button';
      const check=makeElement('button','secondary-action','발급 상태 확인');check.type='button';
      const label=makeElement('p','detail-notice','최종 확인 후 발급 · 네이버·로켓그로스 별도 처리');
      label.setAttribute('role','status');label.setAttribute('aria-live','polite');
      const eligible=order.preflight?.status==='REVIEW_ONLY'&&order.preflight?.route==='HUB';
      issue.disabled=!eligible;
      let busy=false;
      const reloadIssued=makeElement('button','secondary-action','발급 결과 주문 다시 조회');reloadIssued.type='button';reloadIssued.hidden=true;
      reloadIssued.addEventListener('click',async()=>{reloadIssued.disabled=true;await recheckSelectedOrder({afterIssue:true});});
      const messages={
        EMPTY:'이 앱에 저장된 발급 작업 없음 · 미발급 확정 아님',
        SUBMITTING:'발급 요청 전송 중…',PENDING:'접수 완료 · 작업 대기 중…',RUNNING:'우체국 송장 발급 처리 중…',
        SUCCEEDED:'발급 완료 · 주문 목록을 새로 확인하세요',
        FAILED:'발급 실패 · 웹 허브에서 원인을 확인하세요',CANCELLED:'작업 취소됨 · 자동 재발급하지 않습니다',
        UNKNOWN:'결과 확인 필요 · 재발급하지 말고 상태를 확인하세요',STORAGE_ERROR:'작업 기록 확인 필요 · 발급을 차단했습니다',
        DISCONNECTED:'연결이 변경되어 확인을 중단했습니다',LOGIN_REQUIRED:'로그인이 만료되었습니다 · 다시 연결하세요',
        REVIEW_CANCELLED:'발급을 취소했습니다 · 전송하지 않았습니다',ORDER_CHANGED:'주문이 변경되었습니다 · 목록을 새로 확인하세요',
        CHECK_REQUIRED:'발급 조건 확인 필요 · 목록을 새로 확인하세요',BUSY:'다른 확인 작업이 진행 중입니다',
      };
      async function runShipment(submit){
        if(busy||registrationBusy)return;busy=true;issue.disabled=true;check.disabled=true;reloadIssued.hidden=true;
        const collectionLock={};collectionShipmentLocks.add(collectionLock);renderCollection();
        if(submit){const reasons=detailPanel.querySelector('.preflight-reasons');if(reasons)reasons.open=true;}
        const id=order.hubOrderId,generation=actionGeneration;
        const current=()=>generation===actionGeneration&&selectedOrderId===id&&actions.isConnected&&!document.hidden;
        let status='UNAVAILABLE';
        label.textContent=submit?'최신 주문과 발급 내용을 확인 중…':'발급 상태 확인 중…';
        try{
          let result=await window.moaonHub[submit?'issueShipment':'checkShipment'](id);
          for(let count=0;current();count++){
            status=result.status;label.textContent=messages[status]||'확인을 완료하지 못했습니다 · 발급 상태를 다시 확인하세요';
            reloadIssued.hidden=status!=='SUCCEEDED';
            if(!['PENDING','RUNNING','SUBMITTING'].includes(status))break;
            if(count>=15){label.textContent+=' 잠시 후 발급 상태 확인을 눌러주세요.';break;}
            await new Promise(resolve=>setTimeout(resolve,2000));
            if(!current())break;
            result=await window.moaonHub.checkShipment(id);
          }
        }catch{if(current())label.textContent='결과 확인 필요 · 발급 상태 확인을 눌러주세요';}
        finally{
          busy=false;check.disabled=false;
          collectionShipmentLocks.delete(collectionLock);renderCollection();
          issue.disabled=!eligible||['SUBMITTING','PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED','UNKNOWN','STORAGE_ERROR'].includes(status);
        }
      }
      issue.addEventListener('click',()=>void runShipment(true));
      check.addEventListener('click',()=>void runShipment(false));
      actions.append(issue,check,label,reloadIssued);
      if(order.details?.invoice?.status==='REGISTERED'){
        const preview=makeElement('button','secondary-action','기존 송장 미리보기·인쇄');preview.type='button';
        preview.addEventListener('click',async()=>{
          if(registrationBusy||collectionBusy)return;
          preview.disabled=true;const generation=actionGeneration,id=order.hubOrderId;
          try{
            const result=await window.moaonHub.previewLabel(id);
            if(generation!==actionGeneration||selectedOrderId!==id||!actions.isConnected)return;
            label.textContent=result.status==='PREVIEW_OPEN'?'미리보기 창을 열었습니다 · 인쇄는 창의 메뉴에서 선택하세요':'송장·배송정보 확인 필요 · 목록을 다시 조회하세요';
          }catch{if(actions.isConnected)label.textContent='미리보기를 열지 못했습니다 · 다시 확인하세요';}
          finally{preview.disabled=false;}
        });
        preview.className='primary-action';actions.prepend(preview);
      }
    }
    actions.append(recheck);
    detailPanel.append(actions);
  }
  renderDetailNavigation();
  closeButton.focus();
}

document.querySelector('#issued-order-list').addEventListener('click',()=>void runHubAction('viewRegistered'));
async function recheckSelectedOrder({afterIssue=false}={}) {
  if (displayMode !== 'live' || !selectedOrderId) return;
  const id = selectedOrderId;
  const generation = ++actionGeneration;
  clearDisplayedOrders('connecting', '선택한 주문이 있는 페이지를 다시 확인하고 있습니다.');
  try {
    const result = await window.moaonHub.recheckPage();
    if (generation !== actionGeneration) return;
    applyHubResult(result);
    if (displayMode !== 'live') return;
    const order = displayedOrders.find(item => item.hubOrderId === id);
    const button = [...orderList.querySelectorAll('.order-row')].find(item => item.dataset.orderId === id);
    if (order && button) {
      showOrderDetail(order, button, {rechecked:true});
      detailPanel.querySelector('.review-actions button')?.focus();
    } else {
      updateConnectionChrome(afterIssue?'현재 목록에 주문이 없습니다. 송장 등록 후 목록에서도 확인하세요.':'선택한 주문을 다시 찾지 못했습니다. 새 목록에서 주문을 선택하세요.');
      document.querySelector('#issued-order-list').hidden=!afterIssue;
    }
  } catch {
    if (generation === actionGeneration) clearDisplayedOrders('error', '주문 재확인에 실패했습니다. 목록을 다시 조회하세요.');
  }
}

function renderDetailNavigation() {
  detailPanel.querySelector('.detail-navigation')?.remove();
  const rows = [...orderList.querySelectorAll('.order-row')];
  const index = rows.indexOf(selectedOrderButton);
  const navigation = makeElement('div', 'detail-navigation');
  navigation.setAttribute('aria-label', '현재 목록 상세 이동');
  for (const [label, position] of [['이전 주문 상세', index - 1], ['다음 주문 상세', index + 1]]) {
    const move = makeElement('button', 'secondary-action', label.startsWith('이전') ? '← 이전 주문' : '다음 주문 →');
    move.type = 'button';
    move.setAttribute('aria-label', label);
    move.disabled = position < 0 || position >= rows.length;
    move.addEventListener('click', () => {
      rows[position]?.click();
      rows[position]?.scrollIntoView({ block: 'nearest' });
      // Keep keyboard users on the same navigation action when it remains available.
      const next = [...detailPanel.querySelectorAll('.detail-navigation button')].find(item => item.getAttribute('aria-label') === label);
      if (next && !next.disabled) next.focus();
    });
    navigation.append(move);
  }
  detailPanel.append(navigation);
}

function productThumbnail(order) {
  const box=makeElement('span','product-thumbnail','이미지 없음');
  if(order.visual?.imageUrl){
    const img=document.createElement('img');
    img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
    img.addEventListener('error',()=>{img.remove();box.textContent='이미지 확인';},{once:true});
    img.src=order.visual.imageUrl;box.replaceChildren(img);
  }
  return box;
}
function giftBadge(order) {
  if(!order.visual?.gifts?.length)return null;
  const badge=makeElement('span','gift-badge','사은품 동봉');
  badge.title=order.visual.gifts.map(g=>g.name+' '+g.quantity+'개').join(' · ');
  return badge;
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
    button.setAttribute('aria-label', `${id || '주문번호 확인 필요'}, ${product}, ${channel}, ${stage}, ${reviewLabels[reviewStatus(order)]}, 조회 전용 주문 상세 열기`);
    primary.append(makeElement('strong', '', product), makeElement('span', '', id || '주문번호 확인 필요'));
    const channels={CAFE24:'Cafe24',NAVER:'네이버',COUPANG:'쿠팡'};
    const channelBadge=makeElement('strong','channel-badge',channels[channel]||channel);
    channelBadge.dataset.channel=channel;
    const delivery={RESERVED:'예약',IN_TRANSIT:'배송중',DELIVERED:'배송완료'};
    const status=makeElement('span','delivery-badge',delivery[order.details?.delivery?.status]||stage);
    status.dataset.state=order.details?.delivery?.status||order.stage;
    secondary.append(channelBadge);
    status.classList.add('order-state');
    button.append(status);
    const option=order.details?.items?.[0]?.option;
    if(option)primary.append(makeElement('small','product-option',option));
    const gift=giftBadge(order);if(gift)primary.append(gift);
    amount.append(makeElement('strong', '', formatNumber(order.amount, '원')));
  }
  const state=button.querySelector('.order-state')||makeElement('span','order-state delivery-badge',order.status||'확인 필요');
  button.append(productThumbnail(order),primary, secondary, amount,state);
  button.addEventListener('click', () => showOrderDetail(order, button));
  const row = makeElement('div','order-item');
  const checkbox = document.createElement('input');
  checkbox.type='checkbox';checkbox.className='order-select';checkbox.checked=selectedOrderIds.has(id);
  checkbox.disabled=registrationBusy;
  checkbox.setAttribute('aria-label',`주문 선택 ${id}`);
  checkbox.addEventListener('change',()=>{if(checkbox.checked)selectedOrderIds.add(id);else selectedOrderIds.delete(id);renderSelection();});
  row.append(checkbox,button);
  return row;
}

function renderSelection(){
  renderCollection();
  renderServerFilterControls();
  const count=selectedOrderIds.size;
  const autoEligible=displayMode==='live'&&count>0&&count<=20&&[...selectedOrderIds].every(id=>displayedOrders.some(order=>orderId(order)===id&&order.issueAndRegisterEligible===true));
  document.querySelector('#selection-auto-ship').disabled=registrationBusy||!autoEligible;
  for(const button of detailPanel.querySelectorAll('[data-auto-ship]'))button.disabled=registrationBusy||!displayedOrders.some(order=>orderId(order)===button.dataset.autoShip&&order.issueAndRegisterEligible);
  const bar=document.querySelector('#order-selection');
  bar.hidden=count===0;
  if(!count)bar.querySelector('details')?.removeAttribute('open');
  document.querySelector('#selection-count').textContent=count?`${count}건 선택`:'상세 보기';
  document.querySelector('#selection-review').disabled=registrationBusy||(!selectedOrderId&&count===0);
  document.querySelector('#selection-review').textContent=count>1?'첫 선택 내용 확인':'내용 확인';
  const eligible=displayMode==='live'&&count>0&&count<=20&&[...selectedOrderIds].every(id=>displayedOrders.some(order=>orderId(order)===id&&order.registrationEligible===true));
  document.querySelector('#selection-register').disabled=registrationBusy||!eligible;
  const documentRows=[...selectedOrderIds].map(id=>displayedOrders.find(order=>orderId(order)===id));
  const csvEligible=displayMode==='live'&&count>0&&count<=20&&documentRows.every(row=>row&&/^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/.test(row.hubOrderId));
  const labelRows=documentRows.filter(row=>row&&/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(row.hubOrderId)&&row.preflight?.route==='HUB'&&row.stage!=='CANCELLED'&&row.details?.cancelled===false&&row.details?.cancellationRequested===false&&row.details?.invoice?.status==='REGISTERED'&&row.details.receiver?.name&&row.details.receiver?.address&&/^\d{5}$/.test(row.details.receiver?.postCode)&&/^\d{9,12}$/.test((row.details.receiver?.contact||'').replace(/[\s-]/g,''))&&Number.isSafeInteger(row.quantity)&&row.quantity>0&&row.productName);
  const duplicate=labelRows.length!==new Set(labelRows.map(row=>row.details.invoice.number)).size;
  const documentLocked=registrationBusy||collectionBusy||collectionShipmentLocks.size>0;
  document.querySelector('#selection-labels').disabled=documentLocked||!csvEligible||labelRows.length!==count||duplicate;
  document.querySelector('#selection-csv').disabled=documentLocked||!csvEligible;
  document.querySelector('#selection-packing').disabled=documentLocked||!csvEligible;
  document.querySelector('#selection-dispatch').disabled=documentLocked||!csvEligible;
  document.querySelector('#selection-document-hint').textContent=`송장 가능 ${labelRows.length}건 · 제외 ${count-labelRows.length}건${duplicate?' · 중복 송장 확인 필요':count!==labelRows.length?' · 등록·배송정보 또는 지원 채널 확인':''}`;
  document.querySelector('#selection-clear').disabled=orderToolsBusy();
  const boxes=[...document.querySelectorAll('.order-select')];
  for(const box of boxes){
    const id=box.closest('.order-item')?.querySelector('.order-row')?.dataset.orderId;
    box.checked=selectedOrderIds.has(id);box.disabled=orderToolsBusy();
  }
  for(const button of detailPanel.querySelectorAll('[data-invoice-registration]'))button.disabled=registrationBusy||!displayedOrders.some(order=>orderId(order)===button.dataset.invoiceRegistration&&order.registrationEligible===true);
  const all=document.querySelector('#order-select-all');
  const selectable=boxes.filter(box=>!box.disabled);
  all.checked=selectable.length>0&&count===selectable.length;all.indeterminate=count>0&&count<selectable.length;all.disabled=orderToolsBusy()||selectable.length===0;
  if(freshnessReload)freshnessReload.disabled=freshnessReloadBusy||registrationBusy||collectionBusy||collectionShipmentLocks.size>0;
}

const orderToolsBusy=()=>registrationBusy||collectionBusy||collectionShipmentLocks.size>0||freshnessReloadBusy;
function renderGlobalSearch(){const locked=orderToolsBusy()||displayMode!=='live';for(const id of ['order-global-query','order-global-start','order-global-end','order-global-apply','order-global-reset','order-global-export'])document.querySelector(`#${id}`).disabled=locked;const labels=[serverFilters.query?`“${serverFilters.query}”`:'',serverFilters.start?`${serverFilters.start}부터`:'',serverFilters.end?`${serverFilters.end}까지`:''].filter(Boolean);document.querySelector('#order-global-applied').textContent=labels.length?`전체 저장 주문 · ${labels.join(' · ')}`:'전체 저장 주문 · 조건 없음';}
function renderServerFilterControls(){
  const live=displayMode==='live',busy=orderToolsBusy();
  const delay=document.querySelector('#order-delay-only'),gift=document.querySelector('#order-gift-only');
  delay.checked=serverFilters.delayOnly;gift.checked=serverFilters.giftOnly;
  delay.disabled=!live||busy;gift.disabled=!live||busy;
  document.querySelector('#order-tools-reset').disabled=busy||!(live||isSampleMode());
}

function renderOrders() {
  renderGlobalSearch();
  const query = orderSearch.value.trim().toLocaleLowerCase('ko-KR');
  const channelOf = order => isSampleMode() ? order.channel : order.platform;
  const channel = selectedChannel;
  orderChannel.replaceChildren(...[['ALL','모든 채널'],['CAFE24','Cafe24'],['NAVER','네이버'],['COUPANG','쿠팡 판매자배송']].map(([value,label])=>{
    const option=makeElement('option','',label);option.value=value;return option;
  }));
  orderChannel.value=channel;
  const toolsEnabled=displayMode==='live'||isSampleMode();
  orderChannel.disabled=!toolsEnabled;orderSort.disabled=!toolsEnabled;
  renderServerFilterControls();
  const searchedOrders = displayedOrders.filter((order) => {
    const fields = isSampleMode()
      ? [order.id, order.customer, order.product, order.channel]
      : [order.hubOrderId, order.productName, order.platform, order.stage, stageLabel(order.stage)];
    return (channel==='ALL'||channelOf(order)===channel)&&fields.join(' ').toLocaleLowerCase('ko-KR').includes(query);
  });
  renderReviewFilters(searchedOrders);
  const serverFilterLabels=[serverFilters.delayOnly?'배송 지연만':'',serverFilters.giftOnly?'사은품 동봉만':''].filter(Boolean);
  document.querySelector('.order-more-filters summary').textContent = serverFilterLabels.length||reviewFilter !== 'ALL'||orderSort.value !== 'DEFAULT' ? '추가 필터 · 적용 중' : '추가 필터';
  const visibleOrders = displayMode === 'live' && reviewFilter !== 'ALL'
    ? searchedOrders.filter(order => reviewStatus(order) === reviewFilter) : searchedOrders;
  if(['AMOUNT_ASC','AMOUNT_DESC'].includes(orderSort.value)){
    const amountOf=order=>isSampleMode()?Number(order.amount.replace(/[,원\s]/g,'')):order.amount;
    visibleOrders.sort((a,b)=>{
      const left=amountOf(a),right=amountOf(b),hasLeft=typeof left==='number'&&Number.isFinite(left),hasRight=typeof right==='number'&&Number.isFinite(right);
      if(!hasLeft||!hasRight)return hasLeft?-1:hasRight?1:0;
      return orderSort.value==='AMOUNT_ASC'?left-right:right-left;
    });
  }
  for(const id of selectedOrderIds)if(!visibleOrders.some(order=>orderId(order)===id))selectedOrderIds.delete(id);
  orderList.replaceChildren(...visibleOrders.map(createOrderRow));
  orderList.hidden = visibleOrders.length === 0;
  orderEmpty.hidden = visibleOrders.length !== 0;
  if (isSampleMode()) {
    resultCount.textContent = query ? `검색 결과 · 샘플 ${visibleOrders.length}건` : `샘플 ${visibleOrders.length}건 표시`;
    orderEmpty.textContent = '검색 결과가 없습니다. 다른 주문번호, 고객명 또는 상품명을 입력하세요.';
  } else if (displayMode === 'live') {
    resultCount.textContent = `${serverFilterLabels.length?`전체 조회 ${serverFilterLabels.join(' · ')} · `:''}현재 페이지 ${query ? '검색 · ' : ''}${reviewLabels[reviewFilter]} ${visibleOrders.length}건`;
    orderEmpty.textContent = query || reviewFilter !== 'ALL' || channel!=='ALL' ? '현재 페이지에서 조건에 맞는 주문이 없습니다. 검색·필터 초기화로 다시 확인하세요.' : '현재 페이지에 표시할 주문이 없습니다.';
  } else {
    resultCount.textContent = displayMode === 'connecting' ? '연결 확인 중 · 주문 목록 비움' : '표시 중인 실제 주문 없음';
    orderEmpty.textContent = displayMode === 'connecting' ? '하린식품 연결 상태를 확인하고 있습니다.' : '연결 상태를 확인하거나 샘플 화면으로 돌아가세요.';
  }
  if (selectedOrderId && !visibleOrders.some((order) => orderId(order) === selectedOrderId)) closeOrderDetail();
  else if (selectedOrderId) {
    selectedOrderButton = [...orderList.querySelectorAll('.order-row')].find((button) => button.dataset.orderId === selectedOrderId) || null;
    renderDetailNavigation();
  }
  renderSelection();
}

function clearCollection(){collectionGeneration++;collectionState=null;collectionBusy=false;collectionShipmentLocks.clear();renderCollection();}
function renderCollection(){
 const panel=document.querySelector('#order-collection');panel.hidden=displayMode!=='live';
 const locked=orderToolsBusy()||displayMode!=='live';
 document.querySelector('#collect-orders').disabled=locked||collectionState?.canCollect===false;
 const check=document.querySelector('#check-order-collection');check.hidden=collectionState?.canCheck!==true;check.disabled=locked;
 const reload=document.querySelector('#collection-reload');reload.hidden=collectionState?.verifiedTerminal!==true;reload.disabled=locked;
 panel.setAttribute('aria-busy',String(collectionBusy));
 document.querySelector('#collection-message').textContent=collectionBusy?'전체 채널 수집 상태 확인 중…':!collectionState?'Cafe24·네이버·쿠팡 전체 수집 · 아래 채널 필터와 무관합니다.':collectionState.status==='PENDING'?'요청 접수 · 완료 아님. 수집 결과 확인으로 진행 상태를 조회하세요.':collectionState.status==='SUCCESS'?'전체 채널 수집 완료 · 저장 목록을 다시 조회하면 선택한 주문은 해제됩니다.':collectionState.status==='BUSY'?'다른 작업을 마친 뒤 다시 확인하세요.':collectionState.canCollect===false&&!collectionState.canCheck?'수집 결과 확인 필요 · 중복 수집 방지를 위해 재요청이 잠겼습니다. 저장 목록과 웹 허브 수집 상태를 확인하세요.':'일부 채널 확인 필요 · 완료된 채널과 확인이 필요한 채널을 구분해 확인하세요.';
 const chips=document.querySelector('#collection-channels');chips.replaceChildren();
 const labels={SUCCESS:'완료',PARTIAL:'일부 수집 · 확인 필요',PENDING:'대기 · 완료 아님',RUNNING:'수집 중',FAILED:'실패',CHECK_REQUIRED:'확인 필요'};
 for(const [key,name] of [['cafe24','Cafe24'],['naver','네이버'],['coupang','쿠팡']]){
  if(!collectionState)break;const row=collectionState.channels?.[key];
  const chip=makeElement('span','collection-chip',`${name} · ${labels[row?.status]||'확인 필요'}`);
  const date=typeof row?.observedAt==='string'?new Date(row.observedAt):null;
  chip.append(makeElement('small','',date&&Number.isFinite(date.getTime())?`기록 시각 ${date.toLocaleString('ko-KR')}`:'기록 시각 없음'));chips.append(chip);
 }
}
async function runCollection(check){
 if(orderToolsBusy()||displayMode!=='live'||(!check&&collectionState?.canCollect===false))return;
 const expected=collectionGeneration;collectionBusy=true;renderCollection();
 try{const result=await window.moaonHub[check?'checkOrderCollection':'collectOrders']();if(expected===collectionGeneration)collectionState=result;}
 catch{if(expected===collectionGeneration)collectionState={...collectionState,status:'CHECK_REQUIRED',canCollect:false};}
 finally{if(expected===collectionGeneration){collectionBusy=false;renderCollection();}}
}
document.querySelector('#collect-orders').addEventListener('click',()=>void runCollection(false));
document.querySelector('#check-order-collection').addEventListener('click',()=>void runCollection(true));
document.querySelector('#collection-reload').addEventListener('click',()=>{if(!collectionBusy&&!registrationBusy&&collectionState?.verifiedTerminal)void runHubAction('refresh');});

function setButtons(mode) {
  renderCollection();
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
  statusElements.businessStatus.textContent = sample ? '가상 사업장' : live ? '하린식품 연결' : '연결 확인';
  statusElements.businessName.textContent = live ? '하린식품' : sample ? '모아온 데모' : '하린식품';
  statusElements.businessDetail.textContent = live ? partial ? '일부 자료 확인 필요' : '연결됨' : sample ? '시험 자료만 표시 중' : '연결 확인 필요';
  statusElements.topBusinessName.textContent = live ? '하린식품' : sample ? '모아온 데모' : '하린식품';
  statusElements.global.textContent = live ? `하린식품 · 주문 조회·확인 후 발급${partial ? ' · 부분 확인' : ''}` : sample ? '시험 자료 · 하린식품 연결 안 됨' : message;
  statusElements.globalBadge.textContent = live ? '조회' : sample ? '시험' : '확인';
  statusElements.nav.textContent = live ? '주문·배송' : sample ? '샘플 주문' : '연결 확인 필요';
  statusElements.todayContext.textContent = live ? `하린식품 · ${scope.range} · ${formatTime(connectionResult.checkedAt)} 확인` : sample ? 'Windows 시제품 · 샘플 모드' : '하린식품 · 연결 상태 확인 필요';
  statusElements.todayTitleMode.textContent = live ? '오늘의 운영 현황' : sample ? '지금 가능한 일' : '실제 주문을 비우고';
  statusElements.todayTitleTail.textContent = live ? '' : sample ? '부터 확인하세요' : ' 연결 상태를 확인합니다';
  statusElements.todayDescription.textContent = live ? '저장된 주문 상태를 확인하고 필요한 업무로 이동하세요. 플랫폼 자동 수집 성공이나 오늘의 매출을 뜻하지 않습니다.' : sample ? '실제 사업장에 연결하기 전, 앱의 화면 구조와 기본 조작만 안전하게 살펴봅니다.' : message;
  statusElements.ordersContext.textContent = live ? `하린식품 · ${scope.range} · ${formatTime(connectionResult.checkedAt)} 확인` : sample ? '주문·배송 · 샘플 3건' : '하린식품 · 연결 상태 확인 필요';
  statusElements.ordersTitleMode.textContent = '주문 작업실';
  statusElements.ordersDescription.textContent = live ? '주문을 선택하고, 확인부터 출고까지.' : sample ? '샘플 주문으로 화면을 살펴보세요.' : message;
  statusElements.ordersEyebrow.textContent = live ? 'HARIN STORED ORDERS' : sample ? 'SAMPLE ORDERS' : 'NO LIVE DATA';
  statusElements.ordersRange.textContent = live ? displayedOrders.length ? pageRange : '조회된 주문 없음' : sample ? '실제 발급 버튼 없음' : '실제 주문 자료 비움';
  statusElements.settingsChip.textContent = live ? partial ? '부분 확인' : '연결됨' : sample ? '샘플' : '확인 필요';
  statusElements.settingsChip.className = `status-chip ${live && !partial ? 'status-ready' : sample ? 'status-sample' : 'status-blocked'}`;
  statusElements.programDataScope.textContent = live ? `하린식품 · ${scope.label} 페이지 조회` : sample ? '가상 사업장 · 샘플 주문' : '실제 주문 표시 안 함';
  statusElements.programNetwork.textContent = live ? '명시적 조회만' : sample ? '연결 안 됨' : '연결 상태 확인 필요';
  statusElements.statusbarData.textContent = live ? `데이터: 하린식품 저장 주문 · ${formatTime(connectionResult.checkedAt)}` : sample ? '데이터: 시험 자료 · 네트워크 연결 없음' : '데이터: 실제 주문 자료 비움';
  for (const section of sampleOnlySections) section.hidden = !sample;
  for (const element of connectionMessages) element.textContent = message;
  setButtons(displayMode);
  renderOverview();
}

function clearDisplayedOrders(mode, message) {
  ++freshnessGeneration;
  if(['sample','disconnected'].includes(mode)){freshnessChanged=false;freshnessReloadBusy=false;}
  clearRegistrationResults();
  selectedOrderIds.clear();
  document.querySelector('#issued-order-list').hidden=true;
  displayMode = mode;
  displayedOrders = Object.freeze([]);
  connectionResult = null;
  orderSearch.value = '';
  orderChannel.value = selectedChannel;orderSort.value = 'DEFAULT';
  closeOrderDetail();
  renderOrders();
  updateConnectionChrome(message);
  renderShippingFollowup();
  renderFreshness();
}

function applyHubResult(result) {
  if(['LOGIN_REQUIRED','FORBIDDEN','LOGIN_OPEN','DISCONNECTED','SESSION_CLEAR_FAILED'].includes(result?.status)){historyAutoLoaded=false;historyGeneration++;}
  if(['LOGIN_REQUIRED','FORBIDDEN','LOGIN_OPEN','DISCONNECTED','SESSION_CLEAR_FAILED'].includes(result?.status))shippingFollowup.clear();
  if(!['READY','PARTIAL'].includes(result?.status)){clearBusinesses();clearOverview();}
  const gate=document.querySelector('#entry-screen'),shell=document.querySelector('.preview-shell');
  if(result?.status==='READY'||result?.status==='PARTIAL'){
    gate.hidden=true;shell.hidden=false;shell.inert=false;
  }else if(!gate.hidden||['LOGIN_REQUIRED','LOGIN_OPEN','DISCONNECTED'].includes(result?.status)){
    gate.hidden=false;shell.hidden=true;shell.inert=true;
    document.querySelector('#entry-status').textContent=result?.status==='LOGIN_REQUIRED'?'로그인이 필요합니다. 아래 버튼으로 시작하세요.':result?.status==='LOGIN_OPEN'?'열려 있는 보안 로그인 창에서 계속해주세요.':result?.status==='DISCONNECTED'?'로그아웃했습니다. 다시 로그인할 수 있습니다.':result?.message||'연결을 확인하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.';
  }
  if (result?.status === 'READY' || result?.status === 'PARTIAL') {
    if (scopeDetails[result.scope]) selectedScope = result.scope;
    if(['ALL','CAFE24','NAVER','COUPANG'].includes(result.channel))selectedChannel=result.channel;
    if(result.filters&&typeof result.filters.delayOnly==='boolean'&&typeof result.filters.giftOnly==='boolean')serverFilters=Object.freeze({...serverFilters,...result.filters});
    scopeControlsAvailable = true;
    displayMode = 'live';
    if(!businessLoaded){businessLoaded=true;void refreshBusinesses();}
    connectionResult = result;
    if(selectedChannel==='ALL'&&!serverFilters.delayOnly&&!serverFilters.giftOnly)overviewValues[result.scope]={status:result.status,total:result.total,checkedAt:result.checkedAt};
    displayedOrders = Object.freeze(result.orders.map((order) => Object.freeze({
      hubOrderId: typeof order.hubOrderId === 'string' ? order.hubOrderId : '', platform: typeof order.platform === 'string' ? order.platform : '',
      productName: typeof order.productName === 'string' ? order.productName : '', stage: typeof order.stage === 'string' ? order.stage : '',
      quantity: typeof order.quantity === 'number' && Number.isFinite(order.quantity) ? order.quantity : null,
      amount: typeof order.amount === 'number' && Number.isFinite(order.amount) ? order.amount : null,
      orderedAt: typeof order.orderedAt === 'string' ? order.orderedAt : null,
      // The Main-process projection already strips provider fields and bounds this DTO.
      details: order.details || null,
      visual: order.visual || null,
      preflight: order.preflight || null,
      registrationEligible: order.registrationEligible === true,
      issueAndRegisterEligible: order.issueAndRegisterEligible === true,
    })));
    orderSearch.value = '';
    closeOrderDetail();
    renderOrders();
    updateConnectionChrome(result.message);
    renderShippingFollowup();
    renderFreshness(result.status==='PARTIAL'?'UNAVAILABLE':freshnessChanged?'CHANGED':'CURRENT',result.checkedAt);
    if(!historyAutoLoaded&&!registrationBusy){historyAutoLoaded=true;historyAutoStarting=true;document.querySelector('#server-history-load').click();document.querySelector('#shipping-history-load').click();historyAutoStarting=false;}
    return;
  }
  if (result?.status === 'LOGIN_OPEN') {
    scopeControlsAvailable = false;
    clearDisplayedOrders('connecting', result.message || '하린식품 로그인 창에서 로그인을 완료하세요.');
    return;
  }
  scopeControlsAvailable = ['UNAVAILABLE', 'SNAPSHOT_CHANGED'].includes(result?.status);
  clearDisplayedOrders(result?.status === 'DISCONNECTED' ? 'disconnected' : 'error', result?.message || '주문 조회를 완료하지 못했습니다. 잠시 후 다시 확인하세요.');
}

async function runHubAction(action) {
  if(freshnessReloadBusy)return;
  selectedOrderIds.clear();
  const generation = ++actionGeneration;
  const requestedScope = scopeByAction[action];
  if (requestedScope) {
    selectedScope = requestedScope;
    scopeControlsAvailable = true;
    clearDisplayedOrders('connecting', `${selectedScopeDetail().range} 첫 페이지를 조회하고 있습니다.`);
  }
  if (action === 'connect' || action === 'refresh') {
    if(action==='connect'){shippingFollowup.clear();historyGeneration++;historyAutoLoaded=false;}
    if (action === 'connect') scopeControlsAvailable = false;
    clearDisplayedOrders('connecting', action === 'connect' ? '별도 하린식품 로그인 창을 확인하세요. 로그인 완료 후 저장 주문을 조회합니다.' : `${selectedScopeDetail().range}을 다시 조회하고 있습니다.`);
  }
  if (action === 'nextPage' || action === 'previousPage') clearDisplayedOrders('connecting', action === 'nextPage' ? '다음 주문 페이지를 조회하고 있습니다.' : '이전 주문 페이지를 조회하고 있습니다.');
  if (action === 'disconnect') {
    historyGeneration++;historyAutoLoaded=false;
    clearCollection();
    shippingFollowup.clear();
    selectedChannel='ALL';
    clearOverview();
    clearBusinesses();
    selectedScope = 'ACTIVE';
    scopeControlsAvailable = false;
    clearDisplayedOrders('connecting', '실제 주문을 비우고 연결 정보를 지우고 있습니다.');
  }
  try {
    const bridge = window.moaonHub;
    if (!bridge || typeof bridge[action] !== 'function') throw new Error('Bridge unavailable');
    let result;
    if (action === 'connect') {
      result = await bridge.viewActive();
      if (generation !== actionGeneration) return;
      if (result.status === 'LOGIN_REQUIRED') result = await bridge.connect();
    } else result = await bridge[action]();
    if (generation === actionGeneration) {applyHubResult(result);ensureTodayOverview();}
  } catch {
    if (generation === actionGeneration) {
      clearDisplayedOrders('error', '하린식품 연결 요청을 완료하지 못했습니다.');
      if(!document.querySelector('#entry-screen').hidden)document.querySelector('#entry-status').textContent='연결을 확인하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.';
    }
  }
}

const shippingFollowup=new Map();
let historyAutoLoaded=false;
let historyAutoStarting=false;
let historyGeneration=0;
document.querySelector('#server-history-load').addEventListener('click',async()=>{
  const automatic=historyAutoStarting;
  const button=document.querySelector('#server-history-load'),status=document.querySelector('#server-history-status'),panel=document.querySelector('#server-shipping-history');
  if(button.disabled||displayMode!=='live'||registrationBusy)return;
  const expected=historyGeneration;button.disabled=true;button.hidden=true;button.parentElement.hidden=false;panel.hidden=true;panel.replaceChildren();status.textContent='등록 이력 자동 확인 중…';
  try{
    const result=await window.moaonHub.readServerShippingHistory();
    if(expected!==historyGeneration||displayMode!=='live')return;
    if(result?.status!=='READY'){status.textContent='서버 이력 확인 필요 · 잠시 뒤 다시 조회하세요.';return;}
    button.parentElement.hidden=true;
    status.textContent=result.orders.length?`${result.orders.length}건 · 서버 저장 기록 기준`:'조회 범위에 서버 송장 등록 기록이 없습니다.';
    if(!result.orders.length)return;
    panel.hidden=false;panel.open=!automatic;panel.append(makeElement('summary','',`송장 등록 이력 · ${result.orders.length}건`),makeElement('p','','서버의 최근 등록 작업 최대 300개 기준입니다. 우체국 발급 전체 이력이나 현재 배송상태가 아닙니다.'));
    const labels={REGISTERED:'등록 성공 기록',PENDING:'처리 대기 기록',FAILED:'실패 기록',CHECK_REQUIRED:'결과 확인 필요'};
    for(const row of result.orders){
      const item=makeElement('div','auto-shipping-item');item.append(makeElement('span','',row.hubOrderId),makeElement('strong','',labels[row.status]||labels.CHECK_REQUIRED));
      const find=makeElement('button','secondary-action','주문 찾기');find.type='button';find.addEventListener('click',()=>{if(expected===historyGeneration)void findFollowupOrder(row.hubOrderId);});item.append(find);panel.append(item);
    }
  }catch{if(expected===historyGeneration)status.textContent='서버 이력 확인 필요 · 다시 조회하세요.';}
  finally{button.disabled=false;button.hidden=false;button.textContent='등록 이력 다시 확인';}
});
document.querySelector('#shipping-history-load').addEventListener('click',async()=>{
  const button=document.querySelector('#shipping-history-load'),status=document.querySelector('#shipping-history-status');
  if(button.disabled||displayMode!=='live'||registrationBusy)return;
  const expected=historyGeneration;button.disabled=true;button.hidden=true;button.parentElement.hidden=false;status.textContent='미완료 출고 자동 확인 중…';
  try{
    const result=await window.moaonHub.restoreShippingHistory();
    if(expected!==historyGeneration||displayMode!=='live')return;
    if(result?.status!=='READY'){status.textContent='기록 확인 필요 · 목록을 새로 조회한 뒤 다시 확인하세요.';return;}
    button.parentElement.hidden=true;
    for(const row of result.orders||[])if(/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(row.hubOrderId))shippingFollowup.set(row.hubOrderId,{status:'CHECK_REQUIRED'});
    status.textContent=result.orders?.length?`${result.orders.length}건 복원 · 과거 기록이며 현재 상태 확인이 필요합니다.`:'복원할 미확정 기록이 없습니다.';
    renderShippingFollowup();
  }catch{if(expected===historyGeneration)status.textContent='기록 확인 필요 · 잠시 뒤 다시 확인하세요.';}
  finally{button.disabled=false;button.hidden=false;button.textContent='출고 기록 다시 확인';}
});
async function findFollowupOrder(id){
  if(displayMode!=='live'||registrationBusy)return;
  const expected=++actionGeneration;
  clearDisplayedOrders('connecting','출고 주문을 찾는 중입니다. 해당 채널에서 최대 8페이지를 조회합니다.');
  try{
    const result=await window.moaonHub.findOrder(id);
    if(expected!==actionGeneration)return;
    applyHubResult(result.page||{status:'UNAVAILABLE',message:'주문 찾기를 완료하지 못했습니다. 목록을 다시 조회하세요.'});
    if(displayMode!=='live')return;
    const status=document.querySelector('#shipping-history-status');
    if(result.status==='FOUND'){
      const order=displayedOrders.find(order=>orderId(order)===id),button=[...orderList.querySelectorAll('.order-row')].find(button=>button.dataset.orderId===id);
      if(order&&button)showOrderDetail(order,button);
      status.textContent='주문을 찾았습니다. 현재 주문 상태를 확인하세요.';
    }else status.textContent=result.status==='SEARCH_LIMIT'?'검색 범위 초과 · 현재 페이지에서 다음 페이지를 확인하세요.':result.status==='NOT_FOUND'?'조회한 주문 구간에 해당 주문이 없습니다. 이전 기록은 유지합니다.':'주문 조회 확인 필요 · 목록을 다시 조회하세요.';
  }catch{if(expected===actionGeneration)clearDisplayedOrders('error','주문 찾기에 실패했습니다. 다시 조회하세요.');}
}
function renderShippingFollowup(){
  if(displayMode!=='live')document.querySelector('.server-history-tools').hidden=true;
  if(displayMode!=='live'){document.querySelector('#server-history-status').textContent='';const serverPanel=document.querySelector('#server-shipping-history');serverPanel.hidden=true;serverPanel.replaceChildren();}
  if(displayMode!=='live')document.querySelector('.shipping-history-tools').hidden=true;
  if(displayMode!=='live')document.querySelector('#shipping-history-status').textContent='';
  const panel=document.querySelector('#shipping-followup');
  panel.replaceChildren();panel.hidden=displayMode!=='live'||!shippingFollowup.size;
  if(panel.hidden)return;
  panel.append(makeElement('summary','',`출고 확인 목록 · ${shippingFollowup.size}건`));
  panel.append(makeElement('p','','이전 결과입니다. 현재 처리 상태는 주문을 다시 확인하세요. 화면 목록은 로그아웃 시 비워지며 이전 기록은 로그인 후 불러올 수 있습니다.'));
  for(const [id,result] of shippingFollowup){
    const row=makeElement('div','auto-shipping-item');
    const state={PENDING:'처리 대기',FAILED:'실패',CHECK_REQUIRED:'결과 확인 필요'}[result.status]||'결과 확인 필요';
    row.append(makeElement('span','',id),makeElement('strong','',`${state} · 이전 결과`));
    const open=makeElement('button','secondary-action','주문 확인');open.type='button';
    const order=displayedOrders.find(order=>orderId(order)===id);open.disabled=registrationBusy;
    if(!order)open.textContent='주문 찾기';
    open.addEventListener('click',()=>{
      if(displayMode!=='live'||registrationBusy)return;
      const current=displayedOrders.find(order=>orderId(order)===id);
      if(!current){void findFollowupOrder(id);return;}
      if(current){orderSearch.value='';reviewFilter='ALL';renderOrders();}
      const button=[...orderList.querySelectorAll('.order-row')].find(button=>button.dataset.orderId===id);
      if(current&&button)showOrderDetail(current,button);
    });row.append(open);
    if(!order)row.append(makeElement('span','','현재 페이지에 없음 · 찾기를 누르면 해당 채널에서 최대 8페이지 조회'));
    panel.append(row);
  }
}
function clearRegistrationResults(kind='all'){
  if(kind!=='manual'){
    document.querySelector('#auto-shipping-results').hidden=true;
    document.querySelector('#auto-shipping-results').replaceChildren();
  }
  if(kind==='auto')return;
  document.querySelector('#registration-results').hidden=true;
  document.querySelector('#registration-status').textContent='';
  document.querySelector('#registration-items').replaceChildren();
  document.querySelectorAll('[data-manual-history-refresh]').forEach(button=>button.remove());
}

function appendManualHistoryRefresh(panel,generation){
  panel.querySelectorAll('[data-manual-history-refresh]').forEach(button=>button.remove());
  const refresh=makeElement('button','secondary-action','서버 등록 이력 다시 확인');refresh.type='button';
  refresh.dataset.manualHistoryRefresh='';
  refresh.addEventListener('click',()=>{
    if(generation!==actionGeneration||displayMode!=='live'||registrationBusy)return;
    document.querySelector('#server-history-load').click();
  });
  panel.append(refresh);
}

function appendTrackingOutcome(parent,id,status,generation){
  const note=makeElement('div','registration-tracking');
  note.append(makeElement('span','',status==='PENDING'?'배송추적 요청 접수 · 완료 아님':'송장 등록 완료 · 배송추적 확인 필요'));
  const open=makeElement('button','secondary-action','주문·추적 열기');open.type='button';
  open.addEventListener('click',()=>{if(generation===actionGeneration&&displayMode==='live'&&!registrationBusy)void findFollowupOrder(id);});
  note.append(open);parent.append(note);
}

function appendShipmentRecovery(parent,id,generation){
  const button=makeElement('button','secondary-action','주문·발급 상태 확인');button.type='button';
  button.title='현재 주문을 조회합니다. 송장 발급·등록을 다시 전송하지 않습니다.';
  button.addEventListener('click',()=>{
    if(generation!==actionGeneration||displayMode!=='live'||orderToolsBusy())return;
    void findFollowupOrder(id);
  });
  parent.append(button);
}

async function runAutomaticShipping(explicitIds){
  if(orderToolsBusy()||displayMode!=='live')return;
  const ids=explicitIds||[...selectedOrderIds];
  if(!ids.length||ids.length>20||ids.some(id=>!displayedOrders.some(order=>orderId(order)===id&&order.issueAndRegisterEligible)))return;
  const generation=actionGeneration;
  const panel=document.querySelector('#auto-shipping-results');
  const previousNodes=[...panel.childNodes],previousRows=[...panel.querySelectorAll('.auto-shipping-item')];
  registrationBusy=true;clearRegistrationResults('auto');renderSelection();
  panel.hidden=false;panel.setAttribute('aria-busy','true');
  panel.append(makeElement('strong','','자동 출고 처리'),makeElement('p','','준비 확인 → 우체국 발급 → 플랫폼 등록'),makeElement('p','','확인창에서 승인하면 진행합니다. 대기 작업은 완료 확인 전까지 성공으로 표시하지 않습니다.'));
  const current=()=>generation===actionGeneration&&displayMode==='live';
  try{
    const result=await window.moaonHub.issueAndRegister(ids);
    if(!current())return;
    panel.replaceChildren(makeElement('strong','','자동 발급·등록 결과'));
    if(['COMPLETED','PARTIAL'].includes(result?.status)){
      const phases={PREPARE:'준비 처리',ISSUE:'송장 발급',REGISTER:'플랫폼 등록'};
      const labels={REGISTERED:'등록 완료',PENDING:'처리 대기 · 완료 아님',FAILED:'실패 · 원인 확인 필요',CHECK_REQUIRED:'결과 확인 필요 · 재발급 금지'};
      const complete=new Set();
      const rowsById=new Map(previousRows.map(line=>[line.dataset.orderId,line]));
      for(const id of ids){
        const matches=Array.isArray(result.results)?result.results.filter(row=>row?.hubOrderId===id):[];
        const row=matches.length===1?matches[0]:{};
        const line=makeElement('div','auto-shipping-item');
        line.dataset.orderId=id;
        line.dataset.state=labels[row.status]?row.status:'CHECK_REQUIRED';
        if(row.status==='REGISTERED')shippingFollowup.delete(id);
        else shippingFollowup.set(id,{status:labels[row.status]?row.status:'CHECK_REQUIRED'});
        line.append(makeElement('span','',`${id} · ${phases[row.phase]||'출고 처리'}`),makeElement('strong','',labels[row.status]||labels.CHECK_REQUIRED));
        if(row.status==='REGISTERED'){complete.add(id);appendTrackingOutcome(line,id,row.trackingStatus,generation);}
        if(!['REGISTERED','PENDING'].includes(row.status))appendShipmentRecovery(line,id,generation);
        if(row.status==='PENDING'){
          const resume=makeElement('button','secondary-action','진행 다시 확인');resume.type='button';
          resume.addEventListener('click',()=>void runAutomaticShipping([id]));line.append(resume);
        }
        rowsById.set(id,line);
      }
      panel.append(...rowsById.values());
      displayedOrders=Object.freeze(displayedOrders.map(order=>complete.has(orderId(order))?Object.freeze({...order,issueAndRegisterEligible:false,registrationEligible:false}):order));
      selectedOrderIds.clear();
      panel.append(makeElement('p','','발급 번호는 재사용합니다. 결과 불명·실패 주문은 새 번호를 발급하지 말고 기존 작업을 확인하세요.'));
      if([...rowsById.values()].some(line=>line.dataset.state==='REGISTERED')){
        const openRegistered=makeElement('button','auto-result-navigation','등록된 주문 보기');openRegistered.type='button';
        openRegistered.addEventListener('click',()=>void runHubAction('viewRegistered'));panel.append(openRegistered);
      }
    }else{
      if(!['REVIEW_CANCELLED','BUSY'].includes(result?.status))for(const id of ids)shippingFollowup.set(id,{status:'CHECK_REQUIRED'});
      const messages={REVIEW_CANCELLED:'취소했습니다. 새 작업을 전송하지 않았습니다.',BUSY:'다른 출고 작업이 진행 중입니다.',CHECK_REQUIRED:'주문 정보 또는 기존 작업 확인이 필요합니다.',DISCONNECTED:'연결이 변경됐습니다. 기존 작업 결과를 먼저 확인하세요.',UNAVAILABLE:'작업 결과를 확인하지 못했습니다. 재발급하지 말고 기존 작업을 확인하세요.'};
      if(previousNodes.length){
        panel.replaceChildren(...previousNodes);
        panel.append(makeElement('p','',result?.status==='REVIEW_CANCELLED'?'이번 재확인만 취소했습니다. 기존 작업은 취소되지 않았습니다.':messages[result?.status]||messages.CHECK_REQUIRED));
      }else panel.append(makeElement('p','',messages[result?.status]||messages.CHECK_REQUIRED));
    }
  }catch{if(current()){for(const id of ids)shippingFollowup.set(id,{status:'CHECK_REQUIRED'});panel.replaceChildren(...previousNodes,makeElement('strong','','결과 확인 필요'),makeElement('p','','통신을 확인하지 못했습니다. 새로 발급하지 말고 기존 작업 상태를 확인하세요.'));}}
  finally{registrationBusy=false;panel.removeAttribute('aria-busy');renderSelection();renderShippingFollowup();}
}

async function runSelectedDocument(kind){
  if(!['csv','labels','packing','dispatch'].includes(kind)||registrationBusy||collectionBusy||collectionShipmentLocks.size>0||displayMode!=='live'||document.querySelector(`#selection-${kind}`).disabled)return;
  const ids=[...selectedOrderIds],expected=actionGeneration;
  registrationBusy=true;clearRegistrationResults('documents');renderSelection();
  const detailButtons=[...detailPanel.querySelectorAll('button')].map(button=>({button,disabled:button.disabled}));
  for(const {button} of detailButtons)button.disabled=true;
  const panel=document.querySelector('#registration-results'),status=document.querySelector('#registration-status');
  panel.hidden=false;status.textContent=kind==='csv'?'선택 주문을 확인하고 CSV 저장 위치를 선택합니다.':kind==='labels'?'선택 송장과 배송정보를 확인하고 있습니다.':`선택 주문으로 ${kind==='packing'?'포장명세서 A4':'출고 작업표 A4'}를 준비합니다.`;
  try{
    const result=kind==='csv'?await window.moaonHub.exportSelectedCsv(ids):kind==='labels'?await window.moaonHub.previewLabels(ids):await window.moaonHub.previewWorklist(ids,kind);
    if(expected!==actionGeneration||displayMode!=='live')return;
    const messages={PREVIEW_OPEN:kind==='labels'?`송장 ${ids.length}건 미리보기를 열었습니다 · 인쇄는 미리보기 창에서 진행하세요`:`${kind==='packing'?'포장명세서 A4':'출고 작업표 A4'} 미리보기를 열었습니다 · 인쇄는 미리보기 창에서 진행하세요`,CSV_SAVED:`선택 주문 ${ids.length}건 CSV를 저장했습니다`,SAVE_CANCELLED:'CSV 저장을 취소했습니다',FILE_EXISTS:'같은 이름의 파일이 있습니다 · 다른 이름으로 저장하세요',DOCUMENT_CHANGED:'주문이나 연결이 변경되었습니다 · 목록을 다시 조회하세요',DOCUMENT_UNAVAILABLE:'문서를 준비하지 못했습니다 · 주문 내용과 페이지 범위를 확인하세요',DOCUMENT_ITEM_LIMIT:'상품이 8종 표시되어 전체 목록인지 확인할 수 없습니다 · 주문 상세에서 전체 상품을 확인하세요',PRINT_UNAVAILABLE:'송장 미리보기 확인 필요 · 배송정보와 용지 크기를 확인하세요',BUSY:'다른 작업이 진행 중입니다'};
    status.textContent=result?.status==='SAVE_CHECK_REQUIRED'?'CSV 저장 결과 확인 필요 · 다시 저장하기 전에 선택한 폴더의 파일을 확인하세요':messages[result?.status]||'문서 처리 결과 확인 필요 · 목록을 다시 조회하세요';
  }catch{if(expected===actionGeneration&&displayMode==='live')status.textContent='문서를 준비하지 못했습니다 · 다시 확인하세요';}
  finally{registrationBusy=false;for(const {button,disabled} of detailButtons)if(button.isConnected)button.disabled=disabled;renderSelection();}
}
async function changeOrderChannel(channel){
  if(!['ALL','CAFE24','NAVER','COUPANG'].includes(channel))return;
  if(orderToolsBusy())return renderOrders();
  const generation=++actionGeneration;
  selectedChannel=channel;reviewFilter='ALL';
  clearDisplayedOrders('connecting','선택한 채널의 저장 주문을 조회하고 있습니다.');
  try{
    const result=await window.moaonHub.viewChannel(channel);
    if(generation===actionGeneration)applyHubResult(result);
  }catch{if(generation===actionGeneration)clearDisplayedOrders('error','채널 주문을 조회하지 못했습니다. 다시 조회하세요.');}
}

async function changeServerFilters(next){
 if(displayMode!=='live'||orderToolsBusy())return renderOrders();
 const generation=++actionGeneration;serverFilters=Object.freeze({...next});reviewFilter='ALL';orderSearch.value='';orderSort.value='DEFAULT';
 selectedOrderIds.clear();clearDisplayedOrders('connecting','전체 조회 조건을 적용해 첫 페이지를 조회하고 있습니다.');
 try{const result=await window.moaonHub.setOrderFilters(serverFilters);if(generation===actionGeneration)applyHubResult(result);}
 catch{if(generation===actionGeneration)clearDisplayedOrders('error','주문 필터를 적용하지 못했습니다. 이전 결과를 정상 목록으로 표시하지 않습니다.');}
}

async function registerSelectedInvoices(){
  if(registrationBusy||displayMode!=='live')return;
  const ids=[...selectedOrderIds];
  if(!ids.length||ids.length>20||ids.some(id=>!displayedOrders.some(order=>orderId(order)===id&&order.registrationEligible===true)))return;
  const generation=actionGeneration;
  registrationBusy=true;clearRegistrationResults('manual');renderSelection();
  const panel=document.querySelector('#registration-results'),status=document.querySelector('#registration-status'),items=document.querySelector('#registration-items');
  panel.hidden=false;status.textContent='선택한 발급 송장의 등록 내용을 확인하고 있습니다.';
  const current=()=>generation===actionGeneration&&displayMode==='live';
  const disableAttempted=()=>{
    const attempted=new Set(ids);
    displayedOrders=Object.freeze(displayedOrders.map(order=>attempted.has(orderId(order))?Object.freeze({...order,registrationEligible:false}):order));
    selectedOrderIds.clear();
  };
  try{
    const result=await window.moaonHub.registerInvoices(ids);
    if(!current())return;
    const messages={REGISTERED:'쇼핑몰 등록 완료',PENDING:'처리 대기 · 등록 완료 아님',FAILED:'등록 실패 · 주문·발급 상태를 확인하세요',CHECK_REQUIRED:'등록 여부 확인 필요 · 재전송하지 마세요'};
    if(['COMPLETED','PARTIAL'].includes(result?.status)){
      const rows=ids.map(id=>{
        const matches=Array.isArray(result.results)?result.results.filter(row=>row?.hubOrderId===id):[];
        return {id,state:matches.length===1&&Object.hasOwn(messages,matches[0].status)?matches[0].status:'CHECK_REQUIRED',trackingStatus:matches.length===1?matches[0].trackingStatus:undefined};
      });
      for(const row of rows){
        if(row.state==='REGISTERED')shippingFollowup.delete(row.id);
        else shippingFollowup.set(row.id,{status:row.state});
      }
      status.textContent=rows.every(row=>row.state==='REGISTERED')?'선택 송장 등록 완료':'송장 등록 결과를 확인하세요';
      items.replaceChildren(...rows.map(row=>{
        const item=makeElement('li','registration-result-item');
        item.dataset.state=row.state;
        item.append(makeElement('span','',row.id),makeElement('strong','',messages[row.state]));
        if(row.state==='REGISTERED')appendTrackingOutcome(item,row.id,row.trackingStatus,generation);
        else appendShipmentRecovery(item,row.id,generation);
        return item;
      }));
      if(rows.some(row=>row.state!=='REGISTERED'))appendManualHistoryRefresh(panel,generation);
      disableAttempted();
    }else{
      const messages={REVIEW_CANCELLED:'송장 등록을 취소했습니다 · 전송하지 않았습니다',ORDER_CHANGED:'주문이 변경되었습니다 · 목록을 다시 조회하세요',CHECK_REQUIRED:'송장 등록 조건 확인 필요 · 웹 허브에서 확인하세요',BUSY:'다른 확인 작업이 진행 중입니다',DISCONNECTED:'연결이 변경되어 등록 결과를 확인하지 못했습니다',UNAVAILABLE:'등록 여부 확인 필요 · 웹 허브에서 확인하세요'};
      status.textContent=messages[result?.status]||'등록 결과 확인 필요 · 웹 허브에서 확인하세요';
      if(!['REVIEW_CANCELLED','BUSY'].includes(result?.status)){
        for(const id of ids)shippingFollowup.set(id,{status:'CHECK_REQUIRED'});
        appendManualHistoryRefresh(panel,generation);
        disableAttempted();
      }
    }
  }catch{if(current()){
    status.textContent='등록 결과 확인 필요 · 재전송하지 말고 웹 허브에서 확인하세요';
    for(const id of ids)shippingFollowup.set(id,{status:'CHECK_REQUIRED'});
    appendManualHistoryRefresh(panel,generation);
    disableAttempted();
  }}
  finally{registrationBusy=false;renderSelection();renderShippingFollowup();}
}

async function returnToSample() {
  historyGeneration++;historyAutoLoaded=false;
  clearCollection();
  clearBusinesses();
  const generation = ++actionGeneration;
  clearDisplayedOrders('connecting', '실제 주문을 비우고 샘플 화면으로 돌아가고 있습니다.');
  try {
    const result = await window.moaonHub?.disconnect?.();
    if (result?.status !== 'DISCONNECTED') {
      if (generation === actionGeneration) applyHubResult(result);
      return;
    }
  } catch {
    if (generation === actionGeneration) clearDisplayedOrders('error', '연결 정보 삭제를 완료하지 못했습니다. 연결 해제를 다시 시도하세요.');
    return;
  }
  if (generation !== actionGeneration) return;
  displayMode = 'sample';
  selectedChannel='ALL';
  serverFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});
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
  document.querySelector('#theme-toggle').setAttribute('aria-pressed', String(normalizedTheme === 'dark'));
  for (const button of themeButtons) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === normalizedTheme));
  try { localStorage.setItem('moaon-preview-theme', normalizedTheme); } catch { /* Visible theme still applies. */ }
}

for (const button of navButtons) button.addEventListener('click', () => showRoute(button.dataset.route, { focusHeading: true }));
for (const button of themeButtons) button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
for (const button of connectionButtons) button.addEventListener('click', () => button.dataset.action === 'sample-mode' ? void returnToSample() : void runHubAction(button.dataset.action.replace('hub-', '')));
orderSearch.addEventListener('input', renderOrders);
orderChannel.addEventListener('change',()=>void changeOrderChannel(orderChannel.value));
document.querySelector('#order-delay-only').addEventListener('change',event=>void changeServerFilters({...serverFilters,delayOnly:event.target.checked}));
document.querySelector('#order-gift-only').addEventListener('change',event=>void changeServerFilters({...serverFilters,giftOnly:event.target.checked}));
const globalToggle=document.querySelector('#order-global-search-toggle'),globalPanel=document.querySelector('#order-global-search-panel');
globalToggle.addEventListener('click',()=>{const open=globalToggle.getAttribute('aria-expanded')!=='true';globalToggle.setAttribute('aria-expanded',String(open));globalPanel.hidden=!open;globalPanel.inert=!open;if(open)document.querySelector('#order-global-query').focus();});
globalPanel.addEventListener('submit',async event=>{event.preventDefault();if(orderToolsBusy()||displayMode!=='live')return;const search={query:document.querySelector('#order-global-query').value.trim(),start:document.querySelector('#order-global-start').value,end:document.querySelector('#order-global-end').value};const status=document.querySelector('#order-global-status');if(search.start&&search.end&&search.start>search.end){status.textContent='시작일은 종료일보다 늦을 수 없습니다.';return;}const generation=++actionGeneration;selectedOrderIds.clear();clearDisplayedOrders('connecting','전체 검색 조건을 적용하고 있습니다.');try{const result=await window.moaonHub.applyOrderSearch(search);if(generation===actionGeneration){serverFilters=Object.freeze({...serverFilters,...search});applyHubResult(result);status.textContent=['READY','PARTIAL'].includes(result.status)?'검색 조건을 적용했습니다.':'검색 조건을 적용하지 못했습니다.';}}catch{if(generation===actionGeneration)clearDisplayedOrders('error','전체 검색을 완료하지 못했습니다.');}});
document.querySelector('#order-global-reset').addEventListener('click',()=>{for(const id of ['order-global-query','order-global-start','order-global-end'])document.querySelector(`#${id}`).value='';globalPanel.requestSubmit();});
document.querySelector('#order-global-export').addEventListener('click',async()=>{if(orderToolsBusy()||displayMode!=='live')return;const status=document.querySelector('#order-global-status');const generation=actionGeneration;registrationBusy=true;renderSelection();renderGlobalSearch();status.textContent='현재 조건의 주문을 안전하게 준비하고 있습니다.';try{const result=await window.moaonHub.exportOrdersXlsx();if(generation!==actionGeneration)return;status.textContent=({XLSX_SAVED:'엑셀 파일을 저장했습니다.',SAVE_CANCELLED:'엑셀 저장을 취소했습니다.',FILE_EXISTS:'같은 이름의 파일이 있습니다. 다른 이름으로 저장하세요.',NO_ORDERS:'조건에 맞는 주문이 없어 파일을 만들지 않았습니다.',EXPORT_LIMIT_EXCEEDED:'5,000건을 초과했습니다. 기간을 줄여 다시 저장하세요.',PARTIAL_EXPORT_BLOCKED:'일부 채널을 확인하지 못해 저장하지 않았습니다.',DOCUMENT_CHANGED:'주문이나 검색 조건이 변경되어 저장하지 않았습니다.'})[result?.status]||'엑셀 파일을 저장하지 못했습니다. 다시 확인하세요.';}catch{if(generation===actionGeneration)status.textContent='엑셀 파일을 저장하지 못했습니다. 다시 확인하세요.';}finally{registrationBusy=false;renderSelection();renderGlobalSearch();}});
orderSort.addEventListener('change',renderOrders);
document.querySelector('#selection-clear').addEventListener('click',()=>{selectedOrderIds.clear();closeOrderDetail({restoreFocus:true});renderSelection();});
document.querySelector('#order-select-all').addEventListener('change',event=>{
  selectedOrderIds.clear();
  if(event.target.checked)for(const box of orderList.querySelectorAll('.order-select:not(:disabled)'))selectedOrderIds.add(box.closest('.order-item').querySelector('.order-row').dataset.orderId);
  renderSelection();
});
document.querySelector('#selection-register').addEventListener('click',()=>void registerSelectedInvoices());
document.querySelector('#selection-labels').addEventListener('click',()=>void runSelectedDocument('labels'));
document.querySelector('#selection-csv').addEventListener('click',()=>void runSelectedDocument('csv'));
document.querySelector('#selection-packing').addEventListener('click',()=>void runSelectedDocument('packing'));
document.querySelector('#selection-dispatch').addEventListener('click',()=>void runSelectedDocument('dispatch'));
const selectionMenu=document.querySelector('.selection-more');
selectionMenu.addEventListener('click',event=>{if(event.target.closest('button:not(:disabled)'))selectionMenu.open=false;});
document.addEventListener('pointerdown',event=>{if(selectionMenu.open&&!selectionMenu.contains(event.target))selectionMenu.open=false;});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.isComposing)return;
  if(selectionMenu.open){event.preventDefault();event.stopImmediatePropagation();selectionMenu.open=false;selectionMenu.querySelector('summary').focus();return;}
  const filters=document.querySelector('.order-more-filters');
  if(filters.open&&filters.contains(event.target)){
    event.preventDefault();event.stopImmediatePropagation();filters.open=false;filters.querySelector('summary').focus();return;
  }
  if(!globalPanel.hidden&&(globalPanel.contains(event.target)||event.target===globalToggle)){
    event.preventDefault();event.stopImmediatePropagation();globalToggle.setAttribute('aria-expanded','false');globalPanel.hidden=true;globalPanel.inert=true;globalToggle.focus();
  }
},true);
document.querySelector('#selection-auto-ship').addEventListener('click',()=>void runAutomaticShipping());
document.querySelector('#selection-review').addEventListener('click',()=>{
  const id=[...selectedOrderIds][0]||selectedOrderId,order=displayedOrders.find(item=>orderId(item)===id);
  const button=[...orderList.querySelectorAll('.order-row')].find(row=>row.dataset.orderId===id);
  if(order&&button)showOrderDetail(order,button);
});
document.querySelector('#order-tools-reset').addEventListener('click',()=>{
  if(orderToolsBusy())return;
  orderSearch.value='';orderSort.value='DEFAULT';reviewFilter='ALL';
  if(selectedChannel!=='ALL'||serverFilters.delayOnly||serverFilters.giftOnly||serverFilters.query||serverFilters.start||serverFilters.end){
    for(const id of ['order-global-query','order-global-start','order-global-end'])document.querySelector(`#${id}`).value='';
    selectedChannel='ALL';serverFilters=Object.freeze({delayOnly:false,giftOnly:false,query:'',start:'',end:''});selectedOrderIds.clear();
    const generation=++actionGeneration;clearDisplayedOrders('connecting','검색과 전체 조회 조건을 초기화해 첫 페이지를 조회하고 있습니다.');
    void window.moaonHub.resetOrderFilters().then(result=>{if(generation===actionGeneration)applyHubResult(result);}).catch(()=>{if(generation===actionGeneration)clearDisplayedOrders('error','필터 초기화를 완료하지 못했습니다.');});
  }
  else renderOrders();
  orderSearch.focus();
});
document.querySelector('#sidebar-toggle').addEventListener('click', (event) => {
  const collapsed = document.querySelector('.preview-shell').classList.toggle('is-sidebar-collapsed');
  event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
  event.currentTarget.setAttribute('aria-label', collapsed ? '메뉴 펼치기' : '메뉴 접기');
  event.currentTarget.title = collapsed ? '메뉴 펼치기' : '메뉴 접기';
});
document.querySelector('#quick-search').addEventListener('click', () => { showRoute('orders'); orderSearch.focus(); orderSearch.select(); });
document.querySelector('#theme-toggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&['ArrowUp','ArrowDown'].includes(event.key)&&selectedOrderId&&!document.querySelector('[data-page="orders"]').hidden){
    if(event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const label=event.key==='ArrowUp'?'이전 주문 상세':'다음 주문 상세';
    const move=detailPanel.querySelector(`[aria-label="${label}"]`);
    if(move&&!move.disabled){event.preventDefault();move.click();}return;
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && ['1', '2', '3'].includes(event.key)) {
    event.preventDefault();
    showRoute({ '1': 'today', '2': 'orders', '3': 'settings' }[event.key], { focusHeading: true });
    return;
  }
  if (event.key === 'Escape' && selectedOrderId) { event.preventDefault(); closeOrderDetail({ restoreFocus: true, animate: true }); return; }
  if (event.ctrlKey && event.key.toLocaleLowerCase('en-US') === 'k') { event.preventDefault(); showRoute('orders'); orderSearch.focus(); orderSearch.select(); return; }
  if (event.ctrlKey && event.key.toLocaleLowerCase('en-US') === 'p') { event.preventDefault(); statusbar.lastElementChild.textContent = '출력: 이 버전에서 비활성'; }
});

let savedTheme = 'light';
Promise.resolve().then(()=>window.moaonHub.appInfo()).then(info=>{
 const label=typeof info?.version==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(info.version)?`v${info.version}`:'버전 확인 필요';
 for(const item of document.querySelectorAll('[data-app-version]'))item.textContent=label;
}).catch(()=>{for(const item of document.querySelectorAll('[data-app-version]'))item.textContent='버전 확인 필요';});
let entryBusy=false;
async function enterWorkspace(){
 if(entryBusy)return;entryBusy=true;const button=document.querySelector('#entry-login');button.disabled=true;
 document.querySelector('#entry-status').textContent='로그인을 확인합니다. 필요한 경우 보안 로그인 창이 열립니다.';
 try{await runHubAction('connect');}finally{entryBusy=false;button.disabled=false;}
}
document.querySelector('#entry-login').addEventListener('click',enterWorkspace);
document.querySelector('#entry-reset').addEventListener('click',async event=>{
 if(entryBusy)return;entryBusy=true;const button=event.currentTarget;button.disabled=true;
 try{await runHubAction('disconnect');}finally{entryBusy=false;button.disabled=false;}
});
document.querySelector('#entry-printers').addEventListener('click',async event=>{
 const button=event.currentTarget;button.disabled=true;
 try{const result=await window.moaonHub.inspectPrinters();if(result.status!=='SHOWN')document.querySelector('#entry-status').textContent='프린터를 조회하지 못했습니다. 잠시 후 다시 확인하세요.';}
 catch{document.querySelector('#entry-status').textContent='프린터 조회에 실패했습니다.';}finally{button.disabled=false;}
});
document.querySelector('#printer-check').addEventListener('click',async event=>{
 const button=event.currentTarget,status=document.querySelector('#printer-check-status');
 button.disabled=true;status.textContent='Windows 프린터 목록을 확인하고 있습니다.';
 try{const result=await window.moaonHub.inspectPrinters();status.textContent=result.status==='SHOWN'?'프린터 목록 확인 완료 · 실제 출력은 별도 확인이 필요합니다.':result.status==='BUSY'?'이미 프린터를 확인하고 있습니다.':'조회하지 못했습니다. Windows 프린터 설정을 확인한 뒤 다시 시도하세요.';}
 catch{status.textContent='프린터 조회에 실패했습니다. 잠시 후 다시 시도하세요.';}
 finally{button.disabled=false;}
});
try { savedTheme = localStorage.getItem('moaon-preview-theme') || 'light'; } catch { savedTheme = 'light'; }
applyTheme(savedTheme);
closeOrderDetail();
renderOrders();
updateConnectionChrome('현재는 샘플 화면입니다. 사용자가 연결을 누르기 전에는 운영 서버를 조회하지 않습니다.');
// Check only existing authorization. Password collection stays on the trusted remote form.
void runHubAction('viewActive');
