'use strict';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const dateOnly = value => String(value || '').slice(0, 10);

function dateValue(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dayDiff(left, right) {
  const a = dateValue(left), b = dateValue(right);
  return a && b ? Math.max(0, Math.round((b - a) / 86400000)) : null;
}

function median(values) {
  const rows = values.map(number).filter(value => value > 0).sort((a,b) => a-b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : Math.round((rows[middle-1] + rows[middle]) / 2 * 10) / 10;
}

function orderAmount(order = {}) {
  return number(order.paid_amount ?? order.order_price ?? order.raw_data?.payment_amount ?? order.raw_data?.actual_order_amount?.payment_amount);
}

function sourceCategory(value) {
  const source = String(value || '').trim().toLowerCase();
  if (!source || ['direct','(direct)'].includes(source)) return { key:'DIRECT', label:'직접·미식별 유입' };
  if (source.includes('shopping.naver')) return { key:'NAVER_SHOPPING', label:'네이버 쇼핑' };
  if (source.includes('naver')) return { key:'NAVER_SEARCH', label:'네이버 검색·서비스' };
  if (source.includes('google')) return { key:'GOOGLE', label:'구글' };
  if (source.includes('daum')) return { key:'DAUM', label:'다음' };
  return { key:'OTHER', label:'기타 추천·외부 유입' };
}

function customerTimelines(orders) {
  const map = new Map();
  for (const order of orders || []) {
    const customerId = String(order.customer_id || '').trim();
    const orderedAt = dateValue(order.order_date);
    if (!customerId || !orderedAt) continue;
    const current = map.get(customerId) || [];
    current.push({ orderedAt, amount:orderAmount(order), orderId:String(order.order_id) });
    map.set(customerId, current);
  }
  for (const rows of map.values()) rows.sort((a,b) => a.orderedAt-b.orderedAt);
  return map;
}

function intervalsFor(rows) {
  const intervals = [];
  for (let index=1; index<rows.length; index+=1) {
    const days = dayDiff(rows[index-1].orderedAt, rows[index].orderedAt);
    if (days > 0 && days <= 365) intervals.push(days);
  }
  return intervals;
}

function acquisitionSummary(referrers) {
  const map = new Map();
  for (const row of referrers || []) {
    const category = sourceCategory(row.source);
    const current = map.get(category.key) || { ...category, visitors:0, orders:0, revenue:0, source_count:0, order_attribution:false, revenue_attribution:false };
    current.visitors += number(row.visitors);
    current.orders += number(row.orders);
    current.revenue += number(row.revenue);
    current.source_count += 1;
    current.order_attribution ||= number(row.orders) > 0;
    current.revenue_attribution ||= number(row.revenue) > 0;
    map.set(category.key, current);
  }
  const rows = [...map.values()].sort((a,b) => b.visitors-a.visitors);
  const visitors = rows.reduce((sum,row) => sum+row.visitors,0);
  return {
    status:rows.some(row => row.order_attribution || row.revenue_attribution) ? 'PARTIAL' : rows.length ? 'VISITS_ONLY' : 'NO_DATA',
    visitors,
    attributed_orders:rows.some(row => row.order_attribution) ? rows.reduce((sum,row) => sum+row.orders,0) : null,
    attributed_revenue:rows.some(row => row.revenue_attribution) ? rows.reduce((sum,row) => sum+row.revenue,0) : null,
    rows:rows.map(row => ({ ...row, visitor_share:visitors ? Math.round(row.visitors/visitors*1000)/10 : 0 }))
  };
}

function productRetention({ orders, items, lifecycleReady, asOf }) {
  const orderMap = new Map((orders || []).map(order => [String(order.order_id), { customerId:String(order.customer_id || '').trim(), orderedAt:dateValue(order.order_date) }]));
  const products = new Map();
  for (const item of items || []) {
    const order = orderMap.get(String(item.order_id));
    if (!order?.orderedAt) continue;
    const name = String(item.product_name || '상품명 없음').trim();
    const row = products.get(name) || { name, revenue:0, quantity:0, orders:new Set(), customerDates:new Map() };
    row.revenue += number(item.paid_amount ?? number(item.unit_price)*number(item.quantity));
    row.quantity += number(item.quantity);
    row.orders.add(String(item.order_id));
    if (order.customerId) {
      const dates = row.customerDates.get(order.customerId) || [];
      dates.push(order.orderedAt); row.customerDates.set(order.customerId, dates);
    }
    products.set(name,row);
  }
  return [...products.values()].map(row => {
    const intervals = [], repeatCustomers = [];
    for (const [customerId,dates] of row.customerDates) {
      dates.sort((a,b)=>a-b);
      const customerIntervals=intervalsFor(dates.map(orderedAt=>({orderedAt})));
      intervals.push(...customerIntervals);
      if (customerIntervals.length) repeatCustomers.push({ customerId, dates, cycle:median(customerIntervals) });
    }
    const cycle = intervals.length >= 3 ? median(intervals) : null;
    let dueCustomers = null, dormantCustomers = null;
    if (lifecycleReady && cycle) {
      dueCustomers=0; dormantCustomers=0;
      for (const customer of repeatCustomers) {
        const since = dayDiff(customer.dates.at(-1), asOf);
        if (since > Math.max(60,cycle*2)) dormantCustomers += 1;
        else if (since >= Math.max(1,cycle-7) && since <= cycle+14) dueCustomers += 1;
      }
    }
    return {
      name:row.name, revenue:row.revenue, quantity:row.quantity, orders:row.orders.size, identified_customers:row.customerDates.size,
      repeat_customers:repeatCustomers.length, interval_samples:intervals.length, cycle_days:cycle,
      cycle_status:cycle ? 'READY' : 'INSUFFICIENT_SAMPLE', due_customers:dueCustomers, dormant_customers:dormantCustomers
    };
  }).sort((a,b) => b.revenue-a.revenue || b.orders-a.orders);
}

function buildCustomerRetention({ orders = [], items = [], referrers = [], orderHistoryPeriod = null, asOf = new Date() } = {}) {
  const validDates = orders.map(order => dateValue(order.order_date)).filter(Boolean).sort((a,b)=>a-b);
  const historyStart=validDates[0]||null, historyEnd=validDates.at(-1)||null;
  const activityDays=historyStart&&historyEnd ? dayDiff(historyStart,historyEnd)+1 : 0;
  const coverageDays=orderHistoryPeriod?.start_date&&orderHistoryPeriod?.end_date?dayDiff(orderHistoryPeriod.start_date,orderHistoryPeriod.end_date)+1:0;
  const historyDays=Math.max(activityDays,coverageDays);
  const timelines=customerTimelines(orders), allIntervals=[];
  for (const rows of timelines.values()) allIntervals.push(...intervalsFor(rows));
  const repeatCustomers=[...timelines.values()].filter(rows=>rows.length>=2).length;
  const cycleDays=allIntervals.length>=3 ? median(allIntervals) : null;
  const lifecycleReady=historyDays>=90 && Boolean(cycleDays);
  let dueCustomers=null,dormantCustomers=null;
  if(lifecycleReady){
    dueCustomers=0;dormantCustomers=0;
    for(const rows of timelines.values()){
      const personalCycle=median(intervalsFor(rows))||cycleDays;
      const since=dayDiff(rows.at(-1).orderedAt,asOf);
      if(since>Math.max(60,personalCycle*2))dormantCustomers+=1;
      else if(since>=Math.max(1,personalCycle-7)&&since<=personalCycle+14)dueCustomers+=1;
    }
  }
  const identifiedOrders=[...timelines.values()].reduce((sum,rows)=>sum+rows.length,0);
  const placementMap=new Map();
  for(const order of orders){const place=String(order.raw_data?.order_place_name||'주문 접점 미상').trim();placementMap.set(place,(placementMap.get(place)||0)+1);}
  const products=productRetention({orders,items,lifecycleReady,asOf});
  const acquisition=acquisitionSummary(referrers);
  const recommendations=[];
  if(historyDays<90)recommendations.push({level:'WAIT',title:'휴면·재구매 예정 판단은 보류',body:`현재 저장 주문이 ${historyDays}일 범위라 최소 90일 이력이 필요합니다.`});
  if(allIntervals.length<3)recommendations.push({level:'WAIT',title:'상품별 재구매 주기 계산 대기',body:'동일 고객의 반복 구매 간격이 3개 이상 쌓이면 대표 주기를 계산합니다.'});
  if(acquisition.status==='VISITS_ONLY')recommendations.push({level:'DATA',title:'유입경로와 주문 연결 필요',body:'현재 유입경로는 방문만 수집되어 채널별 주문·매출을 판단하지 않습니다.'});
  return {
    status:orders.length?'PARTIAL':'NO_DATA',
    period:{start:orderHistoryPeriod?.start_date||historyStart?dateOnly(orderHistoryPeriod?.start_date||historyStart.toISOString()):null,end:orderHistoryPeriod?.end_date||historyEnd?dateOnly(orderHistoryPeriod?.end_date||historyEnd.toISOString()):null,days:historyDays,order_activity_days:activityDays},
    summary:{
      orders:orders.length,identified_orders:identifiedOrders,anonymous_orders:orders.length-identifiedOrders,
      identified_customers:timelines.size,one_order_customers:[...timelines.values()].filter(rows=>rows.length===1).length,
      repeat_customers:repeatCustomers,repeat_rate:timelines.size?Math.round(repeatCustomers/timelines.size*1000)/10:null,
      interval_samples:allIntervals.length,cycle_days:cycleDays,due_customers:dueCustomers,dormant_customers:dormantCustomers,
      lifecycle_status:lifecycleReady?'READY':'INSUFFICIENT_HISTORY'
    },
    products,
    acquisition,
    order_places:[...placementMap.entries()].map(([label,orders])=>({label,orders})).sort((a,b)=>b.orders-a.orders),
    recommendations,
    privacy:'고객 ID는 서버 메모리에서 집계에만 사용하며 결과와 화면에는 포함하지 않습니다.'
  };
}

function hasOwn(object,key){return Object.prototype.hasOwnProperty.call(object||{},key);}
function metricValue(object,keys){for(const key of keys)if(hasOwn(object,key))return number(object[key]);return null;}

function actionExpectation(action){
  const type=String(action.action_type||'').toUpperCase();
  const recommendation=String(action.after_value?.recommendation||'').trim();
  if(type.includes('PAUSE'))return {metric:'ROAS·광고비',effect:recommendation||'무전환 광고비를 줄이고 전체 효율을 높입니다.',risk_level:'HIGH',risk:'검색 수요가 뒤늦게 전환될 기회를 잃을 수 있습니다.'};
  if(type.includes('LOWER_BID'))return {metric:'CPC·ROAS',effect:recommendation||'클릭당 비용을 낮추고 광고 효율 변화를 확인합니다.',risk_level:'MEDIUM',risk:'노출과 방문이 함께 줄어 주문 기회가 감소할 수 있습니다.'};
  if(type.includes('ROAS'))return {metric:'ROAS·매출',effect:recommendation||'낭비 예산을 줄이고 전환매출 비중을 높입니다.',risk_level:'MEDIUM',risk:'예산 축소가 매출 감소로 이어질 수 있어 매출을 함께 봐야 합니다.'};
  if(type.includes('CONVERSION'))return {metric:'구매전환율·매출',effect:recommendation||'방문자가 주문으로 이어지는 비율을 높입니다.',risk_level:'LOW',risk:'원인을 바꾸지 못하면 성과 변화가 없을 수 있습니다.'};
  if(type.includes('COLLECT')||type.includes('WATCH'))return {metric:'표본·주문',effect:recommendation||'표본을 더 모아 잘못된 중지나 확대를 막습니다.',risk_level:'LOW',risk:'관찰 기간 동안 비효율이 계속될 수 있습니다.'};
  return {metric:'매출·이익',effect:recommendation||String(action.reason||'실행 후 매출과 이익 변화를 확인합니다.'),risk_level:'MEDIUM',risk:'실행 전후 조건이 다르면 효과를 잘못 해석할 수 있습니다.'};
}

function resultAt(action,evaluations,days,asOf){
  if(!action.executed_at)return {status:'WAITING_EXECUTION',label:'실행 전',due_date:null,revenue_change:null,profit_change:null};
  const due=new Date(action.executed_at);due.setUTCDate(due.getUTCDate()+days);
  if(dateValue(asOf)<due)return {status:'COLLECTING',label:`${days}일 자료 수집 중`,due_date:dateOnly(due.toISOString()),revenue_change:null,profit_change:null};
  const candidates=evaluations.filter(item=>String(item.action_id)===String(action.id)&&dateValue(`${item.evaluation_end||dateOnly(item.evaluated_at)}T23:59:59Z`)>=due).sort((a,b)=>String(a.evaluation_end||a.evaluated_at).localeCompare(String(b.evaluation_end||b.evaluated_at)));
  const evaluation=candidates[0];
  if(!evaluation)return {status:'NO_DATA',label:`${days}일 결과 확인 필요`,due_date:dateOnly(due.toISOString()),revenue_change:null,profit_change:null};
  const beforeRevenue=metricValue(evaluation.before_json,['conversion_revenue','revenue','net_sales']);
  const afterRevenue=metricValue(evaluation.after_json,['conversion_revenue','revenue','net_sales']);
  const beforeProfit=metricValue(evaluation.before_json,['contribution_profit','profit']);
  const afterProfit=metricValue(evaluation.after_json,['contribution_profit','profit']);
  return {
    status:evaluation.outcome,label:{IMPROVED:'개선',DECLINED:'하락',INCONCLUSIVE:'판단 보류',NO_DATA:'자료 없음'}[evaluation.outcome]||evaluation.outcome,
    due_date:dateOnly(due.toISOString()),metric_name:evaluation.metric_name,change_rate:evaluation.change_rate,
    revenue_change:beforeRevenue!==null&&afterRevenue!==null?afterRevenue-beforeRevenue:null,
    profit_change:beforeProfit!==null&&afterProfit!==null?afterProfit-beforeProfit:null,
    explanation:evaluation.explanation
  };
}

function relatedReport(action,reports){
  return (reports||[]).filter(report=>report.platform===action.platform||report.platform==='ALL').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]||null;
}

function relatedExperiment(action,experiments){
  const targets=[action.target_id,action.target_name].map(value=>String(value||'').trim()).filter(Boolean);
  return (experiments||[]).find(test=>(test.ab_test_variants||[]).some(variant=>targets.includes(String(variant.entity_id||'').trim())))||null;
}

function buildExecutionValidation({ actions=[], evaluations=[], reports=[], experiments=[], financialChanges=[], financialAudits=[], asOf=new Date() }={}){
  const rows=(actions||[]).map(action=>{
    const expectation=actionExpectation(action),report=relatedReport(action,reports),experiment=relatedExperiment(action,experiments);
    return {
      id:action.id,platform:action.platform,target_name:action.target_name,action_type:action.action_type,status:action.status,
      decided_at:action.decided_at,executed_at:action.executed_at,review_after:action.review_after,priority:action.priority,
      expectation,
      day7:resultAt(action,evaluations,7,asOf),day14:resultAt(action,evaluations,14,asOf),
      report:report?{id:report.id,title:report.title,platform:report.platform,created_at:report.created_at}:null,
      experiment:experiment?{id:experiment.id,name:experiment.name,status:experiment.status,evaluation_status:experiment.evaluation_status,result_summary:experiment.result_summary}:null
    };
  }).sort((a,b)=>Number(Boolean(b.executed_at))-Number(Boolean(a.executed_at))||String(b.decided_at||'').localeCompare(String(a.decided_at||'')));
  const changeRows=(financialChanges||[]).map(change=>{
    const audits=(financialAudits||[]).filter(audit=>audit.change_request_id===change.id);
    return {id:change.id,change_type:change.change_type,platform:change.platform,target_key:change.target_key,status:change.status,created_at:change.created_at,executed_at:change.executed_at,verified_at:change.verified_at,rolled_back_at:change.rolled_back_at,audit_count:audits.length,last_event:audits.at(-1)?.event_type||null,changes:change.impact_preview?.changes||[]};
  });
  return {
    status:rows.length||changeRows.length?'READY':'NO_DATA',
    summary:{planned:rows.filter(row=>['PLANNED','ON_HOLD'].includes(row.status)).length,executed:rows.filter(row=>Boolean(row.executed_at)).length,day7_ready:rows.filter(row=>['IMPROVED','DECLINED','INCONCLUSIVE'].includes(row.day7.status)).length,day14_ready:rows.filter(row=>['IMPROVED','DECLINED','INCONCLUSIVE'].includes(row.day14.status)).length,revenue_improved:rows.filter(row=>number(row.day14.revenue_change)>0).length,profit_improved:rows.filter(row=>number(row.day14.profit_change)>0).length,verified_changes:changeRows.filter(row=>row.status==='VERIFIED').length,rolled_back:changeRows.filter(row=>row.status==='ROLLED_BACK').length,linked_reports:rows.filter(row=>row.report).length,linked_experiments:rows.filter(row=>row.experiment).length},
    actions:rows,changes:changeRows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
  };
}

function nextDailyRun(asOf=new Date(),hour=5,minute=30){
  const now=new Date(asOf),kstNow=new Date(now.getTime()+9*60*60*1000);
  const date=dateOnly(kstNow.toISOString());
  let next=new Date(`${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+09:00`);
  if(next<=now)next=new Date(next.getTime()+86400000);
  return next.toISOString();
}

function buildAutomationStatus({customer,automationRuns=[],asOf=new Date()}={}){
  const latest=name=>(automationRuns||[]).filter(run=>run.job_name===name).sort((a,b)=>String(b.started_at||'').localeCompare(String(a.started_at||'')))[0]||null;
  const actionRun=latest('ACTION_EVALUATION'),experimentRun=latest('AB_TEST_EVALUATION'),syncRun=latest('CAFE24_SYNC');
  const runView=run=>run?{status:run.status,started_at:run.started_at,finished_at:run.finished_at,error_message:run.error_message||null}:null;
  const historyDays=customer?.period?.days||0;
  return {
    next_run_at:nextDailyRun(asOf),
    history:{status:historyDays>=90?'READY':'COLLECTING',days:historyDays,target_days:90,remaining_days:Math.max(0,90-historyDays),latest_run:runView(syncRun)},
    action_evaluation:{status:actionRun?.status||'WAITING',latest_run:runView(actionRun),checkpoints:[7,14]},
    experiment_evaluation:{status:experimentRun?.status||'WAITING',latest_run:runView(experimentRun)},
    attribution:{status:customer?.acquisition?.status==='VISITS_ONLY'?'CONNECTION_REQUIRED':'PARTIAL',message:customer?.acquisition?.status==='VISITS_ONLY'?'방문과 주문을 잇는 식별 자료가 아직 없습니다.':'수집된 주문·매출 귀속 자료를 사용합니다.'}
  };
}

function buildRetentionValidation(input={}){
  const customer=buildCustomerRetention(input);
  return {customer,execution:buildExecutionValidation(input),automation:buildAutomationStatus({...input,customer})};
}

module.exports={median,dayDiff,buildCustomerRetention,actionExpectation,resultAt,buildExecutionValidation,nextDailyRun,buildAutomationStatus,buildRetentionValidation};
