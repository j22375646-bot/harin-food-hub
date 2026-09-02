'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const cafe24FinanceCapability = require('../cafe24/finance-capability.js');
const ROCKET_GROWTH_COST_TYPES = new Set([
  'RETURN_PICKUP','RETURN_RESTOCKING','INVENTORY_COMPENSATION','STORAGE',
  'VALUE_ADDED_SERVICE','RETURN_HANDLING','RETURN_SHIPPING','WAREHOUSING','SHIPPING'
]);

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value) {
  return numberOrNull(value) ?? 0;
}

function dateValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function orderAmount(order) {
  return numberOrNull(
    order?.paid_amount ??
    order?.order_price ??
    order?.raw_data?.payment_amount ??
    order?.raw_data?.actual_order_amount?.payment_amount
  );
}

function inPeriod(value, startMs, endMs) {
  const at = dateValue(value);
  return at != null && at >= startMs && at <= endMs;
}

function latestDate(rows, keys) {
  const values = [];
  for (const row of rows || []) {
    for (const key of keys) {
      const value = key.split('.').reduce((current, part) => current == null ? null : current[part], row);
      const at = dateValue(value);
      if (at != null) values.push(at);
    }
  }
  return values.length ? new Date(Math.max(...values)).toISOString() : null;
}

function settingFor(settings, platform) {
  return (settings || []).find(item => String(item.platform || '').toUpperCase() === platform) || null;
}

function isAdvertisingCost(row = {}) {
  const source = String(row.source_type || '').toUpperCase();
  const transaction = String(row.transaction_type || '');
  return /ADVERT|MARKETING|AD_SPEND/.test(source) || transaction.includes('광고');
}

function adSettlementAmount(row = {}) {
  const billed = numberOrNull(row.billed_amount);
  if (billed != null) return billed;
  const chargeable = numberOrNull(row.chargeable_ad_spend);
  const vat = numberOrNull(row.vat);
  return chargeable == null && vat == null ? null : number(chargeable) + number(vat);
}

function deliveryFamily(row = {}) {
  const value = String(row.delivery_type || '').toUpperCase().replace(/[^A-Z가-힣]/g, '');
  if (value.includes('ROCKETGROWTH') || value.includes('로켓그로스')) return 'COUPANG_RG';
  if (value.includes('SELLER') || value.includes('판매자')) return 'COUPANG';
  return null;
}

function linkedToRocketGrowth(row = {}, orderIds = new Set(), vendorItemIds = new Set()) {
  const orderId = String(row.order_id || '');
  const vendorItemId = String(row.vendor_item_id || '');
  return Boolean((orderId && orderIds.has(orderId)) || (vendorItemId && vendorItemIds.has(vendorItemId)));
}

function coupangScheduleAmount(row = {}) {
  const status=String(row.status||'').toUpperCase();
  const completed=['DONE','COMPLETED','COMPLETE','PAID'].includes(status);
  return completed
    ?numberOrNull(row.final_amount ?? row.settlement_amount ?? row.settlement_target_amount)
    :numberOrNull(row.settlement_amount ?? row.settlement_target_amount ?? row.final_amount);
}

