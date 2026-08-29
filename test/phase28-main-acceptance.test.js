'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Phase 28 Main acceptance records same-address activation and rollback',()=>{
  const text=fs.readFileSync(path.join(__dirname,'..','docs','PHASE28_MAIN_ACCEPTANCE.md'),'utf8');
  assert.match(text,/HARIN_PHASE28_ENABLED=true/);
  assert.match(text,/HARIN_PHASE28_PAGES=home/);
  assert.match(text,/HARIN_PHASE28_ENABLED=false/);
  assert.match(text,/`\/` 주소를 유지/);
  assert.match(text,/pnpm verify:phase28-main/);
  assert.match(text,/cutover.*BLOCKED/i);
});
