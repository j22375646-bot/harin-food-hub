'use strict';

const operationQueue = require('../coupang/operation-queue.js');
const parcel = require('../epost/parcel.js');

const TRANSFER_TYPES = new Set(['UPLOAD_INVOICE', 'CAFE24_UPLOAD_INVOICE']);

function decrypt(value) {
  if (!value || value.v !== 1) return {};
  try { return operationQueue.open(value); } catch { return {}; }
}

function minuteKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function buildShippingQa(rows = [], { now = new Date() } = {}) {
  const normalized = rows.map(row => ({ ...row, payloadData:decrypt(row.payload), resultData:decrypt(row.result_json) }));
  const tracking = normalized.filter(row => row.operation_type === 'EPOST_TRACKING' && row.status === 'SUCCESS');
  const transfers = normalized.filter(row => TRANSFER_TYPES.has(row.operation_type));
  const testIssues = normalized.filter(row => row.operation_type === 'EPOST_TEST_ISSUE');

  const trackingGroups = new Map();
  tracking.forEach(row => {
    const key = minuteKey(row.executed_at || row.created_at);
    if (!key) return;
    trackingGroups.set(key, (trackingGroups.get(key) || 0) + 1);
  });
  const largestBatch = Math.max(0, ...trackingGroups.values());
  const trackingResult = row => row.resultData.epostTracking || row.resultData.tracking || row.resultData;
  const delivered = tracking.filter(row => trackingResult(row).statusCode === 'DELIVERED').length;
  const inTransit = tracking.filter(row => trackingResult(row).statusCode === 'IN_TRANSIT').length;

  const keys = normalized.map(row => row.idempotency_key).filter(Boolean);
  const duplicateKeys = keys.length - new Set(keys).size;
  const active = normalized.filter(row => ['PENDING','RUNNING'].includes(row.status));
  const activeTargets = active.map(row => `${row.operation_type}:${row.target_type}:${row.target_id}`);
  const duplicateActive = activeTargets.length - new Set(activeTargets).size;

  const latestTransfer = new Map();
  transfers.forEach(row => {
    const key = `${row.operation_type}:${row.target_id}`;
    if (!latestTransfer.has(key)) latestTransfer.set(key, row);
  });
  const unresolved = [...latestTransfer.values()].filter(row => row.status === 'FAILED').length;
  const recovered = [...latestTransfer.values()].filter(row => row.status === 'SUCCESS' && Number(row.attempt_count || 0) > 1).length;

  const invalidAddress = parcel.validateTestShipment({
    hubOrderId:'HR-C24-00000000', platform:'CAFE24', goodsName:'검수 상품', receiver:{ name:'', postCode:'', address:'', addressDetail:'', contact:'' }
  });
  const addressGuarded = !invalidAddress.ok && invalidAddress.errors.length >= 5;
  const actualEvidence = tracking.length + transfers.filter(row => row.status === 'SUCCESS').length;

  const checks = [
    {
      id:'single_order', status:actualEvidence > 0 ? 'PASS' : 'WAIT', title:'실제 주문 1건 흐름',
      detail:actualEvidence > 0 ? `실제 운영 이력 ${actualEvidence}건에서 송장 전송 또는 배송추적 결과를 확인했습니다.` : '실제 송장 전송 또는 배송추적 성공 이력이 생기면 자동 통과합니다.'
    },
    {
      id:'batch', status:largestBatch >= 3 ? 'PASS' : 'WAIT', title:'3~5건 일괄 처리',
      detail:largestBatch >= 3 ? `한 번의 작업 구간에서 최대 ${largestBatch}건을 함께 처리했습니다.` : '같은 작업 구간의 3건 이상 처리 이력이 아직 없습니다.'
    },
    {
      id:'duplicate', status:duplicateKeys === 0 && duplicateActive === 0 ? 'PASS' : 'WARN', title:'중복 클릭 차단',
      detail:duplicateKeys === 0 && duplicateActive === 0 ? '같은 작업키와 같은 주문의 동시 실행 중복이 없습니다.' : `중복 작업키 ${duplicateKeys}건 · 동시 중복 ${duplicateActive}건을 확인해야 합니다.`
    },
    {
      id:'address', status:addressGuarded ? 'PASS' : 'WARN', title:'주소 오류 차단',
      detail:addressGuarded ? '이름·우편번호·주소·상세주소·연락처가 빠지면 발급 전에 차단됩니다.' : '주소 필수값 차단 규칙을 다시 확인해야 합니다.'
    },
    {
      id:'recovery', status:unresolved === 0 ? 'PASS' : 'WARN', title:'채널 실패 복구',
      detail:unresolved === 0 ? `미복구 채널 실패가 없습니다.${recovered ? ` 재시도 복구 ${recovered}건.` : ''}` : `최근 채널 전송 실패 ${unresolved}건은 송장번호를 유지한 채 채널만 재시도해야 합니다.`
    },
    {
      id:'tracking', status:delivered + inTransit > 0 ? 'PASS' : 'WAIT', title:'배송상태 자동 반영',
      detail:delivered + inTransit > 0 ? `배송중 ${inTransit}건 · 배달완료 ${delivered}건이 주문 단계에 반영됩니다.` : '우체국 배송추적 성공 이력이 생기면 자동 통과합니다.'
    }
  ];
  const passed = checks.filter(check => check.status === 'PASS').length;
  const warnings = checks.filter(check => check.status === 'WARN').length;
  return {
    phase:'11-3F', checkedAt:new Date(now).toISOString(),
    summary:{ passed, total:checks.length, warnings, waiting:checks.length-passed-warnings, testIssues:testIssues.length },
    checks
  };
}

module.exports = { buildShippingQa, decrypt, minuteKey };