function buildCafe24Channel({ orders, salesDaily, settings, startMs, endMs, unavailable, lastSyncAt, reconnectRequired, scopeRequired, approvalRequired }) {
  if (unavailable) return {
    platform:'CAFE24', label:'Cafe24', status:'UNAVAILABLE', basis:'자료 확인 필요',
    gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,
    order_count:null, last_updated_at:lastSyncAt, action:'Cafe24 주문·결제 자료를 다시 수집하세요.'
  };

  const periodOrders = (orders || []).filter(order => inPeriod(order.order_date, startMs, endMs));
  const periodSales = (salesDaily || []).filter(row => inPeriod(row.date, startMs, endMs));
  const apiAmounts = periodSales.map(row=>numberOrNull(row.payment_amount));
  const hasSalesApi = apiAmounts.some(value=>value!=null);
  const amounts = hasSalesApi ? apiAmounts.filter(value=>value!=null) : periodOrders.map(orderAmount).filter(value => value != null);
  if (!amounts.length) return {
    platform:'CAFE24', label:'Cafe24', status:approvalRequired?'APPROVAL_REQUIRED':reconnectRequired?'RECONNECT_REQUIRED':scopeRequired?'SCOPE_REQUIRED':'NO_DATA', basis:approvalRequired?'주문 자료 없음 · 매출통계 개발자 승인 필요':reconnectRequired?'주문 자료 없음 · 매출통계 OAuth 재연결 필요':scopeRequired?'주문 자료 없음 · 매출통계 권한 필요':'주문 자료 없음',
    gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,
    order_count:periodOrders.length, last_updated_at:lastSyncAt || latestDate(periodOrders,['order_date']),
    action:approvalRequired?cafe24FinanceCapability.APPROVAL_ACTION:reconnectRequired?cafe24FinanceCapability.RECONNECT_ACTION:scopeRequired?'Cafe24 매출통계 읽기 권한을 다시 연결하세요.':'최근 30일 결제 주문이 없다면 정상입니다. 주문이 있다면 Cafe24 수집 상태를 확인하세요.',
    action_href:approvalRequired?cafe24FinanceCapability.DOCS_URL:reconnectRequired?cafe24FinanceCapability.RECONNECT_URL:scopeRequired?'/oauth/cafe24/start':null
  };

  const grossSales = amounts.reduce((sum, value) => sum + value, 0);
  const apiRefunds=periodSales.map(row=>numberOrNull(row.refund_amount));
  const refunds = hasSalesApi
    ? apiRefunds.every(value=>value!=null) ? apiRefunds.reduce((sum,value)=>sum+Math.max(0,value),0) : null
    : periodOrders.reduce((sum, order) => sum + Math.max(0, number(order.cancel_amount)), 0);
  const apiOrderCounts=periodSales.map(row=>numberOrNull(row.sales_count));
  const orderCount=hasSalesApi&&apiOrderCounts.every(value=>value!=null)
    ?apiOrderCounts.reduce((sum,value)=>sum+Math.max(0,value),0)
    :periodOrders.length;
  const netSales = refunds==null ? null : Math.max(0, grossSales - refunds);
  const setting = settingFor(settings, 'CAFE24');
  const hasCostSetting = setting && [setting.commission_rate, setting.payment_fee_rate, setting.default_shipping_cost]
    .every(value => numberOrNull(value) != null);
  const fees = hasCostSetting && netSales!=null ? netSales * (number(setting.commission_rate) + number(setting.payment_fee_rate)) : null;
  const logistics = hasCostSetting ? orderCount * number(setting.default_shipping_cost) : null;
  const expectedPayout = fees == null ? null : netSales - fees;
  return {
    platform:'CAFE24', label:'Cafe24', status:approvalRequired ? 'APPROVAL_REQUIRED' : reconnectRequired ? 'RECONNECT_REQUIRED' : !hasSalesApi&&scopeRequired ? 'SCOPE_REQUIRED' : hasCostSetting ? 'ESTIMATED' : 'COST_REQUIRED',
    basis:hasSalesApi
      ? approvalRequired ? '저장된 Cafe24 매출통계 · 새 수집 개발자 승인 필요' : reconnectRequired ? '저장된 Cafe24 매출통계 · 새 수집 OAuth 재연결 필요' : hasCostSetting ? 'Cafe24 매출통계 API · 예상 정산' : 'Cafe24 매출통계 API · 비용 설정 필요'
      : approvalRequired ? '주문 기반 추정 · 매출통계 개발자 승인 필요' : reconnectRequired ? '주문 기반 추정 · 새 수집 OAuth 재연결 필요' : scopeRequired ? '주문 기반 추정 · 매출통계 권한 필요' : hasCostSetting ? '주문·설정 기반 예상' : '비용 설정 필요',
    gross_sales:grossSales, refunds,
    fees, logistics, expected_payout:expectedPayout, actual_payout:null, order_count:orderCount,
    last_updated_at:lastSyncAt || latestDate(hasSalesApi?periodSales:periodOrders,hasSalesApi?['date']:['order_date']),
    action:approvalRequired
      ? `${hasSalesApi?'저장된 매출통계 금액을 보존 중입니다.':'현재 금액은 주문 자료 기반 추정입니다.'} ${cafe24FinanceCapability.APPROVAL_ACTION}`
      : reconnectRequired
      ? `${hasSalesApi?'저장된 매출통계 금액을 보존 중입니다.':'현재 금액은 주문 자료 기반 추정입니다.'} ${cafe24FinanceCapability.RECONNECT_ACTION}`
      : !hasSalesApi&&scopeRequired
      ? '현재 금액은 주문 자료 기반 추정입니다. Cafe24 매출통계 읽기 권한을 다시 연결하세요.'
      : hasCostSetting
      ? '예상 정산액입니다. 실제 입금액과 다르면 Cafe24 결제수단별 수수료를 보정하세요.'
      : 'Cafe24 판매수수료·결제수수료·기본 배송비를 상품에서 입력하고 변경기록에서 결과를 확인하세요.',
    action_href:approvalRequired ? cafe24FinanceCapability.DOCS_URL : reconnectRequired ? cafe24FinanceCapability.RECONNECT_URL : !hasSalesApi&&scopeRequired ? '/oauth/cafe24/start' : null
  };
}

