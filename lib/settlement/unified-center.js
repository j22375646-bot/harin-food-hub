'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function coupangScheduleAmount(row = {}) {
  const status=String(row.status||'').toUpperCase();
  const completed=['DONE','COMPLETED','COMPLETE','PAID'].includes(status);
  return completed
    ?numberOrNull(row.final_amount ?? row.settlement_amount ?? row.settlement_target_amount)
    :numberOrNull(row.settlement_amount ?? row.settlement_target_amount ?? row.final_amount);
}

function buildCafe24Channel({ orders, salesDaily, settings, startMs, endMs, unavailable, lastSyncAt, scopeRequired }) {
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
    platform:'CAFE24', label:'Cafe24', status:scopeRequired?'SCOPE_REQUIRED':'NO_DATA', basis:scopeRequired?'주문 자료 없음 · 매출통계 권한 필요':'주문 자료 없음',
    gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,
    order_count:periodOrders.length, last_updated_at:lastSyncAt || latestDate(periodOrders,['order_date']),
    action:scopeRequired?'Cafe24 매출통계 읽기 권한을 다시 연결하세요.':'최근 30일 결제 주문이 없다면 정상입니다. 주문이 있다면 Cafe24 수집 상태를 확인하세요.',
    action_href:scopeRequired?'/oauth/cafe24/start':null
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
    platform:'CAFE24', label:'Cafe24', status:!hasSalesApi&&scopeRequired ? 'SCOPE_REQUIRED' : hasCostSetting ? 'ESTIMATED' : 'COST_REQUIRED',
    basis:hasSalesApi
      ? hasCostSetting ? 'Cafe24 매출통계 API · 예상 정산' : 'Cafe24 매출통계 API · 비용 설정 필요'
      : scopeRequired ? '주문 기반 추정 · 매출통계 권한 필요' : hasCostSetting ? '주문·설정 기반 예상' : '비용 설정 필요',
    gross_sales:grossSales, refunds,
    fees, logistics, expected_payout:expectedPayout, actual_payout:null, order_count:orderCount,
    last_updated_at:lastSyncAt || latestDate(hasSalesApi?periodSales:periodOrders,hasSalesApi?['date']:['order_date']),
    action:!hasSalesApi&&scopeRequired
      ? '현재 금액은 주문 자료 기반 추정입니다. Cafe24 매출통계 읽기 권한을 다시 연결하세요.'
      : hasCostSetting
      ? '예상 정산액입니다. 실제 입금액과 다르면 Cafe24 결제수단별 수수료를 보정하세요.'
      : 'Cafe24 판매수수료·결제수수료·기본 배송비를 상품에서 입력하고 변경기록에서 결과를 확인하세요.',
    action_href:!hasSalesApi&&scopeRequired ? '/oauth/cafe24/start' : null
  };
}

