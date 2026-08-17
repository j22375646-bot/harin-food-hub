'use strict';

const client = require('./client.js');

async function startLog(db) {
  if (!db) return null;
  const result = await db.from('sync_logs').insert({
    platform:'NAVER', job_type:'SEARCH_AD_CONNECTION_TEST', status:'RUNNING'
  }).select('id').single();
  if (result.error) throw result.error;
  return result.data.id;
}

async function finishLog(db, id, values) {
  if (!db || !id) return;
  const result = await db.from('sync_logs').update(values).eq('id', id);
  if (result.error) throw result.error;
}

async function probeReadAccess({ db } = {}) {
  const syncLogId = await startLog(db);
  try {
    client.config();
    const response = await client.request('GET', '/ncc/campaigns');
    const campaigns = Array.isArray(response.data) ? response.data : [];
    const verifiedAt = new Date().toISOString();
    const result = {
      status:'SUCCESS',
      provider:'NAVER_SEARCH_ADS',
      verifiedAt,
      writeEnabled:String(process.env.NAVER_SEARCH_AD_WRITE_ENABLED || '').toLowerCase() === 'true',
      capabilities:{ campaigns:{ read:true }, keywords:{ read:true }, bids:{ read:true, write:false } },
      counts:{ campaigns:campaigns.length },
      responseStored:false
    };
    await finishLog(db, syncLogId, {
      status:'SUCCESS', finished_at:verifiedAt, rows_received:campaigns.length, error_message:null, metadata:result
    });
    return { ...result, syncLogId };
  } catch (error) {
    const failedAt = new Date().toISOString();
    await finishLog(db, syncLogId, {
      status:'FAILED', finished_at:failedAt, error_message:error.message,
      metadata:{ provider:'NAVER_SEARCH_ADS', code:error.code || 'NAVER_SEARCH_AD_PROBE_FAILED', verifiedAt:failedAt, responseStored:false }
    }).catch(() => {});
    throw error;
  }
}

module.exports = { probeReadAccess };
