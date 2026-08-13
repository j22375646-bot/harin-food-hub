'use strict';

const supabaseModule = require('../cafe24/supabase.js');

const num = value => Number(value || 0);
const iso = date => date.toISOString().slice(0, 10);
const kstDate = value => new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function evaluationWindows(executedAt, now = new Date(), checkpoints = [7,14]) {
  if (!executedAt) return [];
  const executionDate = kstDate(executedAt);
  const today = kstDate(now);
  return checkpoints.map(days => ({
    days,
    baseline_start:shiftDate(executionDate,-days),
    baseline_end:shiftDate(executionDate,-1),
    evaluation_start:shiftDate(executionDate,1),
    evaluation_end:shiftDate(executionDate,days)
  })).filter(window => window.evaluation_end <= today);
}

function aggregateStats(rows = []) {
  if (!rows.length) return null;
  const totals=rows.reduce((sum,row)=>({
    impressions:sum.impressions+num(row.impressions), clicks:sum.clicks+num(row.clicks), cost:sum.cost+num(row.cost),
    conversions:sum.conversions+num(row.conversions), conversion_revenue:sum.conversion_revenue+num(row.conversion_revenue)
  }),{impressions:0,clicks:0,cost:0,conversions:0,conversion_revenue:0});
  return {...totals,roas:totals.cost ? totals.conversion_revenue/totals.cost*100 : null};
}

function outcome(before, after) {
  if (!after) return { name: 'NO_DATA', rate: null, text: '평가 기간의 성과 데이터가 아직 없습니다.' };
  const beforeRoas = num(before.roas);
  const afterRoas = num(after.roas);
  const rate = beforeRoas ? ((afterRoas - beforeRoas) / beforeRoas) * 100 : null;
  if (afterRoas > beforeRoas || (num(after.conversions) > num(before.conversions) && num(after.cost) <= num(before.cost))) return { name: 'IMPROVED', rate, text: '실행 후 광고 효율이 개선되었습니다.' };
  if (afterRoas < beforeRoas || (num(after.cost) > num(before.cost) && num(after.conversions) <= num(before.conversions))) return { name: 'DECLINED', rate, text: '실행 후 효율이 낮아져 추가 점검이 필요합니다.' };
  return { name: 'INCONCLUSIVE', rate, text: '변화가 작아 더 많은 표본이 필요합니다.' };
}

async function naverStats(db, action, start, end) {
  if (action.platform !== 'NAVER' || !action.target_id) return null;
  const result=await db.from('naver_stats_daily').select('impressions,clicks,cost,conversions,conversion_revenue').eq('entity_id',action.target_id).gte('date',start).lte('date',end);
  if (result.error) throw result.error;
  return aggregateStats(result.data||[]);
}

async function evaluateActions({ minimumDays = 0, now = new Date(), db = supabaseModule.getSupabase() } = {}) {
  const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(7,minimumDays));
  const actions = await db.from('actions').select('id,platform,target_type,target_id,target_name,before_value,after_value,executed_at,review_after,status').in('status', ['EXECUTED', 'REVIEWED']).lte('executed_at', cutoff.toISOString()).order('executed_at');
  if (actions.error) throw actions.error;
  let evaluated = 0, skipped = 0;

  for (const action of actions.data || []) {
    for (const window of evaluationWindows(action.executed_at,now)) {
      const existing = await db.from('action_evaluations').select('id').eq('action_id', action.id).eq('evaluation_end', window.evaluation_end).limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) { skipped += 1; continue; }
      const [baseline,after]=await Promise.all([
        naverStats(db,action,window.baseline_start,window.baseline_end),
        naverStats(db,action,window.evaluation_start,window.evaluation_end)
      ]);
      const before=baseline||action.before_value||{};
      const result = outcome(before, after);
      const inserted = await db.from('action_evaluations').insert({
        action_id: action.id, baseline_start:window.baseline_start, baseline_end:window.baseline_end,
        evaluation_start:window.evaluation_start, evaluation_end:window.evaluation_end,
        metric_name: `ROAS_${window.days}D`, before_json:before, after_json: after || {},
        change_rate: result.rate, outcome: result.name, explanation: `${window.days}일 평가 · ${result.text}`
      });
      if (inserted.error) throw inserted.error;
      const updated=await db.from('actions').update({ status: result.name === 'NO_DATA' ? action.status : 'REVIEWED', after_value: after || action.after_value, review_result: { checkpoint_days:window.days,outcome: result.name, change_rate: result.rate, explanation: result.text }, updated_at: new Date(now).toISOString() }).eq('id', action.id);
      if (updated.error) throw updated.error;
      evaluated += 1;
    }
  }
  return { eligible: actions.data?.length || 0, evaluated, skipped, checkpoints:[7,14] };
}

module.exports = { evaluateActions, evaluationWindows, aggregateStats, outcome };
