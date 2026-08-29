'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Phase 28 foundation records disabled defaults, verification, and rollback', () => {
  const text = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'PHASE28_FOUNDATION_ACCEPTANCE.md'),
    'utf8',
  );

  assert.match(text, /HARIN_PHASE28_ENABLED=false/);
  assert.match(text, /HARIN_PHASE28_PAGES=/);
  assert.match(text, /pnpm verify:phase28-foundation/);
  assert.match(text, /pnpm test/);
  assert.match(text, /pnpm build/);
  assert.match(text, /cutover.*BLOCKED/i);
});
