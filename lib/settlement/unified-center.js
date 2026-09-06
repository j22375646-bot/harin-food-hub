'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const cafe24FinanceCapability = require('../cafe24/finance-capability.js');
const {orderPaymentEvidence,settlementPaymentDate,summarizeSettlementDayEvidence}=require('../cafe24/settlement-evidence.js');
const {seoulDateKey}=require('../analytics/financial-date.js');
const {ledgerDeliveryFamily,nullableAmount}=require('../coupang/settlement-ledger.js');
const {completeSum,payoutEvidence}=require('./coupang-reconciliation.js');
function numberOrNull(value) {
  return nullableAmount(value);
}

function number(value) {
  return numberOrNull(value) ?? 0;
}

function dateValue(value) {
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?`${value}T00:00:00+09:00`:value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value) {
  return seoulDateKey(value);
}

function orderAmount(order) {
  return orderPaymentEvidence(order).amount;
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
  return chargeable == null || vat == null ? null : chargeable + vat;
}

function deliveryFamily(row = {}) {
  if(row.delivery_family!=null||row.raw_data?.delivery_family!=null){
    const family=ledgerDeliveryFamily(row);
    return family==='ROCKET_GROWTH'?'COUPANG_RG':family==='COUPANG'?'COUPANG':null;
  }
  const value = String(row.delivery_type || '').toUpperCase().replace(/[^A-Z가-힣]/g, '');
  if (['ROCKETGROWTH','로켓그로스'].includes(value)) return 'COUPANG_RG';
  if (['SELLER','SELLERDELIVERY','판매자','판매자배송'].includes(value)) return 'COUPANG';
  return null;
}

function coupangScheduleAmount(row = {}) {
  const status=String(row.status||'').toUpperCase();
  const completed=['DONE','COMPLETED','COMPLETE','PAID'].includes(status);
  return completed
    ?numberOrNull(row.final_amount ?? row.settlement_amount ?? row.settlement_target_amount)
    :numberOrNull(row.settlement_amount ?? row.settlement_target_amount ?? row.final_amount);
}

