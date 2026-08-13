'use strict';

const ACTIVE = new Set(['PENDING', 'RUNNING']);
const minutesBetween = (start, end) => Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));

function buildCoupangQueueHealth({ requests = [], now = new Date(), longRunningMinutes = 20 } = {}) {
  const current = new Date(now);
  const items = requests.map(request => {
    const ageMinutes = request.requested_at ? minutesBetween(request.requested_at, current) : 0;
    const retryWaiting = request.status === 'PENDING' && Number(request.attempt_count || 0) > 0;
    const longRunning = ACTIVE.has(request.status) && ageMinutes >= longRunningMinutes;
    const terminalFailure = request.status === 'FAILED';
    return {
      id:request.id,
      requestType:request.request_type,
      status:retryWaiting ? 'RETRY_WAIT' : request.status,
      requestedAt:request.requested_at,
      startedAt:request.started_at,
      finishedAt:request.finished_at,
      nextAttemptAt:request.next_attempt_at,
      attemptCount:Number(request.attempt_count || 0),
      ageMinutes,
      longRunning,
      terminalFailure,
      errorMessage:request.error_message || null
    };
  });
  return {
    pending:items.filter(item => item.status === 'PENDING').length,
    running:items.filter(item => item.status === 'RUNNING').length,
    retryWaiting:items.filter(item => item.status === 'RETRY_WAIT').length,
    failed:items.filter(item => item.terminalFailure).length,
    longFailures:items.filter(item => item.terminalFailure || item.longRunning),
    recent:items.slice(0, 20)
  };
}

module.exports = { buildCoupangQueueHealth };
