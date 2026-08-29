'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

test('application root selection never mixes legacy and Phase 28',()=>{
  const {selectPhase28Root}=require('../lib/ui/phase28-root-selection.js');
  assert.equal(selectPhase28Root('legacy'),'legacy');
  assert.equal(selectPhase28Root('preview'),'phase28');
  assert.equal(selectPhase28Root('full'),'phase28');
  assert.equal(selectPhase28Root('unknown'),'legacy');
});

test('the Phase 28 root has no dependency on a legacy page center',()=>{
  const source=fs.readFileSync(path.join(root,'app','_phase28','phase28-app.js'),'utf8');
  assert.doesNotMatch(source,/legacy-dashboard|unified-orders|unified-customer|Phase28OrdersDashboard|Phase28CsDashboard/);
});
