'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{64}$/;
function checked(value, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) throw Object.assign(new Error('INVALID_REQUEST'), {code: 'INVALID_REQUEST'});
  return value;
}
function usageOnly(input) {
  return Object.fromEntries(['inputTokens','outputTokens','promptTokens','completionTokens','totalTokens','reasoningTokens','cachedTokens']
    .filter(key => Number.isSafeInteger(input?.[key]) && input[key] >= 0).map(key => [key,input[key]]));
}
// The caller supplies schema-validated public-source output. Never persist the input
// query, raw provider response/prompt, manual products, credentials or internal datasets.
function publicRun(input) {
  const keys = ['runId','requestId','tenantId','requester','scope','provider','model','promptVersion','kind','snapshotHash','snapshot','sourceIds','sourceAsOf','dataState','fingerprint','status','output','validatedOutput','createdAt','costState'];
  const run = Object.fromEntries(keys.filter(key => input[key] !== undefined).map(key => [key,input[key]]));
  run.costState = 'FREE_CONFIRMED';
  if (input.usage) run.usage = usageOnly(input.usage);
  return run;
}
function createPublicMarketStore({db}) {
  if (!db || typeof db.rpc !== 'function' || typeof db.from !== 'function') throw new Error('PUBLIC_MARKET_STORE_REQUIRED');
  async function value(query) {
    const {data,error} = await query;
    if (error) throw Object.assign(new Error('PUBLIC_MARKET_STORE_UNAVAILABLE'), {code:'UNAVAILABLE'});
    return data;
  }
  return {
    async findReusable({tenantId,fingerprint}) {
      const row = await value(db.from('public_market_ai_runs').select('run').eq('tenant_id',checked(tenantId,UUID))
        .eq('fingerprint',checked(fingerprint,FINGERPRINT)).gte('created_at',new Date(Date.now()-7*86400000).toISOString()).maybeSingle());
      return row?.run?.tenantId === tenantId && row.run.fingerprint === fingerprint ? publicRun(row.run) : null;
    },
    async reserve({tenantId,requestId,accountId,fingerprint,requester}) {
      return value(db.rpc('moaon_public_market_ai_reserve',{p_tenant_id:checked(tenantId,UUID),p_request_id:checked(requestId,UUID),
        p_account_id:checked(accountId,/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/),p_fingerprint:checked(fingerprint,FINGERPRINT),p_requester:checked(requester,/^.{1,200}$/)}));
    },
    async settle({tenantId,requestId,status,usage}) {
      return value(db.rpc('moaon_public_market_ai_settle',{p_tenant_id:checked(tenantId,UUID),p_request_id:checked(requestId,UUID),
        p_status:checked(status,/^(SUCCEEDED|FAILED|UNKNOWN)$/),p_usage:usage ? usageOnly(usage) : null}));
    },
    async saveRun(input) {
      const run = publicRun(input);
      checked(run.tenantId,UUID); checked(run.runId,UUID); checked(run.requestId,UUID); checked(run.fingerprint,FINGERPRINT);
      const request = await value(db.from('public_market_ai_requests').select('fingerprint,status').eq('tenant_id',run.tenantId).eq('request_id',run.requestId).maybeSingle());
      if (!request || request.fingerprint !== run.fingerprint || !['RESERVED','SUCCEEDED'].includes(request.status)) throw new Error('RESERVATION_REQUIRED');
      await value(db.from('public_market_ai_runs').insert({tenant_id:run.tenantId,run_id:run.runId,request_id:run.requestId,fingerprint:run.fingerprint,run}));
      return run;
    },
  };
}
module.exports = {createPublicMarketStore};
