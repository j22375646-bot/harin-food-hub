'use strict';

const STATUSES = new Set(['PLANNED', 'ON_HOLD', 'EXECUTED', 'CANCELLED', 'REVIEWED']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function buildActionUpdate(body = {}, now = new Date()) {
  const values = { updated_at: now.toISOString() };
  let touched = false;

  if (has(body, 'status')) {
    if (!STATUSES.has(body.status)) throw validationError('허용되지 않은 액션 상태입니다.');
    values.status = body.status;
    values.hold_reason = body.status === 'ON_HOLD'
      ? String(body.hold_reason || '수동 보류').trim().slice(0, 500)
      : null;
    if (body.status === 'EXECUTED') values.executed_at = now.toISOString();
    touched = true;
  }

  if (has(body, 'priority')) {
    if (!PRIORITIES.has(body.priority)) throw validationError('허용되지 않은 우선순위입니다.');
    values.priority = body.priority;
    touched = true;
  }

  if (has(body, 'assignee')) {
    values.assignee = String(body.assignee || '').trim().slice(0, 100) || null;
    touched = true;
  }

  if (has(body, 'due_at')) {
    const dueAt = String(body.due_at || '').trim();
    if (dueAt && !validDate(dueAt)) throw validationError('기한은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
    values.due_at = dueAt || null;
    touched = true;
  }

  if (!touched) throw validationError('변경할 액션 정보가 없습니다.');
  return values;
}

module.exports = { buildActionUpdate, STATUSES, PRIORITIES };