function buildCoupangChannel({ settlements, costTransactions, adSettlements, summaries, startMs, endMs, unavailable, lastSyncAt }) {
  if (unavailable) return {
    platform:'COUPANG', label:'쿠팡', status:'UNAVAILABLE', basis:'자료 확인 필요',
    gross_sales:null, refunds:null, fees:null, logistics:null, advertising:null, expected_payout:null, actual_payout:null,
    order_count:null, last_updated_at:lastSyncAt, action:'서울 고정 IP 서버에서 쿠팡 정산 수집 상태를 확인하세요.'
  };

  const rows = (settlements || []).filter(row => inPeriod(row.recognition_date, startMs, endMs));
  const costs = (costTransactions || []).filter(row => inPeriod(row.event_date || row.recognition_date, startMs, endMs));
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
  if (!rows.length && !summaryRows.length) return {
    platform:'COUPANG', label:'쿠팡', status:'NO_DATA', basis:'정산 자료 없음',
    gross_sales:null, refunds:null, fees:null, logistics:costs.length ? costs.filter(row=>!isAdvertisingCost(row)).reduce((sum,row)=>sum+Math.max(0,number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount)),0) : null,
    advertising,
    expected_payout:null, actual_payout:null, order_count:null,
    last_updated_at:lastSyncAt || latestDate([...costs,...adRows],['event_date','recognition_date','date']),
    action:'쿠팡 정산 API 또는 WING 정산 파일을 수집하세요.'
  };

  const saleRows = rows.filter(row => String(row.sale_type || '').toUpperCase() !== 'REFUND');
  const refundRows = rows.filter(row => String(row.sale_type || '').toUpperCase() === 'REFUND');
  const grossSales = saleRows.reduce((sum,row)=>sum+Math.abs(number(row.sale_amount)),0);
  const refunds = refundRows.reduce((sum,row)=>sum+Math.abs(number(row.sale_amount)),0);
  const fees = rows.length ? rows.reduce((sum,row)=>sum+number(row.service_fee)+number(row.service_fee_vat),0) : null;
  const logisticsRows = costs.filter(row => String(row.source_type || '').toUpperCase() !== 'SALES_COMMISSION' && !isAdvertisingCost(row));
  const logistics = logisticsRows.length
    ? logisticsRows.reduce((sum,row)=>sum+number(row.cost_amount)+number(row.cost_vat)-number(row.credit_amount),0)
    : null;
  const rowPayout = rows.length ? rows.reduce((sum,row)=>sum+number(row.settlement_amount),0) : null;
  const summaryPayout = summaryRows.length ? summaryRows.reduce((sum,row)=>sum+number(row.final_amount),0) : null;
  const actualPayout = summaryPayout ?? rowPayout;
  const expectedPayout = rows.length ? grossSales - refunds - number(fees) - number(advertising) : null;
  return {
    platform:'COUPANG', label:'쿠팡', status:'ACTUAL', basis:summaryRows.length ? '확정 지급 자료' : '매출인식 정산 자료',
    gross_sales:grossSales, refunds, fees, logistics, advertising, expected_payout:expectedPayout, actual_payout:actualPayout,
    order_count:new Set(rows.map(row=>row.order_id).filter(Boolean)).size,
    last_updated_at:lastSyncAt || latestDate([...rows,...summaryRows],['recognition_date','settlement_date']),
    action:actualPayout == null ? '정산 지급액이 비어 있습니다. WING 정산 파일을 확인하세요.' : '예상액과 확정 지급액 차이가 크면 환불·광고비·보류금·물류비 내역을 펼쳐 확인하세요.'
  };
}

