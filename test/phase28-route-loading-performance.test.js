'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('dashboard route loads only the adapter requested by the active page',()=>{
  const source=read('app/dashboard-route.js');
  assert.doesNotMatch(source,/import phase28AdaptersModule from ['"]\.\.\/lib\/ui\/phase28-adapters\/index\.js['"]/);
  assert.match(source,/async function loadPhase28Adapter/);
  assert.match(source,/import\(['"]\.\.\/lib\/ui\/phase28-adapters\/orders\.js['"]\)/);
  assert.match(source,/await loadPhase28Adapter\('orders'\)/);
});

test('phase28 runtime reads the adapter manifest without evaluating every adapter',()=>{
  const source=read('lib/ui/phase28-production-runtime.js');
  assert.match(source,/phase28-adapters\/manifest\.js/);
  assert.doesNotMatch(source,/phase28-adapters\/index\.js/);
});

test('dedicated low-frequency pages do not eagerly load the generic dashboard route or adapter barrel',()=>{
  for(const file of ['app/ai-knowledge/page.js','app/approvals/page.js','app/ab-tests/page.js','app/diagnoses/page.js','app/execution-validation/page.js','app/notifications/page.js','app/data-collection/page.js']){
    const source=read(file);
    assert.doesNotMatch(source,/^import \{renderDashboardRoute\}/m,`${file} eagerly imports the generic dashboard`);
    assert.doesNotMatch(source,/phase28-adapters\/index\.js/,`${file} eagerly imports every adapter`);
  }
});

