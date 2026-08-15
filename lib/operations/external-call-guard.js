'use strict';

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

async function claim(db, { key, provider, operation, ttlSeconds = 120 } = {}) {
  if (!db || typeof db.rpc !== 'function') return true;
  const result = await db.rpc('claim_external_call_guard', {
    p_guard_key:clean(key, 240),
    p_provider:clean(provider, 80),
    p_operation:clean(operation, 120),
    p_ttl_seconds:Math.max(30, Math.min(Number(ttlSeconds) || 120, 3600))
  });
  if (result.error) throw result.error;
  return result.data === true;
}

async function complete(db, key, { status = 'SUCCESS', error = null, metadata = {} } = {}) {
  if (!db || typeof db.from !== 'function') return;
  const now = new Date().toISOString();
  const result = await db.from('external_call_guards').update({
    status:status === 'FAILED' ? 'FAILED' : 'SUCCESS', completed_at:now,
    error_message:error ? clean(error, 1000) : null,
    metadata:metadata && typeof metadata === 'object' ? metadata : {}, updated_at:now
  }).eq('guard_key', clean(key, 240));
  if (result.error) throw result.error;
}

module.exports = { claim, complete };
