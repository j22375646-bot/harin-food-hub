'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireId(value) {
  if (!UUID.test(value || '')) throw Object.assign(new Error('INVALID_REQUEST'), {code: 'INVALID_REQUEST'});
  return value;
}
function createInsightStore({db}) {
  if (!db || typeof db.rpc !== 'function' || typeof db.from !== 'function') throw new Error('INSIGHT_STORE_REQUIRED');
  async function value(query) {
    const {data, error} = await query;
    if (error) throw Object.assign(new Error('INSIGHT_STORE_UNAVAILABLE'), {code: 'UNAVAILABLE'});
    return data;
  }
  const scoped = (table, tenantId) => db.from(table).select('*').eq('tenant_id', requireId(tenantId));
  const visible = (query) => query.gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString());
  return {
    async findReusable({tenantId, fingerprint}) {
      return (await value(visible(scoped('ai_insight_runs', tenantId)).eq('fingerprint', fingerprint).maybeSingle()))?.run || null;
    },
    async getRun({tenantId, runId}) {
      return (await value(visible(scoped('ai_insight_runs', tenantId)).eq('run_id', requireId(runId)).maybeSingle()))?.run || null;
    },
    async getRequest({tenantId, requestId}) {
      const row = await value(scoped('ai_usage_reservations', tenantId).eq('request_id', requireId(requestId)).maybeSingle());
      return row ? {requestId: row.request_id, reservationId: row.request_id, status: row.status, fingerprint: row.fingerprint} : null;
    },
    async listRuns({tenantId, limit = 30}) {
      const rows = await value(visible(scoped('ai_insight_runs', tenantId)).order('created_at', {ascending: false}).limit(Math.max(1, Math.min(50, Number(limit) || 30))));
      return (rows || []).map(row => row.run);
    },
    async deleteRun({tenantId, runId}) {
      const rows = await value(db.from('ai_insight_runs').delete().eq('tenant_id', requireId(tenantId)).eq('run_id', requireId(runId)).select('run_id'));
      return {deleted: !!rows?.length};
    },
    async saveRun(input) {
      // Only validated server fields; no provider raw response, headers or full prompt.
      const keys = ['runId','requestId','tenantId','requester','scope','provider','model','promptVersion','snapshotHash','sourceIds','sourceAsOf','dataState','fingerprint','status','question','parentRunId','turn','output','createdAt','snapshot','validatedOutput','usage'];
      const run = Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key,input[key]]));
      const reservation = await this.getRequest({tenantId: run.tenantId, requestId: run.requestId});
      if (!reservation || reservation.fingerprint !== run.fingerprint) throw new Error('RESERVATION_REQUIRED');
      await value(db.from('ai_insight_runs').insert({tenant_id: requireId(run.tenantId), run_id: requireId(run.runId), request_id: requireId(run.requestId), fingerprint: run.fingerprint, run}));
      return run;
    },
    async reserve(input) {
      return value(db.rpc('moaon_ai_reserve', {p_tenant_id: requireId(input.tenantId), p_request_id: requireId(input.requestId), p_provider: input.provider,
        p_provider_account_id: input.providerAccountId, p_requester: input.requester, p_fingerprint: input.fingerprint,
        p_max_cost_krw: input.maxCostKrw, p_pricing_version: input.pricingVersion}));
    },
    async settle(input) {
      const usage = input.usage && Object.fromEntries(['inputTokens','outputTokens','promptTokens','completionTokens','totalTokens','reasoningTokens'].filter(key => Number.isSafeInteger(input.usage[key]) && input.usage[key]>=0).map(key => [key,input.usage[key]]));
      return value(db.rpc('moaon_ai_settle', {p_tenant_id: requireId(input.tenantId), p_request_id: requireId(input.requestId), p_status: input.status,
        p_actual_cost_krw: input.actualCostKrw ?? null, p_usage: usage || null}));
    },
  };
}
module.exports = {createInsightStore};
