'use strict';

const number = value => Number(value || 0);
const round = value => Math.round(number(value));
const dateOnly = value => String(value || '').slice(0, 10);

const TASK_GROUPS = [
  { id:'orders', label:'주문·출고', description:'포장과 송장 처리가 필요한 주문', view:'orders', icon:'orders' },
  { id:'cs', label:'고객·CS', description:'답변·취소·반품·교환 요청', view:'cs', icon:'customer' },
  { id:'inventory', label:'재고 위험', description:'품절·저재고·갱신 확인 상품', view:'inventory', icon:'inventory' },
  { id:'decisions', label:'결정 대기', description:'진단·목표·승인 전 확인 항목', view:'reports', icon:'approvals' },
  { id:'exceptions', label:'예외·오류', description:'수집 실패와 데이터 품질 문제', view:'collection', icon:'alerts' }
];

function dateOffset(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function revenueOf(item = {}) {
  return number(item.paid_amount ?? number(item.unit_price) * number(item.quantity));
}

function buildProductSignals({ cafe24Orders = [], cafe24OrderItems = [], coupangProducts = [], asOf } = {}) {
  const end = dateOnly(asOf) || new Date().toISOString().slice(0, 10);
  const currentStart = dateOffset(end, -6);
  const previousStart = dateOffset(end, -13);
  const previousEnd = dateOffset(end, -7);
  const rows = new Map();
  const add = ({ key, name, platform, date, revenue, stockStatus = null, daysOfStock = null }) => {
    if (!date || date < previousStart || date > end) return;
    const item = rows.get(key) || { key, name, platform, currentRevenue:0, previousRevenue:0, stockStatus, daysOfStock };
    if (date >= currentStart) item.currentRevenue += number(revenue);
    else if (date >= previousStart && date <= previousEnd) item.previousRevenue += number(revenue);
    item.stockStatus = stockStatus || item.stockStatus;
    item.daysOfStock = daysOfStock ?? item.daysOfStock;
    rows.set(key, item);
  };

  const cafeOrderDates = new Map(cafe24Orders.map(order => [String(order.order_id), dateOnly(order.order_date)]));
  for (const item of cafe24OrderItems) {
    const name = item.product_name || `Cafe24 상품 ${item.external_product_no || ''}`.trim();
    add({ key:`CAFE24:${item.external_product_no || name}`, name, platform:'CAFE24', date:cafeOrderDates.get(String(item.order_id)), revenue:revenueOf(item) });
  }
  for (const product of coupangProducts) {
    for (const day of product.daily || []) add({
      key:`COUPANG:${product.vendorItemId}`, name:product.name || `쿠팡 상품 ${product.vendorItemId}`, platform:'COUPANG',
      date:dateOnly(day.date), revenue:day.revenue, stockStatus:product.inventory?.status, daysOfStock:product.inventory?.daysOfStock
    });
  }

  const items = [...rows.values()].map(item => {
    const growthAmount = round(item.currentRevenue - item.previousRevenue);
    const growthRate = item.previousRevenue > 0 ? Number((growthAmount / item.previousRevenue * 100).toFixed(1)) : null;
    const stockRisk = ['OUT_OF_STOCK','LOW_STOCK'].includes(String(item.stockStatus || '').toUpperCase()) || (item.daysOfStock != null && number(item.daysOfStock) <= 7);
    const declineRisk = item.previousRevenue > 0 && growthRate <= -20;
    const riskReason = stockRisk
      ? String(item.stockStatus).toUpperCase() === 'OUT_OF_STOCK' ? '품절 상태라 판매 기회를 놓치고 있어요.' : `재고가 약 ${Math.max(0, Math.floor(number(item.daysOfStock)))}일분 남았어요.`
      : declineRisk ? `이전 7일보다 매출이 ${Math.abs(growthRate).toFixed(1)}% 줄었어요.` : null;
    return { ...item, currentRevenue:round(item.currentRevenue), previousRevenue:round(item.previousRevenue), growthAmount, growthRate, riskReason };
  });
  const growth = items.filter(item => item.currentRevenue > 0 && item.growthAmount > 0)
    .sort((a,b) => b.growthAmount - a.growthAmount || b.currentRevenue - a.currentRevenue).slice(0,3);
  const risk = items.filter(item => item.riskReason)
    .sort((a,b) => Number(Boolean(b.stockStatus)) - Number(Boolean(a.stockStatus)) || a.growthAmount - b.growthAmount).slice(0,3);
  return { period:{ currentStart, end, previousStart, previousEnd }, growth, risk };
}

function targetLikelihood(item = {}) {
  if (!item.platform || item.status === 'NO_DATA') return { code:'CHECK_REQUIRED', label:'확인 필요', description:'월 매출 자료를 불러온 뒤 가능성을 계산할 수 있어요.' };
  const target = number(item.revenueTarget);
  if (!target) return { code:'TARGET_REQUIRED', label:'목표 입력 필요', description:'이번 달 목표를 입력하면 가능성을 계산해드려요.' };
  const ratio = number(item.revenueForecast) / target;
  if (ratio >= 1) return { code:'HIGH', label:'달성 가능성 높음', description:'지금 속도를 유지하면 월 목표 이상이 예상돼요.' };
  if (ratio >= .9) return { code:'WATCH', label:'조금 더 필요', description:'오늘의 필요 매출을 채우면 목표권에 들어갈 수 있어요.' };
  return { code:'LOW', label:'달성 위험', description:'현재 속도라면 월말 목표가 부족할 가능성이 커요.' };
}

function buildCashflow(pacingItem = {}, profitability = {}, financialTrust = {}) {
  if (!pacingItem.platform) return { status:'CHECK_REQUIRED', expectedInflow:null, expectedAdOutflow:null, expectedOperatingOutflow:null, expectedBalance:null, description:'월 매출 자료가 없어 30일 예상치를 계산하지 않았어요.' };
  const elapsed = Math.max(1, number(pacingItem.elapsedDays));
  const expectedInflow = round(number(pacingItem.revenueActual) / elapsed * 30);
  const expectedAdOutflow = round(number(pacingItem.adSpendActual) / elapsed * 30);
  const marginRate = profitability.contribution_margin_rate == null ? null : number(profitability.contribution_margin_rate) / 100;
  const trusted = financialTrust.status === 'READY' && marginRate != null;
  const expectedOperatingOutflow = trusted ? round(expectedInflow * Math.max(0, 1 - marginRate)) : null;
  const expectedBalance = trusted ? round(expectedInflow - expectedOperatingOutflow - expectedAdOutflow) : null;
  return {
    status:trusted ? 'ESTIMATE' : 'CHECK_REQUIRED', expectedInflow, expectedAdOutflow, expectedOperatingOutflow, expectedBalance,
    description:trusted
      ? '최근 매출 속도와 입력된 원가·수수료·배송비·광고비를 30일로 환산한 예상치예요.'
      : '매출 유입과 광고비는 보이지만 원가 자료가 부족해 남을 금액은 “확인 필요”로 보호했어요.'
  };
}

function channelCards(dataHealth = {}) {
  return ['NAVER','COUPANG','CAFE24'].map(platform => {
    const item = (dataHealth.channels || []).find(channel => channel.platform === platform) || {};
    const status = item.dataMode === 'PREVIOUS' ? 'PREVIOUS' : item.status || 'WAITING';
    const labels = { READY:'정상', PARTIAL:'일부 확인', FAILED:'수집 실패', RUNNING:'수집 중', STALE:'갱신 필요', PREVIOUS:'이전 자료', WAITING:'수집 대기' };
    return { platform, status, label:labels[status] || '확인 필요', summary:item.storedSummary || '', lastSuccessAt:item.lastSuccessAt || null };
  });
}

function kstClock(now = new Date()) {
  const instant = new Date(now);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, hour:number(parts.hour), minute:number(parts.minute), minuteOfDay:number(parts.hour) * 60 + number(parts.minute) };
}

