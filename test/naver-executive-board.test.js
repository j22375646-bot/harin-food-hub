const test = require('node:test');
const assert = require('node:assert/strict');
const boardModule = require('../lib/marketing/naver-executive-board.js');

const currentAds = [{ date:'2026-08-13', impressions:1000, clicks:50, cost:100000, conversions:5, conversion_revenue:200000 }];
const previousAds = [{ date:'2026-08-06', impressions:1000, clicks:50, cost:80000, conversions:10, conversion_revenue:240000 }];

function build(overrides = {}) {
  return boardModule.buildNaverExecutiveBoard({
    currentAdRows:currentAds,
    previousAdRows:previousAds,
    cafe24Orders:[
      { order_id:'C1', order_date:'2026-08-10T00:00:00Z', customer_id:'owner-1', paid_amount:100000, raw_data:{ market_id:'SELF' } },
      { order_id:'C-NPAY', order_date:'2026-08-12T00:00:00Z', customer_id:null, paid_amount:39000, raw_data:{ market_id:'NCHECKOUT', order_place_id:'NCHECKOUT' } },
      { order_id:'MIRROR', order_date:'2026-08-10T00:00:00Z', customer_id:null, paid_amount:999999, raw_data:{ market_id:'NAVER' } }
    ],
    naverOrders:[{ order_id:'N1', payment_date:'2026-08-11T00:00:00Z', paid_amount:200000 }],
    naverSettlements:[{ settlement_key:'S1', settle_basis_start_date:'2026-08-07', settle_basis_end_date:'2026-08-13', settle_amount:180000 }],
    profitability:{ contribution_profit:30000, cost_coverage_rate:100 },
    productAdTargets:{ items:[{ status:'READY', allowable_cpc:1500 }] },
    searchTermCenter:{ items:[{ recommended_action:'NEGATIVE_REVIEW', action_status:'PENDING', cost:12000 }] },
    periodStart:'2026-08-07', periodEnd:'2026-08-13', targetRoas:250, asOf:'2026-08-14T00:00:00+09:00',
    ...overrides
  });
}

test('광고 ROAS와 실제 주문 기반 MER를 분리하고 오픈마켓 미러 주문을 제외한다', () => {
  const board = build();
  const adRoas = board.metrics.find(item => item.key === 'AD_ROAS');
  const mer = board.metrics.find(item => item.key === 'MER');
  assert.equal(adRoas.value, 200);
  assert.equal(mer.value, 339);
  assert.equal(board.actuals.confirmed_net_sales, 339000);
  assert.equal(board.actuals.direct_cafe24_orders, 2);
});

test('광고 주문과 정산의 연결키가 없으면 정산 ROAS를 계산하지 않는다', () => {
  const board = build();
  const settlement = board.metrics.find(item => item.key === 'SETTLEMENT_ROAS');
  assert.equal(settlement.value, null);
  assert.equal(settlement.status, 'BLOCKED');
  assert.match(settlement.reason, /주문키/);
  assert.equal(board.data_trust.settlement_linked, false);
});

test('원가 근거가 없으면 공헌이익을 0원이 아닌 확인 필요로 표시한다', () => {
  const board = build({ profitability:{ contribution_profit:null, cost_coverage_rate:25 } });
  const contribution = board.metrics.find(item => item.key === 'CONTRIBUTION');
  assert.equal(contribution.value, null);
  assert.equal(contribution.status, 'BLOCKED');
  assert.equal(board.stages.find(item => item.key === 'PROFIT').status, 'BLOCKED');
});

test('전환율 급락을 최우선 병목으로 고르고 세 가지 목표 손잡이를 만든다', () => {
  const board = build();
  assert.equal(board.bottleneck.key, 'PURCHASE');
  assert.equal(board.levers.length, 3);
  assert.equal(board.levers.find(item => item.key === 'CPC').target, 1500);
});

test('예산 이동은 제외 후보의 읽기 전용 미리보기만 계산한다', () => {
  const board = build();
  assert.equal(board.budget_preview.saved_spend, 12000);
  assert.equal(board.budget_preview.required_revenue, 30000);
  assert.match(board.budget_preview.note, /변경하지 않습니다/);
});
