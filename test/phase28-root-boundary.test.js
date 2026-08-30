'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

test('the production client root ships only the Phase 28 application boundary',()=>{
  const source=fs.readFileSync(path.join(root,'app','dashboard-client.js'),'utf8');
  const dynamicImports=[...source.matchAll(/dynamic\(\(\)=>import\((['"])(.*?)\1\)/g)].map(match=>match[2]);
  assert.deepEqual(dynamicImports,['./_phase28/phase28-app.js']);
  assert.doesNotMatch(source,/legacy-dashboard-client|phase28-root-selection|selectPhase28Root/);
});

test('the Phase 28 root has no dependency on a legacy page center',()=>{
  const source=fs.readFileSync(path.join(root,'app','_phase28','phase28-app.js'),'utf8');
  assert.doesNotMatch(source,/legacy-dashboard|unified-orders|unified-customer|Phase28OrdersDashboard|Phase28CsDashboard/);
});

test('low frequency pages are split out of the initial Phase 28 client bundle',()=>{
  const source=fs.readFileSync(path.join(root,'app','_phase28','phase28-app.js'),'utf8');
  for(const file of ['diagnoses-page.js','changes-page.js','validation-page.js','experiments-page.js','knowledge-page.js']){
    assert.doesNotMatch(source,new RegExp(`import\\s+[^;]+from\\s+['\"]\\./pages/${file.replace('.','\\.')}['\"]`));
    assert.match(source,new RegExp(`dynamic\\(\\(\\)=>import\\(['\"]\\./pages/${file.replace('.','\\.')}['\"]\\)`));
  }
});
