'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const financialChanges = require('../lib/changes/financial-change.js');

function sellableProductDb() {
  return {
    from(table) {
      const chain = {
        select(){ return chain; },
        eq(){ return chain; },
        in(){ return Promise.resolve({ data:[{ external_product_no:'1', product_name:'작두콩차', price:12000, display:true, selling:true, raw_data:{ variants:[] } }], error:null }); },
        limit(){ return Promise.resolve({ data:[{ external_product_id:'1', is_active:true }], error:null }); }
      };
      if (!['channel_products','cafe24_products'].includes(table)) throw new Error(`unexpected table ${table}`);
      return chain;
    }
  };
}

test('product cost preview normalizes non-negative monetary values', async () => {
  const result = await financialChanges.normalizeRequest({
    type:'PRODUCT', master_product_id:'123e4567-e89b-12d3-a456-426614174000',
    unit_cost:'1200', packaging_cost:300, other_unit_cost:'0', notes:'  검증  '
  }, sellableProductDb());
  assert.equal(result.changeType, 'PRODUCT_COST');
  assert.deepEqual(result.proposed, {
    master_product_id:'123e4567-e89b-12d3-a456-426614174000',
    unit_cost:1200, packaging_cost:300, other_unit_cost:0, notes:'검증'
  });
});

test('channel percentage input is stored as a decimal rate', async () => {
  const result = await financialChanges.normalizeRequest({
    type:'CHANNEL', platform:'cafe24', commission_rate:'12.5', payment_fee_rate:3.3,
    default_shipping_cost:3500
  });
  assert.equal(result.proposed.commission_rate, 0.125);
  assert.equal(result.proposed.payment_fee_rate, 0.033);
  assert.equal(result.targetKey, 'CAFE24');
});

test('business target produces a month-start target key', async () => {
  const result = await financialChanges.normalizeRequest({
    type:'BUSINESS_TARGET', month:'2026-08', platform:'ALL',
    revenueTarget:10000000, adBudget:1000000, targetRoas:300
  });
  assert.equal(result.targetKey, '2026-08-01:ALL');
  assert.equal(result.proposed.target_month, '2026-08-01');
});

test('negative amounts and rates above 100 are rejected', async () => {
  await assert.rejects(() => financialChanges.normalizeRequest({ type:'CHANNEL', platform:'NAVER', commission_rate:101, payment_fee_rate:0, default_shipping_cost:0 }), /0~100/);
  await assert.rejects(() => financialChanges.normalizeRequest({ type:'PRODUCT', master_product_id:'123e4567-e89b-12d3-a456-426614174000', unit_cost:-1, packaging_cost:0, other_unit_cost:0 }), /0 이상의/);
});

test('impact preview records before, after, delta, and changed fields', () => {
  const preview = financialChanges.impactPreview(
    { exists:true, values:{ unit_cost:1000, notes:'이전' } },
    { unit_cost:1250, notes:'변경' }
  );
  assert.deepEqual(preview.changed_fields, ['unit_cost', 'notes']);
  assert.equal(preview.changes[0].delta, 250);
  assert.equal(preview.changes[0].change_rate, 0.25);
  assert.equal(preview.creates_new_record, false);
});

test('stable snapshot comparison ignores object key order', () => {
  assert.equal(financialChanges.same({ exists:true, values:{ a:1, b:2 } }, { values:{ b:2, a:1 }, exists:true }), true);
});

test('legacy monetary routes no longer write target tables directly', () => {
  const root = path.join(__dirname, '..');
  const costs = fs.readFileSync(path.join(root, 'app/api/costs/route.js'), 'utf8');
  const targets = fs.readFileSync(path.join(root, 'app/api/targets/route.js'), 'utf8');
  assert.doesNotMatch(costs, /\.from\(['"](?:product_costs|channel_cost_settings|channel_shipping_rules)['"]\)/);
  assert.doesNotMatch(targets, /saveTarget\s*\(/);
  assert.match(costs, /createPreview/);
  assert.match(targets, /createPreview/);
});

test('financial change tables are server-only and audit records are append-only', () => {
  const root = path.join(__dirname, '..', 'supabase', 'migrations');
  const schema = fs.readFileSync(path.join(root, '20260812161725_add_financial_change_safety.sql'), 'utf8');
  const hardening = fs.readFileSync(path.join(root, '20260812163003_restrict_financial_change_audit_privileges.sql'), 'utf8');
  assert.match(schema, /financial_change_requests enable row level security/i);
  assert.match(schema, /revoke all on public\.financial_change_requests, public\.financial_change_audit_logs from anon, authenticated/i);
  assert.match(hardening, /grant select, insert on public\.financial_change_audit_logs to service_role/i);
  assert.match(hardening, /on delete restrict/i);
  assert.doesNotMatch(hardening, /grant[^;]*update[^;]*financial_change_audit_logs/i);
});
