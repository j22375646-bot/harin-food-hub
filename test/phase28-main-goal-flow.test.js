const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

test('Phase 28 Main goal control uses the audited one-confirmation write flow and refreshes data',()=>{
  const page=fs.readFileSync(path.join(root,'app/_phase28/pages/home-page.js'),'utf8');
  const app=fs.readFileSync(path.join(root,'app/_phase28/phase28-app.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'app/_phase28/pages/home-page.module.css'),'utf8');
  assert.match(page,/fetch\('\/api\/targets'/);
  assert.match(page,/action:'CONFIRM_EXECUTE',confirm:true/);
  assert.match(page,/onGoalSaved/);
  assert.match(app,/onRefresh=\{\(\)=>router\.refresh\(\)\}/);
  assert.match(css,/\.goalControl\{/);
  assert.doesNotMatch(css,/\.goalRunway\{/);
});
