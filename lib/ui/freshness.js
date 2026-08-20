'use strict';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function relativeFreshnessLabel(value, now = new Date()) {
  if (!value) return '갱신 기록 없음';
  const at = new Date(value);
  const current = new Date(now);
  if (Number.isNaN(at.getTime()) || Number.isNaN(current.getTime())) return '시각 확인 필요';
  const elapsed = Math.max(0, current.getTime() - at.getTime());
  if (elapsed < MINUTE_MS) return '방금 전';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}분 전`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}시간 전`;
  return `${Math.floor(elapsed / DAY_MS)}일 전`;
}

module.exports = { DAY_MS, HOUR_MS, MINUTE_MS, relativeFreshnessLabel };