function buildCafe24Channel({ orders, salesDaily, settings, startMs, endMs, unavailable, lastSyncAt, reconnectRequired, scopeRequired, approvalRequired, verifyRequired }) {
  if (unavailable) return {
    platform:'CAFE24', label:'Cafe24', status:'UNAVAILABLE', basis:'자료 확인 필요',
    gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,
    order_count:null, last_updated_at:lastSyncAt, action:'Cafe24 주문·결제 자료를 다시 수집하세요.'
  };

  const salesEvidence=summarizeSettlementDayEvidence({orders,salesDaily,periodStart:new Date(startMs),periodEnd:new Date(endMs)});
  const periodOrders = (orders || []).filter(order => orderPaymentEvidence(order).eligible&&inPeriod(settlementPaymentDate(order).date, startMs, endMs));
  const periodSales = salesEvidence.days.filter(row=>row.source==='SALES_REPORT');
  const apiDates=new Set(periodSales.filter(row=>numberOrNull(row.payment_amount)!=null).map(row=>dateOnly(row.date)));
  const fallbackOrders=periodOrders.filter(row=>!apiDates.has(settlementPaymentDate(row).date));
  const apiAmounts = periodSales.map(row=>numberOrNull(row.payment_amount));
  const hasSalesApi = apiAmounts.some(value=>value!=null);
  const amounts = hasSalesApi ? [...apiAmounts.filter(value=>value!=null),...fallbackOrders.map(orderAmount).filter(value=>value!=null)] : periodOrders.map(orderAmount).filter(value => value != null);
  if (!amounts.length) return {
    platform:'CAFE24', label:'Cafe24', status:approvalRequired?'APPROVAL_REQUIRED':reconnectRequired?'RECONNECT_REQUIRED':verifyRequired?'VERIFY_REQUIRED':scopeRequired?'SCOPE_REQUIRED':'NO_DATA', basis:approvalRequired?'주문 자료 없음 · 매출통계 개발자 승인 필요':reconnectRequired?'주문 자료 없음 · 매출통계 OAuth 재연결 필요':verifyRequired?'매출통계 접근 원인 확인 필요':scopeRequired?'주문 자료 없음 · 매출통계 권한 필요':'주문 자료 없음',
    gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,
    sales_evidence:salesEvidence,sales_api_days:0,sales_api_complete:false,
    order_count:periodOrders.length, last_updated_at:lastSyncAt || latestDate(periodOrders,['order_date']),
    action:approvalRequired?cafe24FinanceCapability.APPROVAL_ACTION:reconnectRequired?cafe24FinanceCapability.RECONNECT_ACTION:verifyRequired?cafe24FinanceCapability.VERIFY_ACTION:scopeRequired?'Cafe24 매출통계 읽기 권한을 다시 연결하세요.':'최근 30일 결제 주문이 없다면 정상입니다. 주문이 있다면 Cafe24 수집 상태를 확인하세요.',
    action_href:approvalRequired?cafe24FinanceCapability.DOCS_URL:reconnectRequired?cafe24FinanceCapability.RECONNECT_URL:scopeRequired?'/oauth/cafe24/start':null
  };

  const grossSales = amounts.reduce((sum, value) => sum + value, 0);
  const apiRefunds=periodSales.map(row=>numberOrNull(row.refund_amount));
  const orderRefund=row=>{const value=numberOrNull(row.cancel_amount??row.refund_amount);return value==null?null:Math.max(0,value);};
  const fallbackRefunds=fallbackOrders.length?completeSum(fallbackOrders,orderRefund):0;
  const refunds = hasSalesApi
    ? apiRefunds.every(value=>value!=null)&&fallbackRefunds!=null ? apiRefunds.reduce((sum,value)=>sum+Math.max(0,value),0)+fallbackRefunds : null
    : completeSum(periodOrders,orderRefund);
  const apiOrderCounts=periodSales.map(row=>numberOrNull(row.sales_count));
  const orderCount=hasSalesApi&&apiOrderCounts.every(value=>value!=null)
    ?apiOrderCounts.reduce((sum,value)=>sum+Math.max(0,value),0)+fallbackOrders.length
    :periodOrders.length;
  const netSales = refunds==null ? null : Math.max(0, grossSales - refunds);
  const setting = settingFor(settings, 'CAFE24');
  const costSettingValues = setting
    ? [setting.commission_rate, setting.payment_fee_rate, setting.default_shipping_cost].map(numberOrNull)
    : [];
  const hasCostSetting = costSettingValues.length === 3
    && costSettingValues.every(value => value != null)
    && costSettingValues.some(value => value > 0);
  const fees = hasCostSetting && netSales!=null ? netSales * (number(setting.commission_rate) + number(setting.payment_fee_rate)) : null;
  const logistics = hasCostSetting ? orderCount * number(setting.default_shipping_cost) : null;
  const expectedPayout = fees == null ? null : netSales - fees;
  return {
    platform:'CAFE24', label:'Cafe24', status:approvalRequired ? 'APPROVAL_REQUIRED' : reconnectRequired ? 'RECONNECT_REQUIRED' : verifyRequired ? 'VERIFY_REQUIRED' : !hasSalesApi&&scopeRequired ? 'SCOPE_REQUIRED' : hasCostSetting ? 'ESTIMATED' : 'COST_REQUIRED',
    basis:verifyRequired?'저장된 결제 근거 · 매출통계 접근 원인 확인 필요':hasSalesApi
      ? approvalRequired ? '저장된 Cafe24 매출통계 · 새 수집 개발자 승인 필요' : reconnectRequired ? '저장된 Cafe24 매출통계 · 새 수집 OAuth 재연결 필요' : hasCostSetting ? 'Cafe24 매출통계 API · 예상 정산' : 'Cafe24 매출통계 API · 비용 설정 필요'
      : approvalRequired ? '주문 기반 추정 · 매출통계 개발자 승인 필요' : reconnectRequired ? '주문 기반 추정 · 새 수집 OAuth 재연결 필요' : scopeRequired ? '주문 기반 추정 · 매출통계 권한 필요' : hasCostSetting ? '주문·설정 기반 예상' : '비용 설정 필요',
    gross_sales:grossSales, refunds,
    sales_source:hasSalesApi?(fallbackOrders.length?'DAILY_API_AND_ORDERS':'DAILY_API'):'ORDERS',
    sales_api_days:apiDates.size,
    sales_api_complete:apiDates.size===salesEvidence.coverage.expected_days,
    sales_evidence:salesEvidence,
    fees, logistics, expected_payout:expectedPayout, actual_payout:null, order_count:orderCount,
    last_updated_at:lastSyncAt || latestDate(hasSalesApi?periodSales:periodOrders,hasSalesApi?['date']:['order_date']),
    action:approvalRequired
      ? `${hasSalesApi?'저장된 매출통계 금액을 보존 중입니다.':'현재 금액은 주문 자료 기반 추정입니다.'} ${cafe24FinanceCapability.APPROVAL_ACTION}`
      : reconnectRequired
      ? `${hasSalesApi?'저장된 매출통계 금액을 보존 중입니다.':'현재 금액은 주문 자료 기반 추정입니다.'} ${cafe24FinanceCapability.RECONNECT_ACTION}`
      : verifyRequired
      ? cafe24FinanceCapability.VERIFY_ACTION
      : !hasSalesApi&&scopeRequired
      ? '현재 금액은 주문 자료 기반 추정입니다. Cafe24 매출통계 읽기 권한을 다시 연결하세요.'
      : hasCostSetting
      ? '예상 정산액입니다. 실제 입금액과 다르면 Cafe24 결제수단별 수수료를 보정하세요.'
      : 'Cafe24 판매수수료·결제수수료·기본 배송비를 상품에서 입력하고 변경기록에서 결과를 확인하세요.',
    action_href:approvalRequired ? cafe24FinanceCapability.DOCS_URL : reconnectRequired ? cafe24FinanceCapability.RECONNECT_URL : !hasSalesApi&&scopeRequired ? '/oauth/cafe24/start' : null
  };
}

