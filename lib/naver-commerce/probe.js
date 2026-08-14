'use strict';

const client = require('./client.js');

function kstIso(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  }).formatToParts(value).reduce((result, item) => ({ ...result, [item.type]:item.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000+09:00`;
}

function itemCount(payload, paths) {
  for (const path of paths) {
    let value = payload;
    for (const key of path) value = value?.[key];
    if (Array.isArray(value)) return value.length;
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

async function saveRaw(db, endpoint, result, error) {
  if (!db) return;
  await db.from('raw_api_responses').insert({
    platform:'NAVER', endpoint:`COMMERCE:${endpoint}`,
    http_status:result?.status || error?.status || null,
    response_json:result?.data || error?.response || null,
    error_message:error?.message || null
  });
}

async function checked(db, key, work) {
  try {
    const result = await work();
    await saveRaw(db, key, result);
    return { key, ok:true, status:result.status, data:result.data };
  } catch (error) {
    await saveRaw(db, key, null, error);
    return { key, ok:false, status:error.status || 500, code:error.code || 'FAILED', error:error.message };
  }
}

async function probeReadAccess({ db, now = new Date() } = {}) {
  let syncLogId = null;
  if (db) {
    const started = await db.from('sync_logs').insert({ platform:'NAVER', job_type:'COMMERCE_CONNECTION_TEST', status:'RUNNING' }).select('id').single();
    if (started.error) throw started.error;
    syncLogId = started.data.id;
  }
  try {
    const config = client.getConfig();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const settlementEnd = now.toISOString().slice(0, 10);
    const settlementStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [products, orderClaims, inquiries, settlements] = await Promise.all([
      checked(db, '/v1/products/search', () => client.request('POST', '/v1/products/search', { config, body:{ page:1, size:1, orderType:'MOD_DATE' } })),
      checked(db, '/v1/pay-order/seller/product-orders/last-changed-statuses', () => client.request('GET', '/v1/pay-order/seller/product-orders/last-changed-statuses', { config, query:{ lastChangedFrom:kstIso(from), lastChangedTo:kstIso(now), limitCount:1 } })),
      checked(db, '/v1/contents/qnas', () => client.request('GET', '/v1/contents/qnas', { config, query:{ page:1, size:1, fromDate:from.toISOString(), toDate:now.toISOString() } })),
      checked(db, '/v1/pay-settle/settle/daily', () => client.request('GET', '/v1/pay-settle/settle/daily', { config, query:{ startDate:settlementStart, endDate:settlementEnd, pageNumber:1, pageSize:1 } }))
    ]);
    const checks = [products, orderClaims, inquiries, settlements];
    const failed = checks.filter(item => !item.ok);
    const result = {
      status:failed.length ? failed.length === checks.length ? 'FAILED' : 'PARTIAL' : 'SUCCESS',
      verifiedAt:new Date().toISOString(),
      tokenType:config.tokenType,
      writeEnabled:config.writeEnabled,
      capabilities:{
        products:{ read:products.ok, write:products.ok && config.writeEnabled },
        orders:{ read:orderClaims.ok, write:orderClaims.ok && config.writeEnabled },
        inquiries:{ read:inquiries.ok, write:inquiries.ok && config.writeEnabled },
        claims:{ read:orderClaims.ok, write:orderClaims.ok && config.writeEnabled },
        settlements:{ read:settlements.ok, write:false }
      },
      counts:{
        products:itemCount(products.data, [['totalElements'],['contents']]),
        orderChanges:itemCount(orderClaims.data, [['data','count'],['data','lastChangeStatuses']]),
        inquiries:itemCount(inquiries.data, [['totalElements'],['contents'],['data','contents']]),
        settlements:itemCount(settlements.data, [['totalElements'],['elements'],['data','elements']])
      },
      failures:failed.map(({ key, status, code, error }) => ({ key, status, code, error }))
    };
    if (db) {
      const updated = await db.from('sync_logs').update({
        status:result.status,
        finished_at:result.verifiedAt,
        rows_received:Object.values(result.counts).reduce((sum, value) => sum + Number(value || 0), 0),
        error_message:failed.length ? JSON.stringify(result.failures) : null,
        metadata:result
      }).eq('id', syncLogId);
      if (updated.error) throw updated.error;
      result.syncLogId = syncLogId;
    }
    return result;
  } catch (error) {
    if (db && syncLogId) {
      await db.from('sync_logs').update({
        status:'FAILED', finished_at:new Date().toISOString(), error_message:error.message,
        metadata:{ code:error.code || 'NAVER_COMMERCE_PROBE_FAILED' }
      }).eq('id', syncLogId);
    }
    throw error;
  }
}

module.exports = { kstIso, probeReadAccess };
