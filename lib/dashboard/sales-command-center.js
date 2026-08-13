'use strict';

const number = value => Number(value || 0);
const round = value => Math.round(number(value));
const dateOnly = value => String(value || '').slice(0, 10);

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

function buildSalesCommandCenter({ pacing = {}, priorityCenter = {}, dataHealth = {}, productSignals = {}, profitability = {}, financialTrust = {} } = {}) {
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
    cashflow:buildCashflow(item, profitability, financialTrust)
  };
}

module.exports = { buildProductSignals, targetLikelihood, buildCashflow, buildSalesCommandCenter };
