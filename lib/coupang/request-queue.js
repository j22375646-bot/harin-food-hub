'use strict';

async function queueRequest(db, requestType = 'FULL', options = {}) {
  const idempotencyKey = options.idempotencyKey || null;
  if (idempotencyKey) {
    const sameExecution = await db.from('coupang_sync_requests')
      .select('id,request_type,status,requested_at')
      .eq('request_type', requestType)
      .eq('idempotency_key', idempotencyKey)
      .limit(1)
      .maybeSingle();
    if (sameExecution.error) throw sameExecution.error;
    if (sameExecution.data) return { queued: true, existing: true, deduplicated: true, request: sameExecution.data };
  }

  const existing = await db.from('coupang_sync_requests')
    .select('id,request_type,status,requested_at')
    .eq('request_type', requestType)
    .in('status', ['PENDING', 'RUNNING'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { queued: true, existing: true, request: existing.data };

  let queued = await db.from('coupang_sync_requests')
    .insert({
      request_type: requestType,
      status: 'PENDING',
      idempotency_key: idempotencyKey,
      scheduled_for: options.scheduledFor || null,
      kst_execution_date: options.kstExecutionDate || null
    })
    .select('id,request_type,status,requested_at')
    .single();
  const collided = queued.error?.code === '23505' && idempotencyKey;
  if (collided) queued = await db.from('coupang_sync_requests')
      .select('id,request_type,status,requested_at')
      .eq('request_type', requestType)
      .eq('idempotency_key', idempotencyKey)
      .single();
  if (queued.error) throw queued.error;
  return { queued: true, existing: Boolean(collided), deduplicated: Boolean(collided), request: queued.data };
}

module.exports = { queueRequest };