function buildCoupangChannel({
  settlements, costTransactions, adSettlements, summaries, orders = [],
  platform = 'COUPANG', label = '쿠팡', strictCostCoverage = false,
  startMs, endMs, unavailable, lastSyncAt
}) {
  if (unavailable) return {
    platform, label, status:'UNAVAILABLE', basis:'자료 확인 필요',
    gross_sales:null, refunds:null, fees:null, logistics:null, advertising:null, expected_payout:null, actual_payout:null,
    order_count:null, last_updated_at:lastSyncAt, action:'서울 고정 IP 서버에서 쿠팡 정산 수집 상태를 확인하세요.'
  };

  const rows = (settlements || []).filter(row => inPeriod(row.recognition_date, startMs, endMs));
  const costs = (costTransactions || []).filter(row => inPeriod(row.event_date || row.recognition_date, startMs, endMs));
  const periodOrders = (orders || []).filter(row => inPeriod(row.paid_at, startMs, endMs));
  const adRows = (adSettlements || []).filter(row => {
    const rowType = String(row.row_type || '').toUpperCase();
    return inPeriod(row.date, startMs, endMs) && (rowType ? rowType === 'DELIVERY_SUMMARY' : !row.campaign_id);
  });
  const adValues = adRows.map(adSettlementAmount).filter(value => value != null);
  const adCostRows = costs.filter(isAdvertisingCost);
  const advertising = adValues.length
    ? adValues.reduce((sum,value)=>sum+value,0)
    : adCostRows.length
      ? adCostRows.reduce((sum,row)=>sum+number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount),0)
      : null;
  const summaryRows = (summaries || []).filter(row => inPeriod(row.settlement_date, startMs, endMs));
  if (!rows.length && !summaryRows.length && !periodOrders.length && !costs.length && !adRows.length) return {
    platform, label, status:'NO_DATA', basis:'정산 자료 없음',
    gross_sales:null, refunds:null, fees:null, logistics:costs.length ? costs.filter(row=>!isAdvertisingCost(row)).reduce((sum,row)=>sum+Math.max(0,number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount)),0) : null,
    advertising,
    expected_payout:null, actual_payout:null, order_count:null,
    last_updated_at:lastSyncAt || latestDate([...costs,...adRows],['event_date','recognition_date','date']),
    action:'쿠팡 정산 API 또는 WING 정산 파일을 수집하세요.'
  };

  const saleRows = rows.filter(row => String(row.sale_type || '').toUpperCase() !== 'REFUND');
  const refundRows = rows.filter(row => String(row.sale_type || '').toUpperCase() === 'REFUND');
  const orderAmounts = periodOrders.map(row=>numberOrNull(row.total_amount)).filter(value=>value!=null);
  const settlementGross = saleRows.reduce((sum,row)=>sum+Math.abs(number(row.sale_amount)),0);
  const grossSales = orderAmounts.length ? orderAmounts.reduce((sum,value)=>sum+value,0) : rows.length ? settlementGross : null;
  const periodOrderIds = new Set(periodOrders.map(row=>String(row.order_id||'')).filter(Boolean));
  const settledOrderIds = new Set(rows.map(row=>String(row.order_id||'')).filter(Boolean));
  const settledPeriodOrderCount = periodOrderIds.size
    ? [...periodOrderIds].filter(orderId=>settledOrderIds.has(orderId)).length
    : settledOrderIds.size;
  const settlementCoverage = periodOrderIds.size
    ? Math.round(settledPeriodOrderCount / periodOrderIds.size * 1000) / 10
    : rows.length ? 100 : 0;
  const completeSettlementCoverage = !strictCostCoverage || !periodOrderIds.size || settlementCoverage === 100;
  const refunds = rows.length && completeSettlementCoverage
    ? refundRows.reduce((sum,row)=>sum+Math.abs(number(row.sale_amount)),0)
    : null;
  const settlementFees = rows.length ? rows.reduce((sum,row)=>sum+number(row.service_fee)+number(row.service_fee_vat),0) : null;
  const feeCostRows = costs.filter(row => String(row.source_type || '').toUpperCase() === 'SALES_COMMISSION');
  const importedFees = feeCostRows.length
    ? feeCostRows.reduce((sum,row)=>sum+number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount),0)
    : null;
  const fees = strictCostCoverage ? (importedFees ?? (completeSettlementCoverage ? settlementFees : null)) : settlementFees;
  const logisticsRows = costs.filter(row => String(row.source_type || '').toUpperCase() !== 'SALES_COMMISSION' && !isAdvertisingCost(row));
  const logistics = logisticsRows.length
    ? logisticsRows.reduce((sum,row)=>sum+number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount),0)
    : null;
  const rowPayout = rows.length ? rows.reduce((sum,row)=>sum+number(row.settlement_amount),0) : null;
  const summaryPayout = summaryRows.length ? summaryRows.reduce((sum,row)=>sum+number(row.final_amount),0) : null;
  const actualPayout = strictCostCoverage
    ? completeSettlementCoverage && summaryRows.length ? summaryPayout : null
    : summaryPayout ?? rowPayout;
  const costCoverageReady = strictCostCoverage
    ? [grossSales, refunds, fees, logistics, advertising].every(value=>value!=null)
    : rows.length && (!adRows.length || advertising != null);
  const expectedPayout = costCoverageReady
    ? grossSales - refunds - number(fees) - number(logistics) - number(advertising)
    : null;
  const status = actualPayout != null ? 'ACTUAL' : expectedPayout != null ? 'ESTIMATED' : 'COST_REQUIRED';
  const coverageBasis = strictCostCoverage && periodOrderIds.size
    ? ` · 정산 연결 ${settledPeriodOrderCount}/${periodOrderIds.size}건`
    : '';
  return {
    platform, label, status,
    basis:strictCostCoverage
      ? `로켓그로스 주문 API${coverageBasis} · 광고 정산·WING 물류비 자동 대조`
      : summaryRows.length ? '확정 지급 자료' : '매출인식 정산 자료',
    gross_sales:grossSales, refunds, fees, logistics, advertising, expected_payout:expectedPayout, actual_payout:actualPayout,
    order_count:periodOrderIds.size || settledOrderIds.size,
    settlement_order_count:settledPeriodOrderCount,
    settlement_coverage:settlementCoverage,
    last_updated_at:lastSyncAt || latestDate([...periodOrders,...rows,...summaryRows,...costs,...adRows],['paid_at','recognition_date','settlement_date','event_date','date']),
    action:strictCostCoverage && !completeSettlementCoverage
      ? `로켓그로스 주문 정산 연결 ${settlementCoverage.toLocaleString('ko-KR')}%입니다. 최신 쿠팡 정산 수집을 확인하고, 연결되지 않은 기간은 WING 정산 원문을 보완하세요.`
      : expectedPayout == null
        ? '로켓그로스 광고 정산과 WING 배송·입출고·보관비 원문을 최신 기간으로 보완하세요.'
        : actualPayout == null
          ? '정산 지급액이 비어 있습니다. WING 정산 파일을 확인하세요.'
          : '예상액과 확정 지급액 차이가 크면 환불·광고비·보류금·물류비 내역을 펼쳐 확인하세요.'
  };
}