function buildSmartSchedule(now = new Date()) {
  const clock = kstClock(now);
  const state = (start, end = null) => clock.minuteOfDay < start ? 'UPCOMING' : end != null && clock.minuteOfDay >= end ? 'DONE' : 'NOW';
  const cutoffAt = `${clock.date}T15:00:00+09:00`;
  return {
    date:clock.date,
    cutoff_at:cutoffAt,
    cutoff_state:clock.minuteOfDay < 900 ? 'BEFORE' : 'AFTER',
    items:[
      { id:'SYNC', time:'06:00', label:'채널 자료 자동수집', description:'네이버·쿠팡·Cafe24 최신 자료 확인', status:state(360, 540), view:'collection' },
      { id:'SHIP', time:'09:00–15:00', label:'오늘 출고 주문 처리', description:'15시 이전 주문은 당일출고 우선', status:state(540, 900), view:'orders' },
      { id:'REGISTER', time:'15:00–18:00', label:'송장·플랫폼 반영 확인', description:'발급 송장과 채널 등록 실패 재확인', status:state(900, 1080), view:'orders' },
      { id:'REVIEW', time:'18:00 이후', label:'예외·재시도 정리', description:'실패 수집과 장기 미처리 항목 마감', status:state(1080), view:'collection' }
    ]
  };
}

