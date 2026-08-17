'use strict';

const client = require('./client.js');

async function startLog(db) {
  if (!db) return null;
  const result = await db.from('sync_logs').insert({
    platform:'NAVER', job_type:'API_HUB_CONNECTION_TEST', status:'RUNNING',
    metadata:{ provider:'NAVER_API_HUB', service:'SEARCH_TREND', requestAttempted:false }
  }).select('id').single();
  if (result.error) throw result.error;
  return result.data.id;
}

async function finishLog(db, id, values) {
  if (!db || !id) return;
  const result = await db.from('sync_logs').update(values).eq('id', id);
  if (result.error) throw result.error;
}

async function probeReadAccess({ db, now = new Date() } = {}) {
  const syncLogId = await startLog(db);
  let requestAttempted = false;
  try {
    const config = client.getConfig();
    requestAttempted = true;
    const response = await client.probeSearchTrend({ now, config });
    const verifiedAt = new Date().toISOString();
    const result = {
      status:'SUCCESS', provider:'NAVER_API_HUB', service:'SEARCH_TREND', verifiedAt,
      requestAttempted:true, responseReceived:Boolean(response.data), responseStored:false,
      capabilities:{
        searchTrend:{ read:true },
        shoppingInsight:{ read:'NOT_TESTED' },
        search:{ read:'NOT_TESTED' }
      },
      quota:{ monthlyLimit:50_000, unit:'requests', source:'NAVER_API_HUB_APPLICATION' }
    };
    await finishLog(db, syncLogId, {
      status:'SUCCESS', finished_at:verifiedAt, rows_received:1, error_message:null, metadata:result
    });
    return { ...result, syncLogId };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await finishLog(db, syncLogId, {
      status:'FAILED', finished_at:failedAt, error_message:error.message,
      metadata:{
        provider:'NAVER_API_HUB', service:'SEARCH_TREND', verifiedAt:failedAt,
        code:error.code || 'NAVER_API_HUB_PROBE_FAILED', requestAttempted, responseStored:false
      }
    }).catch(() => {});
    throw error;
  }
}

module.exports = { probeReadAccess };