function buildNaverAdvertising({adStats=[],bizmoneyDaily=[],startMs,endMs}) {
  const stats=(adStats||[]).filter(row=>(!row.entity_type||String(row.entity_type).toUpperCase()==='CAMPAIGN')&&inPeriod(row.date,startMs,endMs));
  const billing=(bizmoneyDaily||[]).filter(row=>inPeriod(row.date,startMs,endMs));
  const statsValues=stats.map(row=>numberOrNull(row.cost)).filter(value=>value!=null);
  const usedValues=billing.map(row=>{
    const purchased=numberOrNull(row.used_purchased),free=numberOrNull(row.used_free);
    return purchased==null&&free==null?null:number(purchased)+number(free);
  }).filter(value=>value!=null);
  const chargedValues=billing.map(row=>{
    const purchased=numberOrNull(row.charged_purchased),free=numberOrNull(row.charged_free);
    return purchased==null&&free==null?null:number(purchased)+number(free);
  }).filter(value=>value!=null);
  const advertisingStats=statsValues.length?statsValues.reduce((sum,value)=>sum+value,0):null;
  const advertising=usedValues.length?usedValues.reduce((sum,value)=>sum+value,0):advertisingStats;
  const advertisingCharged=chargedValues.length?chargedValues.reduce((sum,value)=>sum+value,0):null;
  const latest=[...billing].sort((left,right)=>String(right.date).localeCompare(String(left.date)))[0]||null;
  const advertisingBalance=numberOrNull(latest?.current_balance??latest?.closing_balance);
  return {
    advertising,
    advertising_stats:advertisingStats,
    advertising_charged:advertisingCharged,
    advertising_balance:advertisingBalance,
    advertising_variance:advertising!=null&&advertisingStats!=null?advertising-advertisingStats:null,
    advertising_source:usedValues.length?'BIZMONEY_EXHAUST':advertisingStats!=null?'CAMPAIGN_STATS':null,
    advertising_history:[...billing].sort((left,right)=>String(right.date).localeCompare(String(left.date))).map(row=>({
      date:dateOnly(row.date),
      charged:(numberOrNull(row.charged_purchased)==null&&numberOrNull(row.charged_free)==null)?null:number(row.charged_purchased)+number(row.charged_free),
      used:(numberOrNull(row.used_purchased)==null&&numberOrNull(row.used_free)==null)?null:number(row.used_purchased)+number(row.used_free),
      balance:numberOrNull(row.current_balance??row.closing_balance)
    })),
    advertising_last_updated_at:latestDate([...stats,...billing],['date','updated_at'])
  };
}

