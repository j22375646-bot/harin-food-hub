'use strict';

const ACTIVE_STATUSES = ['PENDING', 'RUNNING'];

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isStale(row, now, staleAfterMs) {
  if (!row || !Number.isFinite(staleAfterMs) || staleAfterMs <= 0) return false;
  const requestedAt = validDate(row.requested_at);
  return Boolean(requestedAt && now.getTime() - requestedAt.getTime() >= staleAfterMs);
}

async function queueRequest(db, requestType = 'FULL', options = {}) {
  const now = validDate(options.now) || new Date();
  const staleAfterMs = Number(options.staleAfterMs);
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
    .in('status', ACTIVE_STATUSES)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data && !isStale(existing.data, now, staleAfterMs)) {
    return { queued: true, existing: true, request: existing.data };
  }
  if (existing.data) {
    const expired = await db.from('coupang_sync_requests')
      .update({
        status: 'FAILED',
        finished_at: now.toISOString(),
        dead_lettered_at: now.toISOString(),
        error_message: '고정 IP 워커 응답 없이 대기 시간이 초과되어 새 요청으로 교체했습니다.'
      })
      .eq('id', existing.data.id)
      .in('status', ACTIVE_STATUSES)
      .select('id,request_type,status,requested_at')
      .maybeSingle();
    if (expired.error) throw expired.error;
  }

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

module.exports = { ACTIVE_STATUSES, queueRequest };
