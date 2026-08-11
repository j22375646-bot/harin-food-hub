'use strict';

const supabaseModule = require('../cafe24/supabase.js');

const num = value => Number(value || 0);
const iso = date => date.toISOString().slice(0, 10);

function outcome(before, after) {
  if (!after) return { name: 'NO_DATA', rate: null, text: '평가 기간의 성과 데이터가 아직 없습니다.' };
  const beforeRoas = num(before.roas);
  const afterRoas = num(after.roas);
  const rate = beforeRoas ? ((afterRoas - beforeRoas) / beforeRoas) * 100 : null;
  if (afterRoas > beforeRoas || (num(after.conversions) > num(before.conversions) && num(after.cost) <= num(before.cost))) return { name: 'IMPROVED', rate, text: '실행 후 광고 효율이 개선되었습니다.' };
  if (afterRoas < beforeRoas || (num(after.cost) > num(before.cost) && num(after.conversions) <= num(before.conversions))) return { name: 'DECLINED', rate, text: '실행 후 효율이 낮아져 추가 점검이 필요합니다.' };
  return { name: 'INCONCLUSIVE', rate, text: '변화가 작아 더 많은 표본이 필요합니다.' };
}

async function evaluateActions({ minimumDays = 0 } = {}) {
  const db = supabaseModule.getSupabase();
  const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - minimumDays);
  const actions = await db.from('actions').select('id,platform,target_type,target_id,target_name,before_value,after_value,executed_at,review_after,status').in('status', ['EXECUTED', 'REVIEWED']).lte('executed_at', cutoff.toISOString()).order('executed_at');
  if (actions.error) throw actions.error;
  const latestPeriod = await db.from('naver_keyword_stats').select('period_start,period_end').order('period_end', { ascending: false }).limit(1).maybeSingle();
  if (latestPeriod.error) throw latestPeriod.error;
  let evaluated = 0;

  for (const action of actions.data || []) {
    const existing = await db.from('action_evaluations').select('id').eq('action_id', action.id).eq('evaluation_end', latestPeriod.data?.period_end || iso(new Date())).limit(1).maybeSingle();
    if (existing.error || existing.data) continue;
    let after = null;
    if (action.platform === 'NAVER' && action.target_type === 'KEYWORD' && latestPeriod.data) {
      const stats = await db.from('naver_keyword_stats').select('cost,clicks,conversions,conversion_revenue,roas').eq('period_start', latestPeriod.data.period_start).eq('period_end', latestPeriod.data.period_end).eq('ncc_keyword_id', action.target_id).maybeSingle();
      if (!stats.error) after = stats.data;
    }
    const result = outcome(action.before_value || {}, after);
    const inserted = await db.from('action_evaluations').insert({
      action_id: action.id,
      baseline_end: action.executed_at ? iso(new Date(action.executed_at)) : null,
      evaluation_start: latestPeriod.data?.period_start || null,
      evaluation_end: latestPeriod.data?.period_end || iso(new Date()),
      metric_name: 'ROAS', before_json: action.before_value || {}, after_json: after || {},
      change_rate: result.rate, outcome: result.name, explanation: result.text
    });
    if (inserted.error) continue;
    await db.from('actions').update({ status: result.name === 'NO_DATA' ? action.status : 'REVIEWED', after_value: after || action.after_value, review_result: { outcome: result.name, change_rate: result.rate, explanation: result.text }, updated_at: new Date().toISOString() }).eq('id', action.id);
    evaluated += 1;
  }
  return { eligible: actions.data?.length || 0, evaluated };
}

module.exports = { evaluateActions };
