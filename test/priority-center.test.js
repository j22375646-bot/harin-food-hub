'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const priority = require('../lib/actions/priority-center.js');

const readyTrust = {
  status:'READY',
  allowed:{ allowed_cpc:true, bid_increase:true },
  reasons:[]
};
const blockedTrust = {
  status:'BLOCKED',
  allowed:{ allowed_cpc:false, bid_increase:false },
  reasons:[{ message:'원가 반영률이 기준에 미달합니다.', remediation:'상품 원가를 입력하세요.' }]
};
const now = new Date('2026-08-13T03:00:00.000Z');

test('금액 관련 액션은 재무 신뢰가 막히면 실행할 수 없다', () => {
  const action = { id:'a1', action_type:'LOWER_BID', status:'PLANNED', priority:'HIGH' };
  const decision = priority.actionDecision(action, blockedTrust, now);
  assert.equal(decision.decision_status, 'BLOCKED');
  assert.equal(decision.can_execute, false);
  assert.match(decision.blocked_reasons[0], /상품 원가/);
  assert.throws(() => priority.assertActionExecutionAllowed(action, null), error => error.code === 'FINANCIAL_TRUST_BLOCKED' && error.statusCode === 409);
  assert.equal(priority.assertActionExecutionAllowed(action, { financial_actions:true }), true);
});

test('운영 DB의 예산·손익분기 액션 유형도 재무 액션으로 분류한다', () => {
  for (const actionType of ['OPTIMIZE_ROAS', 'REDUCE_BUDGET', 'CALCULATE_BEP', 'PAUSE']) {
    assert.equal(priority.requiresFinancialTrust({ action_type:actionType }), true);
  }
});

test('수집·전환 점검 액션은 재무 신뢰와 무관하게 실행 가능하다', () => {
  for (const actionType of ['COLLECT_MORE_DATA', 'REVIEW_CONVERSION']) {
    const decision = priority.actionDecision({ action_type:actionType, status:'PLANNED' }, blockedTrust, now);
    assert.equal(decision.decision_status, 'READY');
    assert.equal(decision.can_execute, true);
    assert.equal(priority.assertActionExecutionAllowed({ action_type:actionType }, null), true);
  }
});

test('재무 복구와 오류를 일반 액션보다 먼저 정렬한다', () => {
  const center = priority.buildPriorityCenter({
    financialTrust:blockedTrust,
    actions:[{ id:'a1', platform:'NAVER', action_type:'REVIEW_CONVERSION', target_name:'전환율', reason:'점검', status:'PLANNED', priority:'LOW' }],
    alerts:[{ id:'e1', platform:'COUPANG', severity:'ERROR', title:'수집 실패', message:'인증 확인' }],
    now
  });
  assert.deepEqual(center.items.slice(0, 2).map(item => item.source), ['TRUST_GATE', 'ALERT']);
  assert.equal(center.status, 'ATTENTION');
  assert.equal(center.summary.blocked, 1);
});

test('기한 초과 액션과 QA·페이싱 위험을 하나의 우선순위에 포함한다', () => {
  const center = priority.buildPriorityCenter({
    financialTrust:readyTrust,
    actions:[{ id:'late', platform:'CAFE24', action_type:'REVIEW_CONVERSION', target_name:'전환', reason:'점검', status:'PLANNED', priority:'HIGH', due_at:'2026-08-10' }],
    qualityChecks:[
      { id:'q1', platform:'NAVER', dataset:'stats', status_code:'MISSING', severity:'WARNING', message:'일자 누락', remediation:'재수집' },
      { id:'q0', platform:'NAVER', dataset:'stats', status_code:'PASS', severity:'INFO', message:'과거 정상' }
    ],
    pacing:{ items:[{ platform:'ALL', status:'AT_RISK', forecastRevenueGap:-100000, forecastBudgetGap:0 }] },
    now
  });
  const late = center.items.find(item => item.id === 'ACTION:late');
  assert.equal(late.decision_status, 'READY');
  assert.match(late.next_step, /기한/);
  assert.ok(center.items.some(item => item.source === 'DATA_QUALITY'));
  assert.ok(center.items.some(item => item.source === 'PACING'));
});
