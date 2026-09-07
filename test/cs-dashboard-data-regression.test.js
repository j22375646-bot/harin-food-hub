'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loaders = require('../lib/dashboard/page-loader-profiles.js');
const summary = require('../lib/customer-service/operation-summary.js');
const center = require('../lib/customer-service/unified-center.js');
const thread = require('../lib/coupang/inquiry-thread.js');
const mapper = require('../lib/coupang/mappers.js');

// Exercise the actual server builders without loading Next's request-bound cookies/headers.
function builder(name, nextName, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '../app/dashboard-route.js'), 'utf8');
  const code = source.slice(source.indexOf(`async function ${name}(`), source.indexOf(`async function ${nextName}(`));
  return Function(...Object.keys(dependencies), `${code}; return ${name};`)(...Object.values(dependencies));
}

const shell = { channelConnections: { channels: [] }, syncs: [], alerts: [], dataHealth: {}, collectionCenter: {} };
const empty = { data: [] };
function inputs(extra = {}) {
  return {
    loaderSession: { snapshot: () => ({}) }, generatedAt: '2026-09-07T07:00:00Z', queryIssues: [],
    syncResult: empty, alertsResult: empty, ordersResult: empty, itemsResult: empty,
    coupangOrdersResult: empty, coupangOrderTerminalsResult: empty, coupangItemsResult: empty,
    coupangReturnsResult: empty, coupangExchangesResult: empty, coupangInquiriesResult: empty,
    coupangInventoryResult: empty, coupangRgOrdersResult: empty,
    naverCommerceOrdersResult: empty, naverCommerceItemsResult: empty,
    businessTargetsResult: empty, monthlyRevenueResult: {}, customerServiceRows: [],
    customerServiceAvailable: true, reportsResult: empty, ...extra
  };
}

function mainBuilder() {
  return builder('buildMainDashboardData', 'buildInventoryDashboardData', {
    number: value => Number(value || 0), buildFocusedShellData: async () => shell,
    coupangOperationalInventoryModule: { splitOperationalInventory: () => ({ active: [], excluded: [] }), buildOperationalInventoryCenter: () => ({}) },
    coupangMarketingModule: { buildInventoryMarketing: () => ({ items: [], summary: {} }) },
    unifiedOrdersModule: { buildUnifiedOrders: () => ({ summary: { total: 0 } }) },
    mainSalesHistoryModule: { buildMainSalesHistory: () => ({}) },
    customerServiceOperationModule: summary,
    buildMainPacing: () => ({ items: [] }), priorityCenterModule: { buildPriorityCenter: () => ({}) },
    salesCommandCenterModule: { buildSalesCommandCenter: () => ({}) }
  });
}

test('legacy Main includes Coupang inquiries and exchanges in its scoped DB profile', () => {
  const profile = loaders.profileForState({ view: 'main' });
  assert.equal(profile.tables.includes('coupang_inquiries'), true);
  assert.equal(profile.tables.includes('coupang_exchanges'), true);
});

test('legacy Main counts Coupang alongside channel CS but keeps provider inquiry counts separate', async () => {
  const data = await mainBuilder()(inputs({
    coupangInquiriesResult: { data: [{ inquiry_key: 'CALL_CENTER:7', inquiry_id: '7', answered: false }] },
    coupangExchangesResult: { data: [{ exchange_id: '8', status: 'RECEIPT' }] },
    customerServiceRows: [{ source_key: 'NAVER:INQUIRY:9', platform: 'NAVER', kind: 'INQUIRY', completed: false }]
  }));
  assert.equal(data.customerService.summary.active, 3);
  assert.equal(data.coupang.unansweredInquiries, 1);
});

test('legacy Main cannot turn a failed CS query into a verified zero', async () => {
  const data = await mainBuilder()(inputs({ customerServiceAvailable: false, coupangInquiriesResult: { data: [], unavailable: true } }));
  assert.equal(data.customerService.summary.active, null);
  assert.equal(data.coupang.unansweredInquiries, null);
});

test('CS server builder decrypts only the owner-facing inquiry content and strips raw envelopes', async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'cs-dashboard-fixture-secret';
  try {
    const row = mapper.mapInquiry({ inquiryId: 7, inquiryStatus: 'progress', csPartnerCounselingStatus: 'requestAnswer', content: '상담이력',
      replies: [{ answerId: 81, answerType: 'csAgent', partnerTransferStatus: 'requestAnswer', needAnswer: true, content: '회수 일정 확인 요청' }]
    }, 'CALL_CENTER');
    const build = builder('buildCsDashboardData', 'buildReportsDashboardData', {
      buildFocusedShellData: async () => shell, unifiedCustomerServiceModule: center,
      coupangInquiryThreadModule: thread, returnCaseView: value => value, exchangeCaseView: value => value,
      aiPagePanelsModule: { buildAiPagePanels: () => ({ cs: {} }) }, openaiClientModule: { configuration: () => ({}) },
      kstScheduleModule: { kstDateKey: () => '2026-09-07' }, finalizeAiPagePanels: value => value
    });
    const data = await build(inputs({ coupangInquiriesResult: { data: [row] }, channelCsItems: [], csOperationAudits: [] }));
    assert.equal(data.customerService.active[0].content, '회수 일정 확인 요청');
    assert.equal(data.customerService.active[0].source.parent_answer_id, '81');
    assert.equal(JSON.stringify(data).includes('cs_thread_encrypted'), false);
    assert.equal(JSON.stringify(data).includes('cs-dashboard-fixture-secret'), false);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});
