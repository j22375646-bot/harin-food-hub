'use strict';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDateKey(now = new Date()) {
  const kst = new Date(new Date(now).getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

function scheduledForKst(dateKey, hour, minute) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${dateKey}T${hh}:${mm}:00+09:00`).toISOString();
}

function cronExecution(jobName, { now = new Date(), hour = 0, minute = 0 } = {}) {
  const kstExecutionDate = kstDateKey(now);
  return {
    idempotencyKey: `${jobName}:KST:${kstExecutionDate}`,
    kstExecutionDate,
    scheduledFor: scheduledForKst(kstExecutionDate, hour, minute)
  };
}

module.exports = { KST_OFFSET_MS, kstDateKey, scheduledForKst, cronExecution };