function buildNaverChannel({ orders, settlements, startMs, endMs, unavailable, lastSyncAt }) {
  const rows = (settlements || []).filter(row => inPeriod(
    row.settle_complete_date || row.settle_expect_date || row.settle_basis_end_date,
    startMs,
    endMs
  ));
  const periodOrders = (orders || []).filter(order => inPeriod(order.payment_date || order.order_date, startMs, endMs));
  if (unavailable) {
    return {
      platform:'NAVER', label:'네이버', status:'UNAVAILABLE', basis:'자료 확인 필요',
      gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,
      order_count:null, last_updated_at:lastSyncAt, action:'네이버 커머스 API 연결 상태를 확인하세요.'
    };
  }
  if (!rows.length) {
    return {
      platform:'NAVER', label:'네이버', status:'NO_DATA', basis:'최근 정산 자료 없음',
      gross_sales:null, refunds:null, fees:null, logistics:null, expected_payout:null, actual_payout:null,
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
    gross_sales:grossSales, refunds:null, fees, logistics:null,
    expected_payout:expectedPayout, actual_payout:actualPayout, order_count:periodOrders.length,
    last_updated_at:lastSyncAt || latestDate(rows,['settle_complete_date','settle_expect_date','settle_basis_end_date','updated_at']),
    action:completedRows.length
      ? '정산액과 실제 입금액 차이가 있으면 보류금·차감복원 내역을 확인하세요.'
      : '표시된 금액은 정산예정액입니다. 정산완료일 이후 실제 입금액을 확인하세요.'
  };
}

function buildUnifiedSettlementCenter({
  cafe24Orders = [], cafe24SalesDaily = [], naverOrders = [], naverSettlements = [], coupangSettlements = [], coupangCostTransactions = [], coupangAdSettlements = [], coupangSettlementSummaries = [],
  channelCostSettings = [], syncs = [], unavailable = {}, now = new Date(), periodDays = 30
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const endMs = nowDate.getTime();
  const startMs = endMs - Math.max(1, periodDays) * DAY_MS;
  const lastSync = platform => (syncs || []).find(item => String(item.platform || '').toUpperCase() === platform)?.finished_at || null;
  const latestCafe24Sync=[...(syncs || [])]
    .filter(item=>String(item.platform||'').toUpperCase()==='CAFE24'&&item.job_type==='FETCH_ALL')
    .sort((left,right)=>dateValue(right.finished_at||right.started_at)-dateValue(left.finished_at||left.started_at))[0] || null;
  const cafe24ScopeRequired=latestCafe24Sync?.metadata?.capabilities?.settlement==='SETUP_REQUIRED';
  const channels = [
    buildCafe24Channel({ orders:cafe24Orders, salesDaily:cafe24SalesDaily, settings:channelCostSettings, startMs, endMs, unavailable:Boolean(unavailable.CAFE24), lastSyncAt:lastSync('CAFE24'), scopeRequired:cafe24ScopeRequired }),
    buildNaverChannel({ orders:naverOrders, settlements:naverSettlements, startMs, endMs, unavailable:Boolean(unavailable.NAVER), lastSyncAt:lastSync('NAVER') }),
    buildCoupangChannel({ settlements:coupangSettlements, costTransactions:coupangCostTransactions, adSettlements:coupangAdSettlements, summaries:coupangSettlementSummaries, startMs, endMs, unavailable:Boolean(unavailable.COUPANG), lastSyncAt:lastSync('COUPANG') })
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
  const coupangSchedules = (coupangSettlementSummaries || []).filter(row=>dateValue(row.settlement_date)!=null).map(row=>({
    platform:'COUPANG', date:dateOnly(row.settlement_date), status:row.status || '확인 필요',
    amount:coupangScheduleAmount(row),
    type:row.settlement_type || null, month:row.recognition_month || null
  }));
  const naverSchedules = (naverSettlements || []).filter(row=>dateValue(row.settle_expect_date || row.settle_complete_date)!=null).map(row=>({
    platform:'NAVER', date:dateOnly(row.settle_complete_date || row.settle_expect_date),
    status:row.settle_complete_date ? '정산완료' : '정산예정',
    amount:numberOrNull(row.settle_amount), type:'일별 정산', month:dateOnly(row.settle_basis_end_date).slice(0,7) || null
  }));
  const schedules = [...coupangSchedules,...naverSchedules].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,12);
  const totalOrNull = key => {
    const values = channels.map(item => item[key]).filter(value => value != null);
    return values.length ? values.reduce((sum, value) => sum + Number(value), 0) : null;
  };
  const grossSales = totalOrNull('gross_sales');
  const refunds = totalOrNull('refunds');
  const feesTotal = totalOrNull('fees');
  const logisticsTotal = totalOrNull('logistics');
  const advertisingTotal = totalOrNull('advertising');
  const expectedNet = [grossSales, refunds, feesTotal].every(value => value != null)
    ? grossSales - refunds - feesTotal - number(advertisingTotal)
    : null;
  const actualComparable = channels.filter(item => item.actual_payout != null && item.expected_payout != null);
  const variance = actualComparable.length
    ? actualComparable.reduce((sum, item) => sum + item.payout_variance, 0)
    : null;
  return {
    phase:'13-5', period_start:new Date(startMs).toISOString(), period_end:nowDate.toISOString(), channels, schedules,
    waterfall:{
      gross_sales:grossSales,
      refunds,
      fees:feesTotal,
      logistics:logisticsTotal,
      advertising:advertisingTotal,
      expected_payout:expectedNet,
      actual_payout:actual.length ? actual.reduce((sum,value)=>sum+value,0) : null,
      variance,
      comparable_channels:actualComparable.length
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