function buildNaverChannel({ orders, settlements, adStats, bizmoneyDaily, startMs, endMs, unavailable, lastSyncAt }) {
  const adEvidence=buildNaverAdvertising({adStats,bizmoneyDaily,startMs,endMs});
  const rows = (settlements || []).filter(row => inPeriod(
    row.settle_complete_date || row.settle_expect_date || row.settle_basis_end_date,
    startMs,
    endMs
  ));
  const periodOrders = (orders || []).filter(order => inPeriod(order.payment_date || order.order_date, startMs, endMs));
  if (unavailable) {
    return {
      platform:'NAVER', label:'네이버', status:'UNAVAILABLE', basis:'자료 확인 필요',
      gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,...adEvidence,
      order_count:null, last_updated_at:lastSyncAt, action:'네이버 커머스 API 연결 상태를 확인하세요.'
    };
  }
  if (!rows.length) {
    return {
      platform:'NAVER', label:'네이버', status:'NO_DATA', basis:'최근 정산 자료 없음',
      gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,...adEvidence,
      order_count:periodOrders.length, last_updated_at:lastSyncAt || latestDate(periodOrders,['payment_date','order_date']),
      action:'최근 30일 정산이 없다면 정상입니다. 주문이 있다면 네이버 커머스 수집을 다시 실행하세요.'
    };
  }
  const completedRows = rows.filter(row => Boolean(row.settle_complete_date));
  const grossSales = rows.reduce((sum,row)=>sum+number(row.pay_settle_amount),0);
  const fees = rows.reduce((sum,row)=>sum+Math.abs(number(row.commission_settle_amount)),0);
  const expectedPayout = rows.reduce((sum,row)=>sum+number(row.settle_amount),0);
  const actualPayout = completedRows.length
    ? completedRows.reduce((sum,row)=>sum+number(row.settle_amount),0)
    : null;
  return {
    platform:'NAVER', label:'네이버', status:completedRows.length ? 'ACTUAL' : 'ESTIMATED',
    basis:completedRows.length ? '커머스 API 정산완료 자료' : '커머스 API 정산예정 자료',
    gross_sales:grossSales, refunds:null, fees, logistics:null,...adEvidence,
    expected_payout:expectedPayout, actual_payout:actualPayout, order_count:periodOrders.length,
    last_updated_at:lastSyncAt || latestDate(rows,['settle_complete_date','settle_expect_date','settle_basis_end_date','updated_at']),
    action:completedRows.length
      ? '정산액과 실제 입금액 차이가 있으면 보류금·차감복원 내역을 확인하세요.'
      : '표시된 금액은 정산예정액입니다. 정산완료일 이후 실제 입금액을 확인하세요.'
  };
}

