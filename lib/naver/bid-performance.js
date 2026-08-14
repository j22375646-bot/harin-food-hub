'use strict';

const supabaseModule = require('../cafe24/supabase.js');
const naverClient = require('./client.js');

const CHECKPOINTS = [7, 14];
const FORMULA_VERSION = 'n5-bid-performance-v1';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const dateOnly = value => String(value || '').slice(0, 10);

function kstDate(value = new Date()) {
  const date = new Date(value);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftDate(value, days) {
  const date = new Date(`${dateOnly(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function evaluationWindows(executedAt, now = new Date()) {
  if (!executedAt) return [];
  const executionDate = kstDate(executedAt);
  const today = kstDate(now);
  return CHECKPOINTS.map(checkpointDays => ({
    checkpoint_days:checkpointDays,
    baseline_start:shiftDate(executionDate, -checkpointDays),
    baseline_end:shiftDate(executionDate, -1),
    evaluation_start:shiftDate(executionDate, 1),
    evaluation_end:shiftDate(executionDate, checkpointDays)
  })).filter(window => window.evaluation_end <= today);
}

function aggregateMetrics(points = []) {
  if (!points.length) return null;
  const totals = points.reduce((sum, point) => ({
    impressions:sum.impressions + number(point.impCnt ?? point.impressions),
    clicks:sum.clicks + number(point.clkCnt ?? point.clicks),
    cost:sum.cost + number(point.salesAmt ?? point.cost),
    conversions:sum.conversions + number(point.ccnt ?? point.conversions),
    conversion_revenue:sum.conversion_revenue + number(point.convAmt ?? point.conversion_revenue)
  }), { impressions:0, clicks:0, cost:0, conversions:0, conversion_revenue:0 });
  return {
    ...totals,
    cpc:totals.clicks > 0 ? Math.round(totals.cost / totals.clicks) : null,
    cpa:totals.conversions > 0 ? Math.round(totals.cost / totals.conversions) : null,
    roas:totals.cost > 0 ? Math.round(totals.conversion_revenue / totals.cost * 1000) / 10 : null
  };
}

function responsePoints(payload) {
  const entities = Array.isArray(payload) ? payload : payload ? [payload] : [];
  const points = [];
  for (const entity of entities) {
    if (Array.isArray(entity?.data)) points.push(...entity.data);
    else if (entity?.data && typeof entity.data === 'object') points.push(entity.data);
    else if (entity && typeof entity === 'object') points.push(entity);
  }
  return points;
}

async function fetchKeywordMetrics(keywordId, start, end, api = naverClient) {
  const response = await api.request('GET', '/stats', {
    ids:[keywordId],
    fields:['impCnt', 'clkCnt', 'salesAmt', 'ccnt', 'convAmt'],
    timeRange:{ since:start, until:end }
  });
  return aggregateMetrics(responsePoints(response.data));
}

function confidenceFor(metrics, allowableCpa) {
  if (!metrics) return 'NONE';
  if (metrics.conversions >= 3 || (allowableCpa > 0 && metrics.cost >= allowableCpa * 2)) return 'HIGH';
  if (metrics.conversions >= 1 || (allowableCpa > 0 && metrics.cost >= allowableCpa)) return 'MEDIUM';
  return 'LOW';
}

function changeRate(before, after) {
  return Number.isFinite(before) && before !== 0 && Number.isFinite(after)
    ? Math.round((after - before) / Math.abs(before) * 1000) / 10
    : null;
}

function evaluateOutcome({ before, after, request, checkpointDays }) {
  if (!before || !after) return {
    data_status:'NO_DATA', outcome:'NO_DATA', decision:'WAIT', confidence:'NONE',
    explanation:`${checkpointDays}일 비교자료가 모두 모이지 않아 판단을 보류합니다.`
  };
  const target=request.impact_preview?.metadata?.product_target || {};
  const allowableCpa=number(target.allowable_cpa);
  if (allowableCpa <= 0) return {
    data_status:'BLOCKED', outcome:'BLOCKED', decision:'WAIT', confidence:'NONE',
    explanation:'상품 원가와 허용 CPA 근거가 없어 성과를 임의로 판정하지 않습니다.'
  };
  const confidence=confidenceFor(after, allowableCpa);
  const beforeRoas=before.roas, afterRoas=after.roas;
  const roasChange=changeRate(beforeRoas, afterRoas);
  const costChange=changeRate(before.cost, after.cost);
  const conversionChange=changeRate(before.conversions, after.conversions);
  const bidBefore=number(request.before_value?.values?.bid_amount);
  const bidAfter=number(request.proposed_value?.values?.bid_amount);
  const direction=bidAfter < bidBefore ? 'LOWER' : bidAfter > bidBefore ? 'RAISE' : 'KEEP';

  if (confidence === 'LOW') return {
    data_status:'PARTIAL', outcome:'INCONCLUSIVE', decision:'OBSERVE', confidence,
    explanation:`${checkpointDays}일 자료는 모였지만 목표 CPA만큼의 비용 또는 전환 표본이 부족합니다.`
  };

  const roasImproved=roasChange !== null && roasChange >= 5;
  const roasDeclined=roasChange !== null && roasChange <= -10;
  const conversionsProtected=conversionChange === null || conversionChange >= -20;
  const costSaved=costChange !== null && costChange <= -5;
  const revenueProtected=after.conversion_revenue >= before.conversion_revenue * 0.9;
  const improved=direction === 'LOWER'
    ? (roasImproved || (costSaved && conversionsProtected))
    : direction === 'RAISE'
      ? ((after.conversions > before.conversions || after.conversion_revenue > before.conversion_revenue) && !roasDeclined)
      : roasImproved;
  const declined=roasDeclined || (direction === 'LOWER' && !conversionsProtected && !revenueProtected)
    || (direction === 'RAISE' && after.conversion_revenue < before.conversion_revenue * 0.8);

  if (improved) return {
    data_status:'READY', outcome:'IMPROVED', decision:'KEEP', confidence,
    explanation:`${checkpointDays}일 비교에서 광고 효율이 개선되어 현재 입찰가 유지를 권장합니다.`
  };
  if (declined) return {
    data_status:'READY', outcome:'DECLINED', decision:'ROLLBACK_REVIEW', confidence,
    explanation:`${checkpointDays}일 비교에서 효율 또는 전환이 악화되어 사장님 롤백 검토가 필요합니다.`
  };
  return {
    data_status:'READY', outcome:'INCONCLUSIVE', decision:'OBSERVE', confidence,
    explanation:`${checkpointDays}일 전후 차이가 안전 판정 기준보다 작아 한 번 더 관찰합니다.`
  };
}

async function appendAudit(db, requestId, checkpointDays, result) {
  const inserted=await db.from('financial_change_audit_logs').insert({
    change_request_id:requestId,
    event_type:`NAVER_BID_${checkpointDays}D_EVALUATED`,
    actor:'12-7-performance-evaluator',
    detail:{ outcome:result.outcome, decision:result.decision, confidence:result.confidence, formula_version:FORMULA_VERSION }
  });
  if (inserted.error) throw inserted.error;
}

async function evaluateDueChanges({ db = supabaseModule.getSupabase(), now = new Date(), statsLoader = fetchKeywordMetrics } = {}) {
  const cutoff=new Date(now.getTime() - 7 * 86400000).toISOString();
  const changes=await db.from('financial_change_requests')
    .select('id,target_key,status,before_value,proposed_value,impact_preview,executed_at,rolled_back_at')
    .eq('change_type','NAVER_BID').in('status',['EXECUTED','VERIFIED','VERIFICATION_FAILED'])
    .not('executed_at','is',null).lte('executed_at',cutoff).order('executed_at',{ascending:true}).limit(100);
  if (changes.error) throw changes.error;
  const ids=(changes.data||[]).map(item=>item.id);
  let existing={data:[],error:null};
  if (ids.length) existing=await db.from('naver_bid_performance_evaluations').select('change_request_id,checkpoint_days').in('change_request_id',ids);
  if (existing.error) throw existing.error;
  const completed=new Set((existing.data||[]).map(item=>`${item.change_request_id}:${item.checkpoint_days}`));
  const failures=[];
  let evaluated=0, skipped=0;

  for (const request of changes.data||[]) {
    for (const window of evaluationWindows(request.executed_at,now)) {
      const key=`${request.id}:${window.checkpoint_days}`;
      if (completed.has(key)) { skipped+=1; continue; }
      try {
        const [before,after]=await Promise.all([
          statsLoader(request.target_key,window.baseline_start,window.baseline_end),
          statsLoader(request.target_key,window.evaluation_start,window.evaluation_end)
        ]);
        const result=evaluateOutcome({before,after,request,checkpointDays:window.checkpoint_days});
        const inserted=await db.from('naver_bid_performance_evaluations').insert({
          change_request_id:request.id,...window,before_metrics:before||{},after_metrics:after||{},...result
        });
        if (inserted.error?.code === '23505') { skipped+=1; continue; }
        if (inserted.error) throw inserted.error;
        await appendAudit(db,request.id,window.checkpoint_days,result);
        evaluated+=1;
      } catch (error) {
        failures.push({ change_request_id:request.id, checkpoint_days:window.checkpoint_days, error:String(error.message||error).slice(0,300) });
      }
    }
  }
  return { status:failures.length?'PARTIAL':'SUCCESS', eligible:(changes.data||[]).length, evaluated, skipped, failures, checkpoints:CHECKPOINTS, formula_version:FORMULA_VERSION };
}

function checkpointState(request, evaluations, days, now = new Date()) {
  const evaluation=evaluations.find(item=>String(item.change_request_id)===String(request.id)&&Number(item.checkpoint_days)===days);
  if (evaluation) return { status:'READY', due_date:evaluation.evaluation_end, ...evaluation };
  const executionDate=request.executed_at?kstDate(request.executed_at):null;
  const dueDate=executionDate?shiftDate(executionDate,days):null;
  if (!executionDate) return { status:'WAITING_EXECUTION', due_date:null };
  return { status:dueDate<=kstDate(now)?'DUE':'COLLECTING', due_date:dueDate };
}

async function listEvaluations({ db = supabaseModule.getSupabase(), now = new Date(), limit = 50 } = {}) {
  const [changes,evaluations]=await Promise.all([
    db.from('financial_change_requests').select('id,target_key,status,before_value,proposed_value,impact_preview,executed_at,verified_at,rolled_back_at,created_at').eq('change_type','NAVER_BID').order('created_at',{ascending:false}).limit(Math.min(100,Math.max(1,Number(limit)||50))),
    db.from('naver_bid_performance_evaluations').select('*').order('evaluation_end',{ascending:false}).limit(200)
  ]);
  if (changes.error||evaluations.error) throw changes.error||evaluations.error;
  const rows=(changes.data||[]).map(request=>({
    id:request.id,
    keyword:request.impact_preview?.metadata?.keyword||request.target_key,
    target_key:request.target_key,
    status:request.status,
    before_bid:number(request.before_value?.values?.bid_amount),
    after_bid:number(request.proposed_value?.values?.bid_amount),
    executed_at:request.executed_at,
    day7:checkpointState(request,evaluations.data||[],7,now),
    day14:checkpointState(request,evaluations.data||[],14,now)
  }));
  const ready=(evaluations.data||[]).filter(item=>['IMPROVED','DECLINED','INCONCLUSIVE'].includes(item.outcome));
  return {
    phase:'12-7', formula_version:FORMULA_VERSION,
    summary:{
      tracked:rows.filter(item=>item.executed_at).length,
      collecting:rows.filter(item=>['COLLECTING','DUE'].includes(item.day7.status)||['COLLECTING','DUE'].includes(item.day14.status)).length,
      improved:ready.filter(item=>item.outcome==='IMPROVED').length,
      rollback_review:ready.filter(item=>item.decision==='ROLLBACK_REVIEW').length,
      day7_ready:rows.filter(item=>item.day7.status==='READY').length,
      day14_ready:rows.filter(item=>item.day14.status==='READY').length
    },
    policy:{ owner_approval_required:true, automatic_execution:false, automatic_rollback:false, draft_limit:3, decrease_limit_percent:10, increase_limit_percent:5, increase_requires_inventory_evidence:true },
    rows
  };
}

module.exports={ CHECKPOINTS, FORMULA_VERSION, aggregateMetrics, evaluateDueChanges, evaluateOutcome, evaluationWindows, fetchKeywordMetrics, listEvaluations, responsePoints };