function buildCoupangChannel({
  settlements, costTransactions, adSettlements, summaries, orders = [], orderItems = [],
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
  const adValues = adRows.map(adSettlementAmount);
  const adCostRows = costs.filter(isAdvertisingCost);
  const advertising = adValues.length
    ? completeSum(adRows,adSettlementAmount)
    : adCostRows.length
      ? completeSum(adCostRows,row=>[row.cost_amount,row.cost_vat,row.credit_amount].some(value=>numberOrNull(value)==null)?null:number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount))
      : null;
  const summaryRows = summaries || [];
  const payout=payoutEvidence(summaryRows,startMs,endMs);
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
  const settlementGross = completeSum(saleRows,row=>numberOrNull(row.sale_amount)==null?null:Math.abs(number(row.sale_amount)));
  const grossSales = periodOrders.length ? completeSum(periodOrders,row=>numberOrNull(row.total_amount)) : rows.length ? settlementGross : null;
  const periodOrderIds = new Set(periodOrders.map(row=>String(row.order_id||'')).filter(Boolean));
  const settledOrderIds = new Set(rows.map(row=>String(row.order_id||'')).filter(Boolean));
  const separateSettlementRequired = strictCostCoverage && periodOrderIds.size > 0 && rows.length === 0;
  const settledPeriodOrderCount = separateSettlementRequired
    ? null
    : periodOrderIds.size
    ? [...periodOrderIds].filter(orderId=>settledOrderIds.has(orderId)).length
    : settledOrderIds.size;
  const settlementCoverage = separateSettlementRequired
    ? null
    : periodOrderIds.size
    ? Math.round(settledPeriodOrderCount / periodOrderIds.size * 1000) / 10
    : rows.length ? 100 : 0;
  const periodItems=orderItems.filter(row=>periodOrderIds.has(String(row.order_id||'')));
  const itemKeys=new Set(periodItems.map(row=>row.vendor_item_id?`${row.order_id}:${row.vendor_item_id}`:null));
  const storedItemCounts=new Map();
  for(const item of periodItems){const key=String(item.order_id);storedItemCounts.set(key,(storedItemCounts.get(key)||0)+1);}
  const expectedItemCount=periodOrders.reduce((sum,order)=>{
    const storedCount=storedItemCounts.get(String(order.order_id))||0;
    return sum+Math.max(storedCount,Math.max(0,number(order.item_count)));
  },0);
  const itemDenominator=Math.max(itemKeys.size,expectedItemCount);
  const settledItems=new Set(saleRows.filter(row=>row.order_id&&row.vendor_item_id).map(row=>`${row.order_id}:${row.vendor_item_id}`));
  const matchedItems=[...itemKeys].filter(key=>key&&settledItems.has(key)).length;
  const effectiveCoverage=separateSettlementRequired?null:itemDenominator?Math.round(matchedItems/itemDenominator*1000)/10:settlementCoverage;
  const completeSettlementCoverage = !strictCostCoverage || !periodOrderIds.size || (settlementCoverage===100&&(!itemDenominator||effectiveCoverage===100));
  const refunds = rows.length && completeSettlementCoverage
    ? refundRows.length?completeSum(refundRows,row=>numberOrNull(row.sale_amount)==null?null:Math.abs(number(row.sale_amount))):0
    : null;
  const settlementFees = completeSum(rows,row=>numberOrNull(row.service_fee)==null||numberOrNull(row.service_fee_vat)==null?null:number(row.service_fee)+number(row.service_fee_vat));
  const feeCostRows = costs.filter(row => String(row.source_type || '').toUpperCase() === 'SALES_COMMISSION');
  const importedFees = feeCostRows.length
    ? completeSum(feeCostRows,row=>[row.cost_amount,row.cost_vat,row.credit_amount].some(value=>numberOrNull(value)==null)?null:number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount))
    : null;
  const fees = strictCostCoverage ? (importedFees ?? (completeSettlementCoverage ? settlementFees : null)) : settlementFees;
  const logisticsRows = costs.filter(row => String(row.source_type || '').toUpperCase() !== 'SALES_COMMISSION' && !isAdvertisingCost(row));
  const logistics = logisticsRows.length
    ? completeSum(logisticsRows,row=>[row.cost_amount,row.cost_vat,row.credit_amount].some(value=>numberOrNull(value)==null)?null:number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount))
    : null;
  const actualPayout = payout.actual_payout;
  const costCoverageReady = strictCostCoverage
    ? [grossSales, refunds, fees, logistics, advertising].every(value=>value!=null)
    : rows.length && grossSales!=null&&refunds!=null&&fees!=null
      &&(!logisticsRows.length||logistics!=null)&&(!(adRows.length||adCostRows.length)||advertising!=null);
  const expectedPayout = costCoverageReady
    ? grossSales - refunds - number(fees) - number(logistics) - number(advertising)
    : null;
  const status = actualPayout != null ? 'ACTUAL' : expectedPayout != null ? 'ESTIMATED' : 'COST_REQUIRED';
  const coverageBasis = strictCostCoverage && periodOrderIds.size && settlementCoverage!=null
    ? ` · 정산 연결 ${settledPeriodOrderCount}/${periodOrderIds.size}건`
    : '';
  return {
    platform, label, status,
    basis:strictCostCoverage
      ? separateSettlementRequired
        ? '로켓그로스 주문 API · WING 정산·비용·광고 원장 별도 대조'
        : `로켓그로스 주문 API${coverageBasis} · WING 정산·비용·광고 원장 별도 대조`
      : summaryRows.length ? '확정 지급 자료' : '매출인식 정산 자료',
    gross_sales:grossSales, refunds, fees, logistics, advertising, expected_payout:expectedPayout, ...payout,
    order_count:periodOrderIds.size || settledOrderIds.size,
    settlement_order_count:settledPeriodOrderCount,
    settlement_coverage:effectiveCoverage,
    settlement_item_count:itemKeys.size?matchedItems:null,
    settlement_item_total:itemDenominator||null,
    settlement_source_status:separateSettlementRequired?'SEPARATE_SOURCE_REQUIRED':'CONNECTED',
    last_updated_at:lastSyncAt || latestDate([...periodOrders,...rows,...summaryRows,...costs,...adRows],['paid_at','recognition_date','settlement_date','event_date','date']),
    action:separateSettlementRequired
      ? '판매자배송 정산 API를 로켓그로스 지급액으로 합치지 않습니다. 최신 로켓그로스 WING 정산·비용·광고 원장을 가져오세요.'
      : strictCostCoverage && !completeSettlementCoverage
      ? `로켓그로스 주문 정산 연결 ${effectiveCoverage?.toLocaleString('ko-KR')??'확인 필요'}%입니다. 최신 쿠팡 정산 수집을 확인하고, 연결되지 않은 기간은 WING 정산 원문을 보완하세요.`
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
  const billingDates=new Set(billing.filter(row=>numberOrNull(row.used_purchased)!=null||numberOrNull(row.used_free)!=null).map(row=>dateOnly(row.date)));
  const fallbackStats=stats.filter(row=>!billingDates.has(dateOnly(row.date)));
  const advertising=usedValues.length?usedValues.reduce((sum,value)=>sum+value,0)+fallbackStats.reduce((sum,row)=>sum+number(row.cost),0):advertisingStats;
  const advertisingCharged=chargedValues.length?chargedValues.reduce((sum,value)=>sum+value,0):null;
  const latest=[...billing].sort((left,right)=>String(right.date).localeCompare(String(left.date)))[0]||null;
  const advertisingBalance=numberOrNull(latest?.current_balance??latest?.closing_balance);
  return {
    advertising,
    advertising_stats:advertisingStats,
    advertising_charged:advertisingCharged,
    advertising_balance:advertisingBalance,
    advertising_variance:advertising!=null&&advertisingStats!=null?advertising-advertisingStats:null,
    advertising_source:usedValues.length?(fallbackStats.length?'BIZMONEY_AND_CAMPAIGN_STATS':'BIZMONEY_EXHAUST'):advertisingStats!=null?'CAMPAIGN_STATS':null,
    advertising_billing_days:billingDates.size,
    advertising_complete:new Set([...billingDates,...stats.filter(row=>numberOrNull(row.cost)!=null).map(row=>dateOnly(row.date))]).size>=Math.ceil((endMs-startMs)/DAY_MS),
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
    row.settle_basis_end_date || row.settle_complete_date || row.settle_expect_date,
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
  const pendingRows=rows.filter(row=>!row.settle_complete_date);
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
    payout_complete:pendingRows.length===0,
    pending_payout:pendingRows.reduce((sum,row)=>sum+number(row.settle_amount),0),
    completed_expected_payout:actualPayout,
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
  const startMs = Date.parse(`${dateOnly(nowDate)}T00:00:00+09:00`) - (Math.max(1, periodDays)-1) * DAY_MS;
  const lastSync = platform => (syncs || []).find(item => String(item.platform || '').toUpperCase() === platform)?.finished_at || null;
  const latestCafe24Sync=[...(syncs || [])]
    .filter(item=>String(item.platform||'').toUpperCase()==='CAFE24'&&item.job_type==='FETCH_ALL')
    .sort((left,right)=>dateValue(right.finished_at||right.started_at)-dateValue(left.finished_at||left.started_at))[0] || null;
  const liveCafe24Capability=cafe24Token===undefined?null:cafe24FinanceCapability.assessFinanceCapability(cafe24Token);
  const legacySettlementCapability=latestCafe24Sync?.metadata?.capabilities?.settlement;
  const latestCafe24SalesError=(latestCafe24Sync?.metadata?.errors||[])
    .find(item=>item?.dataset==='salesDaily')||null;
  const storedErrorEvidence=latestCafe24SalesError?.evidence;
  const classifiedCafe24Error=latestCafe24SalesError?cafe24FinanceCapability.classifyFinanceError({
    status:storedErrorEvidence?.http_status??latestCafe24SalesError.status,
    code:latestCafe24SalesError.code,message:latestCafe24SalesError.message,
    payload:storedErrorEvidence?{code:storedErrorEvidence.error_code,message:storedErrorEvidence.error_message}:latestCafe24SalesError.payload
  }):null;
  const cafe24ReconnectRequired=['DISCONNECTED','RECONNECT_REQUIRED'].includes(liveCafe24Capability?.status)||classifiedCafe24Error?.status==='RECONNECT_REQUIRED';
  const cafe24ApprovalRequired=!cafe24ReconnectRequired&&(
    liveCafe24Capability?.status==='APPROVAL_REQUIRED'
    ||(legacySettlementCapability==='APPROVAL_REQUIRED'&&!latestCafe24SalesError)
    ||classifiedCafe24Error?.status==='APPROVAL_REQUIRED'
  );
  const cafe24VerifyRequired=!cafe24ReconnectRequired&&!cafe24ApprovalRequired&&(classifiedCafe24Error?.status==='VERIFY_REQUIRED'||legacySettlementCapability==='VERIFY_REQUIRED');
  const cafe24ScopeRequired=!cafe24ReconnectRequired&&!cafe24ApprovalRequired&&['SETUP_REQUIRED','SCOPE_REQUIRED'].includes(legacySettlementCapability);
  // Seller-delivery settlement IDs can overlap Rocket Growth order IDs. Only an
  // explicit delivery family is strong enough to move a payout row to the RG ledger.
  const isRocketGrowthRow=row=>deliveryFamily(row)==='COUPANG_RG';
  const rocketGrowthSettlements=(coupangSettlements||[]).filter(isRocketGrowthRow);
  const sellerSettlements=(coupangSettlements||[]).filter(row=>deliveryFamily(row)==='COUPANG');
  const costFamily=deliveryFamily;
  const rocketGrowthCosts=(coupangCostTransactions||[]).filter(row=>costFamily(row)==='COUPANG_RG');
  const sellerCosts=(coupangCostTransactions||[]).filter(row=>costFamily(row)==='COUPANG');
  const rocketGrowthAds=(coupangAdSettlements||[]).filter(row=>deliveryFamily(row)==='COUPANG_RG');
  const explicitlySellerAds=(coupangAdSettlements||[]).filter(row=>deliveryFamily(row)==='COUPANG');
  const sellerAds=explicitlySellerAds;
  const sellerSummaries=(coupangSettlementSummaries||[]).filter(row=>deliveryFamily(row)==='COUPANG');
  const rocketGrowthSummaries=(coupangSettlementSummaries||[]).filter(isRocketGrowthRow);
  const ledgerDiagnostics={
    unclassified_settlements:(coupangSettlements||[]).filter(row=>!deliveryFamily(row)).length,
    unclassified_costs:(coupangCostTransactions||[]).filter(row=>!deliveryFamily(row)).length,
    unclassified_payouts:(coupangSettlementSummaries||[]).filter(row=>!deliveryFamily(row)).length,
    unclassified_advertising:(coupangAdSettlements||[]).filter(row=>!deliveryFamily(row)).length,
  };
  const hasRocketGrowthEvidence=Boolean(
    coupangRgOrders.length || coupangRgOrderItems.length || rocketGrowthSettlements.length || rocketGrowthCosts.length || rocketGrowthAds.length || rocketGrowthSummaries.length
  );
  const coupangLabel=hasRocketGrowthEvidence?'쿠팡 판매자배송':'쿠팡';
  const channels = [
    buildCafe24Channel({ orders:cafe24Orders, salesDaily:cafe24SalesDaily, settings:channelCostSettings, startMs, endMs, unavailable:Boolean(unavailable.CAFE24), lastSyncAt:lastSync('CAFE24'), reconnectRequired:cafe24ReconnectRequired, scopeRequired:cafe24ScopeRequired, approvalRequired:cafe24ApprovalRequired,verifyRequired:cafe24VerifyRequired }),
    buildNaverChannel({ orders:naverOrders, settlements:naverSettlements, adStats:naverAdStats, bizmoneyDaily:naverBizmoneyDaily, startMs, endMs, unavailable:Boolean(unavailable.NAVER), lastSyncAt:lastSync('NAVER') }),
    buildCoupangChannel({ settlements:sellerSettlements, costTransactions:sellerCosts, adSettlements:sellerAds, summaries:sellerSummaries, platform:'COUPANG', label:coupangLabel, startMs, endMs, unavailable:Boolean(unavailable.COUPANG), lastSyncAt:lastSync('COUPANG') }),
    ...(hasRocketGrowthEvidence ? [buildCoupangChannel({
      settlements:rocketGrowthSettlements, costTransactions:rocketGrowthCosts, adSettlements:rocketGrowthAds,
      summaries:rocketGrowthSummaries, orders:coupangRgOrders, orderItems:coupangRgOrderItems, platform:'COUPANG_RG', label:'쿠팡 로켓그로스', strictCostCoverage:true,
      startMs, endMs, unavailable:Boolean(unavailable.COUPANG_RG), lastSyncAt:lastSync('COUPANG')
    })] : [])
  ].map(channel => ({
    ...channel,
    ...(channel.platform==='COUPANG'&&Object.values(ledgerDiagnostics).some(count=>count>0)?{
      ledger_status:'FAMILY_REQUIRED',
      basis:`${channel.basis} · 배송유형 미분류 원장 별도 보관`,
      action:`${channel.action} 배송유형이 없는 원장은 판매자배송·로켓그로스로 임의 배분하지 않습니다. WING 원장의 배송유형을 확인해 가져오세요.`,
    }:{}),
    payout_basis:channel.platform==='CAFE24'?'SALES_MINUS_PLATFORM_FEES':channel.platform==='NAVER'?'PLATFORM_SETTLEMENT_LEDGER':'SALES_MINUS_PLATFORM_AND_WING_DEDUCTIONS',
    after_operating_costs:channel.platform==='CAFE24'&&channel.expected_payout!=null&&channel.logistics!=null
      ?channel.expected_payout-channel.logistics:null,
    payout_variance:channel.payout_complete!==false&&channel.actual_payout != null && channel.expected_payout != null
      ? channel.actual_payout - channel.expected_payout
      : null
  }));
  const numeric = (key, states) => channels.filter(item=>states.includes(item.status)).map(item=>item[key]).filter(value=>value!=null);
  const estimated = numeric('expected_payout',['ESTIMATED']);
  const fees = numeric('fees',['ACTUAL','ESTIMATED']);
  const logistics = numeric('logistics',['ACTUAL','ESTIMATED']);
  const advertising = numeric('advertising',['ACTUAL','ESTIMATED']);
  const coupangSchedules = (coupangSettlementSummaries || []).filter(row=>dateValue(row.settlement_date)!=null).map(row=>({
    platform:deliveryFamily(row)||'COUPANG_COMBINED', date:dateOnly(row.settlement_date), status:row.status || '확인 필요',
    amount:coupangScheduleAmount(row),
    type:!deliveryFamily(row)
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
  const actualRevenueChannels=channels.filter(item=>item.actual_payout!=null);
  const actualPayout=actualRevenueChannels.length
    ?actualRevenueChannels.reduce((sum,item)=>sum+Number(item.actual_payout),0)
    :null;
  const actualPayoutComplete=channels.length>0&&channels.every(item=>item.actual_payout!=null&&item.payout_complete!==false);
  const actualPayoutCoverage=channels.length
    ?Math.round(channels.filter(item=>item.actual_payout!=null&&item.payout_complete!==false).length/channels.length*1000)/10
    :null;
  const componentChannels = key => {
    if (['refunds','fees'].includes(key)) return channels;
    if (key === 'logistics') return channels.filter(item=>['CAFE24','COUPANG','COUPANG_RG'].includes(item.platform));
    if (key === 'advertising') return channels.filter(item=>['NAVER','COUPANG','COUPANG_RG'].includes(item.platform));
    return channels;
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
  const expectedNet = channels.length && channels.every(item=>item.expected_payout!=null)
    ? channels.reduce((sum,item)=>sum+Number(item.expected_payout),0)
    : null;
  const actualComparable = channels.filter(item => item.payout_variance!=null);
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
    phase:'13-5', calculation_version:'settlement-ledger-v2', ledger_diagnostics:ledgerDiagnostics, period_start:new Date(startMs).toISOString(), period_end:nowDate.toISOString(), channels, schedules,
    waterfall:{
      payout_basis:'CHANNEL_SPECIFIC',
      operating_result_basis:'SALES_MINUS_REFUNDS_FEES_LOGISTICS_ADVERTISING_BEFORE_PRODUCT_COST',
      after_operating_costs:[grossSales,refunds,feesTotal,logisticsTotal,advertisingTotal].every(value=>value!=null)
        ?grossSales-refunds-feesTotal-logisticsTotal-advertisingTotal:null,
      gross_sales:grossSales,
      refunds,
      fees:feesTotal,
      logistics:logisticsTotal,
      advertising:advertisingTotal,
      advertising_charged:naverAdvertisingCharged,
      expected_payout:expectedNet,
      actual_payout:actualPayout,
      actual_payout_complete:actualPayoutComplete,
      actual_payout_coverage:actualPayoutCoverage,
      actual_channel_count:actualRevenueChannels.length,
      revenue_channel_count:channels.length,
      known_gross_sales:revenueChannels.length?revenueChannels.reduce((sum,item)=>sum+item.gross_sales,0):null,
      gross_sales_complete:channels.every(item=>item.gross_sales!=null),
      variance,
      comparable_channels:actualComparable.length,
      revenue_breakdown:revenueBreakdown,
      rocket_growth:rocketGrowthBreakdown
    },
    summary:{
      actual_payout:actualPayout,
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
