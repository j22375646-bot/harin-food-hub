'use strict';

const FINANCIAL_ACTION_TYPES = new Set([
  'LOWER_BID',
  'RAISE_BID',
  'KEEP_BID',
  'OPTIMIZE_ROAS',
  'ADJUST_BUDGET',
  'REDUCE_BUDGET',
  'PAUSE_CAMPAIGN',
  'PAUSE',
  'CALCULATE_BEP',
  'CHANGE_BID',
  'CHANGE_BUDGET'
]);

const TERMINAL_STATUSES = new Set(['EXECUTED', 'CANCELLED', 'REVIEWED']);
const PRIORITY_SCORE = { URGENT: 180, HIGH: 130, MEDIUM: 80, LOW: 30 };
const SEVERITY_SCORE = { ERROR: 920, WARNING: 760, INFO: 430 };

function kstDate(now = new Date()) {
  return new Date(new Date(now).getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

function requiresFinancialTrust(action = {}) {
  const type = String(action.action_type || '').toUpperCase();
  return FINANCIAL_ACTION_TYPES.has(type) || /(BID|ROAS|BUDGET|BEP|CPC)/.test(type);
}

function financialActionsAllowed(trust = {}) {
  return trust.status === 'READY'
    && trust.allowed?.allowed_cpc === true
    && trust.allowed?.bid_increase === true;
}

function blockedReasons(trust = {}) {
  const reasons = (trust.reasons || []).map(item => item.remediation || item.message || item.label).filter(Boolean);
  return reasons.length ? reasons : ['원가 반영률과 광고비 귀속 상태를 먼저 확인하세요.'];
}

function actionDecision(action = {}, trust = {}, now = new Date()) {
  const status = String(action.status || 'PLANNED').toUpperCase();
  const financial = requiresFinancialTrust(action);
  const overdue = Boolean(action.due_at && action.due_at < kstDate(now) && !TERMINAL_STATUSES.has(status));
  let decisionStatus = 'READY';
  let canExecute = status === 'PLANNED';
  let reasons = [];

  if (TERMINAL_STATUSES.has(status)) {
    decisionStatus = 'COMPLETED';
    canExecute = false;
  } else if (status === 'ON_HOLD') {
    decisionStatus = 'ON_HOLD';
    canExecute = false;
    reasons = [action.hold_reason || '운영자가 보류한 액션입니다.'];
  } else if (financial && !financialActionsAllowed(trust)) {
    decisionStatus = 'BLOCKED';
    canExecute = false;
    reasons = blockedReasons(trust);
  }

  return {
    requires_financial_trust: financial,
    decision_status: decisionStatus,
    can_execute: canExecute,
    overdue,
    blocked_reasons: reasons
  };
}

function enrichActions(actions = [], trust = {}, now = new Date()) {
  return actions.map(action => ({ ...action, ...actionDecision(action, trust, now) }));
}

function assertActionExecutionAllowed(action = {}, trustClaim) {
  if (!requiresFinancialTrust(action)) return true;
  if (trustClaim?.financial_actions === true) return true;
  const error = new Error('재무 신뢰 기준을 통과하기 전에는 금액 관련 액션을 완료할 수 없습니다. 상품 원가와 광고비 귀속을 먼저 확인하세요.');
  error.statusCode = 409;
  error.code = 'FINANCIAL_TRUST_BLOCKED';
  throw error;
}

function actionItem(action, now) {
  const state = action.decision_status ? action : { ...action, ...actionDecision(action, {}, now) };
  const overdueBoost = state.overdue ? 120 : 0;
  const blockedBoost = state.decision_status === 'BLOCKED' ? 90 : 0;
  const statusPenalty = state.decision_status === 'COMPLETED' ? 1000 : 0;
  return {
    id: `ACTION:${state.id}`,
    source: 'ACTION',
    source_id: state.id,
    platform: state.platform || 'ALL',
    title: state.target_name || state.action_type || '실행결정 확인',
    reason: state.reason || '등록된 실행결정을 확인하세요.',
    next_step: state.decision_status === 'BLOCKED'
      ? state.blocked_reasons[0]
      : state.overdue ? '기한이 지났습니다. 오늘 실행하거나 보류 사유를 기록하세요.' : '실행 후 완료 처리하고 효과평가를 기다리세요.',
    decision_status: state.decision_status,
    can_execute: state.can_execute,
    action_id: state.id,
    view: 'reports',
    score: 540 + (PRIORITY_SCORE[state.priority] || PRIORITY_SCORE.MEDIUM) + overdueBoost + blockedBoost - statusPenalty
  };
}

function financialTrustItem(trust = {}) {
  if (trust.status !== 'BLOCKED') return null;
  const reasons = trust.reasons || [];
  return {
    id: 'FINANCIAL_TRUST',
    source: 'TRUST_GATE',
    platform: 'ALL',
    title: '재무 신뢰 게이트 복구',
    reason: reasons.map(item => item.message || item.label).filter(Boolean).join(' ') || '원가와 광고비 귀속 상태를 확인해야 합니다.',
    next_step: reasons[0]?.remediation || '상품 허브에서 원가와 상품 매핑을 확인하세요.',
    decision_status: 'BLOCKED',
    can_execute: false,
    view: 'product',
    score: 1000
  };
}

function alertItem(alert = {}) {
  const severity = String(alert.severity || 'INFO').toUpperCase();
  return {
    id: `ALERT:${alert.id}`,
    source: 'ALERT',
    source_id: alert.id,
    platform: alert.platform || 'ALL',
    title: alert.title || '열린 운영 알림',
    reason: alert.message || '열린 알림을 확인하세요.',
    next_step: severity === 'ERROR' ? '원인을 확인하고 해결 또는 확인 처리하세요.' : '영향 범위를 확인하고 처리 상태를 기록하세요.',
    decision_status: 'READY',
    can_execute: true,
    view: 'notifications',
    score: SEVERITY_SCORE[severity] || SEVERITY_SCORE.INFO
  };
}

function qualityItem(check = {}) {
  const severity = String(check.severity || 'INFO').toUpperCase();
  return {
    id: `QUALITY:${check.id}`,
    source: 'DATA_QUALITY',
    source_id: check.id,
    platform: check.platform || 'ALL',
    title: `${check.platform || 'ALL'} · ${check.dataset || '데이터'} 품질 점검`,
    reason: check.message || check.status_code || '데이터 품질 상태를 확인하세요.',
    next_step: check.remediation || '데이터를 다시 수집한 뒤 품질 검사를 실행하세요.',
    decision_status: 'READY',
    can_execute: true,
    view: 'collection',
    score: (SEVERITY_SCORE[severity] || SEVERITY_SCORE.INFO) - 70
  };
}

function pacingItem(item = {}) {
  const risk = item.status === 'AT_RISK';
  return {
    id: `PACING:${item.platform}`,
    source: 'PACING',
    platform: item.platform || 'ALL',
    title: `${item.platform || '전체'} 월 목표 ${risk ? '위험' : '속도 점검'}`,
    reason: item.forecastRevenueGap != null && item.forecastRevenueGap < 0
      ? `월말 예상 매출이 목표보다 ${Math.abs(Math.round(item.forecastRevenueGap)).toLocaleString('ko-KR')}원 부족합니다.`
      : item.forecastBudgetGap != null && item.forecastBudgetGap < 0
        ? `월말 예상 광고비가 예산보다 ${Math.abs(Math.round(item.forecastBudgetGap)).toLocaleString('ko-KR')}원 많습니다.`
        : '현재 매출·광고비 속도가 월 목표 범위를 벗어날 수 있습니다.',
    next_step: '페이싱 상세에서 남은 날의 일매출·권장 광고비를 확인하세요.',
    decision_status: 'READY',
    can_execute: true,
    view: 'main',
    score: risk ? 710 : 560
  };
}

function buildPriorityCenter({ actions = [], alerts = [], qualityChecks = [], pacing = {}, financialTrust = {}, now = new Date() } = {}) {
  const enrichedActions = enrichActions(actions, financialTrust, now);
  const latestQuality = [];
  const seenQuality = new Set();
  for (const check of qualityChecks) {
    const key = `${check.platform}:${check.dataset}`;
    if (seenQuality.has(key)) continue;
    seenQuality.add(key);
    if (String(check.severity || '').toUpperCase() !== 'INFO' || !['PASS', 'OK', 'READY'].includes(String(check.status_code || '').toUpperCase())) latestQuality.push(check);
  }

  const items = [
    financialTrustItem(financialTrust),
    ...alerts.map(alertItem),
    ...latestQuality.map(qualityItem),
    ...enrichedActions.filter(action => !TERMINAL_STATUSES.has(String(action.status || '').toUpperCase())).map(action => actionItem(action, now)),
    ...(pacing.items || []).filter(item => ['AT_RISK', 'WATCH'].includes(item.status)).map(pacingItem)
  ].filter(Boolean).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const blocked = items.filter(item => item.decision_status === 'BLOCKED').length;
  const ready = items.filter(item => item.decision_status === 'READY').length;
  return {
    generated_at: new Date(now).toISOString(),
    status: blocked || alerts.some(item => item.severity === 'ERROR') ? 'ATTENTION' : 'READY',
    summary: { total: items.length, blocked, ready },
    items
  };
}

module.exports = {
  FINANCIAL_ACTION_TYPES,
  requiresFinancialTrust,
  financialActionsAllowed,
  actionDecision,
  enrichActions,
  assertActionExecutionAllowed,
  buildPriorityCenter
};
