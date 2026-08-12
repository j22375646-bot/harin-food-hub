'use strict';

async function queueRequest(db, requestType = 'FULL') {
  const existing = await db.from('coupang_sync_requests')
    .select('id,request_type,status,requested_at')
    .eq('request_type', requestType)
    .in('status', ['PENDING', 'RUNNING'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { queued: true, existing: true, request: existing.data };

  const queued = await db.from('coupang_sync_requests')
    .insert({ request_type: requestType, status: 'PENDING' })
    .select('id,request_type,status,requested_at')
    .single();
  if (queued.error) throw queued.error;
  return { queued: true, existing: false, request: queued.data };
}

module.exports = { queueRequest };