function buildUnifiedSettlementCenter({
  cafe24Orders = [], cafe24SalesDaily = [], naverOrders = [], naverSettlements = [], naverAdStats = [], naverBizmoneyDaily = [], coupangSettlements = [], coupangCostTransactions = [], coupangAdSettlements = [], coupangSettlementSummaries = [],
  coupangRgOrders = [], coupangRgOrderItems = [],
  channelCostSettings = [], syncs = [], cafe24Token, unavailable = {}, now = new Date(), periodDays = 30
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const endMs = nowDate.getTime();
  const startMs = endMs - Math.max(1, periodDays) * DAY_MS;
  const lastSync = platform => (syncs || []).find(item => String(item.platform || '').toUpperCase() === platform)?.finished_at || null;
  const latestCafe24Sync=[...(syncs || [])]
    .filter(item=>String(item.platform||'').toUpperCase()==='CAFE24'&&item.job_type==='FETCH_ALL')
    .sort((left,right)=>dateValue(right.finished_at||right.started_at)-dateValue(left.finished_at||left.started_at))[0] || null;
  const liveCafe24Capability=cafe24Token===undefined?null:cafe24FinanceCapability.assessFinanceCapability(cafe24Token);
  const legacySettlementCapability=latestCafe24Sync?.metadata?.capabilities?.settlement;
  const cafe24ReconnectRequired=['DISCONNECTED','RECONNECT_REQUIRED'].includes(liveCafe24Capability?.status);
  const cafe24ApprovalRequired=!cafe24ReconnectRequired&&(
    liveCafe24Capability?.status==='APPROVAL_REQUIRED'||legacySettlementCapability==='APPROVAL_REQUIRED'
  );
  const cafe24ScopeRequired=!cafe24ReconnectRequired&&!cafe24ApprovalRequired&&['SETUP_REQUIRED','SCOPE_REQUIRED'].includes(legacySettlementCapability);
  const rocketGrowthOrderIds=new Set((coupangRgOrders||[]).map(row=>String(row.order_id||'')).filter(Boolean));
  const rocketGrowthVendorItemIds=new Set((coupangRgOrderItems||[]).map(row=>String(row.vendor_item_id||'')).filter(Boolean));
  const isRocketGrowthRow=row=>linkedToRocketGrowth(row,rocketGrowthOrderIds,rocketGrowthVendorItemIds);
  const rocketGrowthSettlements=(coupangSettlements||[]).filter(isRocketGrowthRow);
  const sellerSettlements=(coupangSettlements||[]).filter(row=>!isRocketGrowthRow(row));
  const sellerOrderIds=new Set(sellerSettlements.map(row=>String(row.order_id||'')).filter(Boolean));
  const sellerVendorItemIds=new Set(sellerSettlements.map(row=>String(row.vendor_item_id||'')).filter(Boolean));
  const costFamily=row=>{
    const explicit=deliveryFamily(row);
    if(explicit)return explicit;
    if(isRocketGrowthRow(row))return 'COUPANG_RG';
    if(linkedToRocketGrowth(row,sellerOrderIds,sellerVendorItemIds))return 'COUPANG';
    return ROCKET_GROWTH_COST_TYPES.has(String(row.source_type||'').toUpperCase())?'COUPANG_RG':'COUPANG';
  };
  const rocketGrowthCosts=(coupangCostTransactions||[]).filter(row=>costFamily(row)==='COUPANG_RG');
  const sellerCosts=(coupangCostTransactions||[]).filter(row=>costFamily(row)==='COUPANG');
  const rocketGrowthAds=(coupangAdSettlements||[]).filter(row=>deliveryFamily(row)==='COUPANG_RG');
  const explicitlySellerAds=(coupangAdSettlements||[]).filter(row=>deliveryFamily(row)==='COUPANG');
  const sellerAds=explicitlySellerAds.length||rocketGrowthAds.length ? explicitlySellerAds : coupangAdSettlements;
  const hasRocketGrowthEvidence=Boolean(
    coupangRgOrders.length || coupangRgOrderItems.length || rocketGrowthSettlements.length || rocketGrowthCosts.length || rocketGrowthAds.length
  );
  const coupangLabel=hasRocketGrowthEvidence?'쿠팡 판매자배송':'쿠팡';
  const channels = [
    buildCafe24Channel({ orders:cafe24Orders, salesDaily:cafe24SalesDaily, settings:channelCostSettings, startMs, endMs, unavailable:Boolean(unavailable.CAFE24), lastSyncAt:lastSync('CAFE24'), reconnectRequired:cafe24ReconnectRequired, scopeRequired:cafe24ScopeRequired, approvalRequired:cafe24ApprovalRequired }),
    buildNaverChannel({ orders:naverOrders, settlements:naverSettlements, adStats:naverAdStats, bizmoneyDaily:naverBizmoneyDaily, startMs, endMs, unavailable:Boolean(unavailable.NAVER), lastSyncAt:lastSync('NAVER') }),
    buildCoupangChannel({ settlements:sellerSettlements, costTransactions:sellerCosts, adSettlements:sellerAds, summaries:hasRocketGrowthEvidence?[]:coupangSettlementSummaries, platform:'COUPANG', label:coupangLabel, startMs, endMs, unavailable:Boolean(unavailable.COUPANG), lastSyncAt:lastSync('COUPANG') }),
    ...(hasRocketGrowthEvidence ? [buildCoupangChannel({
      settlements:rocketGrowthSettlements, costTransactions:rocketGrowthCosts, adSettlements:rocketGrowthAds,
      summaries:[], orders:coupangRgOrders, platform:'COUPANG_RG', label:'쿠팡 로켓그로스', strictCostCoverage:true,
      startMs, endMs, unavailable:Boolean(unavailable.COUPANG_RG), lastSyncAt:lastSync('COUPANG')
    })] : [])
  ].map(channel => ({
    ...channel,
    payout_variance:channel.actual_payout != null && channel.expected_payout != null
      ? channel.actual_payout - channel.expected_payout
      : null
  }));
  const numeric = (key, states) => channels.filter(item=>states.includes(item.status)).map(item=>item[key]).filter(value=>value!=null);
  const actual = numeric('actual_payout',['ACTUAL']);
  const estimated = numeric('expected_payout',['ESTIMATED']);
  const fees = numeric('fees',['ACTUAL','ESTIMATED']);
  const logistics = numeric('logistics',['ACTUAL','ESTIMATED']);
  const advertising = numeric('advertising',['ACTUAL','ESTIMATED']);
  const coupangSchedulePlatform=hasRocketGrowthEvidence?'COUPANG_COMBINED':'COUPANG';
  const coupangSchedules = (coupangSettlementSummaries || []).filter(row=>dateValue(row.settlement_date)!=null).map(row=>({
    platform:coupangSchedulePlatform, date:dateOnly(row.settlement_date), status:row.status || '확인 필요',
    amount:coupangScheduleAmount(row),
    type:hasRocketGrowthEvidence
      ? `${row.settlement_type||'쿠팡 지급'} · 판매자배송·로켓그로스 미분리`
      : row.settlement_type || null,
    month:row.recognition_month || null
  }));
  const naverSchedules = (naverSettlements || []).filter(row=>dateValue(row.settle_expect_date || row.settle_complete_date)!=null).map(row=>({
    platform:'NAVER', date:dateOnly(row.settle_complete_date || row.settle_expect_date),
    status:row.settle_complete_date ? '정산완료' : '정산예정',
    amount:numberOrNull(row.settle_amount), type:'일별 정산', month:dateOnly(row.settle_basis_end_date).slice(0,7) || null
  }));
  const schedules = [...coupangSchedules,...naverSchedules].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,12);
  const revenueChannels=channels.filter(item=>item.gross_sales!=null);
  const componentChannels = key => {
    if (['refunds','fees'].includes(key)) return revenueChannels;
    if (key === 'logistics') return revenueChannels.filter(item=>['CAFE24','COUPANG','COUPANG_RG'].includes(item.platform));
    if (key === 'advertising') return revenueChannels.filter(item=>['NAVER','COUPANG','COUPANG_RG'].includes(item.platform));
    return channels.filter(item=>item[key]!=null);
  };
  const totalOrNull = key => {
    const relevant=componentChannels(key);
    if (relevant.some(item=>item[key]==null)) return null;
    const values = relevant.map(item => item[key]).filter(value => value != null);
    return values.length ? values.reduce((sum, value) => sum + Number(value), 0) : null;
  };
  const grossSales = totalOrNull('gross_sales');
  const refunds = totalOrNull('refunds');
  const feesTotal = totalOrNull('fees');
  const logisticsTotal = totalOrNull('logistics');
  const advertisingTotal = totalOrNull('advertising');
  const naverAdvertisingCharged=channels.find(item=>item.platform==='NAVER')?.advertising_charged??null;
  const expectedNet = revenueChannels.length && revenueChannels.every(item=>item.expected_payout!=null)
    ? revenueChannels.reduce((sum,item)=>sum+Number(item.expected_payout),0)
    : null;
  const actualComparable = channels.filter(item => item.actual_payout != null && item.expected_payout != null);
  const variance = actualComparable.length
    ? actualComparable.reduce((sum, item) => sum + item.payout_variance, 0)
    : null;
  const revenueBreakdown=revenueChannels.map(item=>({
    platform:item.platform,label:item.label,gross_sales:item.gross_sales,expected_payout:item.expected_payout
  }));
  const rocketGrowth=channels.find(item=>item.platform==='COUPANG_RG')||null;
  const rocketGrowthCostsKnown=rocketGrowth&&[rocketGrowth.refunds,rocketGrowth.fees,rocketGrowth.logistics,rocketGrowth.advertising].every(value=>value!=null);
  const rocketGrowthBreakdown=rocketGrowth?{
    gross_sales:rocketGrowth.gross_sales,
    refunds:rocketGrowth.refunds,
    fees:rocketGrowth.fees,
    logistics:rocketGrowth.logistics,
    advertising:rocketGrowth.advertising,
    deductions:rocketGrowthCostsKnown
      ? Number(rocketGrowth.refunds)+Number(rocketGrowth.fees)+Number(rocketGrowth.logistics)+Number(rocketGrowth.advertising)
      : null,
    expected_payout:rocketGrowth.expected_payout,
    actual_payout:rocketGrowth.actual_payout,
    included_in_total_gross:rocketGrowth.gross_sales!=null&&grossSales!=null
  }:null;
  return {
    phase:'13-5', period_start:new Date(startMs).toISOString(), period_end:nowDate.toISOString(), channels, schedules,
    waterfall:{
      gross_sales:grossSales,
      refunds,
      fees:feesTotal,
      logistics:logisticsTotal,
      advertising:advertisingTotal,
      advertising_charged:naverAdvertisingCharged,
      expected_payout:expectedNet,
      actual_payout:actual.length ? actual.reduce((sum,value)=>sum+value,0) : null,
      variance,
      comparable_channels:actualComparable.length,
      revenue_breakdown:revenueBreakdown,
      rocket_growth:rocketGrowthBreakdown
    },
    summary:{
      actual_payout:actual.length ? actual.reduce((sum,value)=>sum+value,0) : null,
      estimated_payout:estimated.length ? estimated.reduce((sum,value)=>sum+value,0) : null,
      known_fees:fees.length ? fees.reduce((sum,value)=>sum+value,0) : null,
      known_logistics:logistics.length ? logistics.reduce((sum,value)=>sum+value,0) : null,
      known_advertising:advertising.length ? advertising.reduce((sum,value)=>sum+value,0) : null,
      actual_channels:channels.filter(item=>item.status==='ACTUAL').length,
      estimated_channels:channels.filter(item=>item.status==='ESTIMATED').length,
      check_required_channels:channels.filter(item=>!['ACTUAL','ESTIMATED'].includes(item.status)).length
    }
  };
}

module.exports = { buildUnifiedSettlementCenter, orderAmount };
