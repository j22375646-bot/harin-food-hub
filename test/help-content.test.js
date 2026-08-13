import test from 'node:test';
import assert from 'node:assert/strict';
import { COUPANG_SECTION_HELP, HUB_HELP_CONTENT, getHubHelp } from '../lib/ui/help-content.js';

test('every primary hub view has complete plain-language help', () => {
  const views = ['main', 'orders', 'cs', 'inventory', 'settlement', 'collection', 'insight', 'keyword', 'product', 'reports', 'changes', 'validation', 'experiments', 'notifications'];
  assert.deepEqual(Object.keys(HUB_HELP_CONTENT), views);
  for (const view of views) {
    const help = getHubHelp(view);
    for (const field of ['title', 'summary', 'meaning', 'when', 'example', 'action']) {
      assert.equal(typeof help[field], 'string');
      assert.ok(help[field].length >= 10, `${view}.${field} needs a useful explanation`);
    }
    assert.ok(Array.isArray(help.terms));
  }
});

test('every Coupang work section has its own example and next action', () => {
  assert.deepEqual(Object.keys(COUPANG_SECTION_HELP), ['SALES', 'INVENTORY', 'ORDERS', 'SETTLEMENT']);
  for (const help of Object.values(COUPANG_SECTION_HELP)) {
    assert.match(help.example, /[.가-힣]/);
    assert.ok(help.action.length >= 10);
  }
});