function buildDailyOperations({ unifiedOrders = {}, customerService = {}, unifiedInventory = {}, reliabilityCenter = {}, alerts = [], priorityCenter = {}, dataHealth = {}, now = new Date() } = {}) {
  const tasks = new Map();
  const exceptions = new Map();
  const addTask = (key, group, detail = {}) => {
    if (!key || tasks.has(key)) return;
    tasks.set(key, { key, group, ...detail });
  };
  const addException = (item = {}) => {
    if (!item.id || exceptions.has(item.id)) return;
    exceptions.set(item.id, item);
    addTask(item.id, 'exceptions', item);
  };

  for (const order of unifiedOrders.orders || []) if (order.actionRequired) {
    addTask(`ORDER:${order.hubOrderId || order.externalOrderId}`, 'orders', { view:'orders' });
  }
  for (const item of customerService.active || []) {
    addTask(`CS:${item.id}`, 'cs', { view:'cs' });
  }
  for (const item of unifiedInventory.items || []) if (item.action_required) {
    addTask(`INVENTORY:${item.master_product_id || item.name}`, 'inventory', { view:'inventory' });
  }
  for (const alert of alerts || []) if (String(alert.status || 'OPEN').toUpperCase() === 'OPEN') {
    addException({ id:`ALERT:${alert.id}`, title:alert.title || '운영 알림 확인', reason:alert.message || '알림 내용을 확인해주세요.', platform:alert.platform || 'ALL', tone:String(alert.severity || 'WARNING').toLowerCase(), view:'notifications', label:'열린 알림' });
  }
  for (const item of priorityCenter.items || []) {
    if (item.source === 'ALERT') continue;
    if (item.source === 'DATA_QUALITY') {
      addException({ id:item.id, title:item.title, reason:item.reason, platform:item.platform || 'ALL', tone:'warning', view:item.view || 'collection', label:'데이터 품질' });
      continue;
    }
    addTask(item.id, 'decisions', { view:item.view || 'reports', title:item.title, decision_status:item.decision_status });
  }
  for (const item of reliabilityCenter.dead_letters || []) {
    addException({ id:`DEAD_LETTER:${item.kind}:${item.id}`, title:item.title || '실패 작업 재시도', reason:item.error || '재시도가 필요한 작업입니다.', platform:item.kind === 'SYNC' ? 'COUPANG' : 'ALL', tone:'error', view:'collection', label:'재시도 필요' });
  }
  for (const channel of dataHealth.channels || []) {
    const status = channel.dataMode === 'PREVIOUS' ? 'PREVIOUS' : channel.status;
    if (['READY','RUNNING'].includes(status)) continue;
    addException({ id:`CHANNEL:${channel.platform}`, title:`${channel.platform} 자료 상태 확인`, reason:channel.storedSummary || '최신 자료 수집 상태를 확인해주세요.', platform:channel.platform, tone:status === 'FAILED' ? 'error' : 'warning', view:'collection', label:status === 'PREVIOUS' ? '이전 자료' : '갱신 필요' });
  }

  const taskGroups = TASK_GROUPS.map(group => ({ ...group, count:[...tasks.values()].filter(task => task.group === group.id).length }));
  return {
    generated_at:new Date(now).toISOString(),
    total:tasks.size,
    groups:taskGroups,
    schedule:buildSmartSchedule(now),
    exceptions:[...exceptions.values()].slice(0, 6),
    exception_total:exceptions.size
  };
}

function buildSalesCommandCenter({ pacing = {}, priorityCenter = {}, dataHealth = {}, productSignals = {}, profitability = {}, financialTrust = {}, unifiedOrders = {}, customerService = {}, unifiedInventory = {}, reliabilityCenter = {}, alerts = [], now = new Date() } = {}) {
  const item = (pacing.items || []).find(row => row.platform === 'ALL') || {};
  const hasPacing = Boolean(item.platform);
  const target = number(item.revenueTarget);
  const current = number(item.revenueActual);
  const forecast = number(item.revenueForecast);
  const shortage = target ? Math.max(0, target - current) : null;
  const forecastShortage = target ? Math.max(0, target - forecast) : null;
  return {
    month:pacing.month || dateOnly(pacing.asOf).slice(0,7), asOf:pacing.asOf || null,
    metrics:{ target:target || null, current:hasPacing?round(current):null, forecast:hasPacing?round(forecast):null, shortage:hasPacing&&shortage != null ? round(shortage) : null, forecastShortage:hasPacing&&forecastShortage != null ? round(forecastShortage) : null, requiredDailyRevenue:hasPacing&&target ? round(item.requiredDailyRevenue) : null, progressRate:hasPacing&&item.revenueProgressRate != null ? Number(number(item.revenueProgressRate).toFixed(1)) : null },
    likelihood:targetLikelihood(item),
    actions:(priorityCenter.items || []).slice(0,3),
    channels:channelCards(dataHealth),
    products:{ growth:productSignals.growth || [], risk:productSignals.risk || [], period:productSignals.period || null },
    cashflow:buildCashflow(item, profitability, financialTrust),
    daily:buildDailyOperations({ unifiedOrders, customerService, unifiedInventory, reliabilityCenter, alerts, priorityCenter, dataHealth, now })
  };
}

module.exports = { buildProductSignals, targetLikelihood, buildCashflow, buildSmartSchedule, buildDailyOperations, buildSalesCommandCenter };
