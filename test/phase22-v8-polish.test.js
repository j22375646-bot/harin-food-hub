'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('22-7 replaces reliability text symbols with shared semantic pictograms',()=>{
  const workbench=read('app/_reliability/harin-reliability-workbench.js');
  const dock=read('app/_reliability/harin-live-status-dock.js');
  const icons=read('app/_design-system/harin-icon.js');
  assert.match(workbench,/import HarinIcon from '..\/_design-system\/harin-icon\.js'/);
  assert.match(workbench,/const PLATFORM_ICON=\{NAVER:'naverStore',COUPANG:'shoppingBag',CAFE24:'store',EPOST:'truck',ALL:'database'\}/);
  assert.match(workbench,/<HarinIcon name=\{exceptionIcon\(item\.kind\)\}/);
  assert.match(dock,/<HarinIcon name="close"/);
  assert.doesNotMatch(workbench,/item\.kind==='DEAD_LETTER'\?'↻'/);
  assert.match(icons,/close: <><path d="m6 6 12 12"/);
});

test('22-7 keeps AI, bulk work and reliability support copy on the shared readable scale',()=>{
  const css=read('app/_design-system/harin-readability-v8.css');
  assert.match(css,/Phase 22-7: page AI, selection bars and reliability use one readable support scale/);
  assert.match(css,/\.harinV8 \.aiResultStory article small,/);
  assert.match(css,/\.harinV8 \.v8BulkSelectionBar>header small,/);
  assert.match(css,/\.harinV8 \.reliabilityExceptionPreview article p,/);
  assert.match(css,/font-size:var\(--v8-readable-support\)!important/);
  assert.match(css,/\.harinV8 \.reliabilityRetryAll\{[\s\S]*min-height:var\(--v8-readable-touch\)/);
});

test('22-7 contains legacy order stage cards inside the mobile horizontal rail',()=>{
  const css=read('app/_design-system/harin-readability-v8.css');
  assert.match(css,/\.harinV8 \.orderProcessNode,\s*\.harinV8 \.orderProcessNode>button\{box-sizing:border-box;max-width:100%\}/);
  assert.match(css,/\.harinV8 \.orderProcessNode :where\(small,strong,span\)\{max-width:100%;overflow-wrap:anywhere;white-space:normal\}/);
  assert.match(css,/\.harinV8 \.orderProcessNode\{flex-basis:min\(72vw,250px\)\}/);
});

test('22-7 retains pastel selection and separate page-specific AI rules',()=>{
  const bulk=read('app/_design-system/harin-bulk-selection.css');
  const ai=read('app/harin-ai-page-panel.js');
  assert.match(bulk,/button\.selected\{border-color:#b8a8e6;background:#eee9fc;color:#5f4f91\}/);
  assert.match(ai,/<h2>\{panel\.title\}<\/h2><p>\{panel\.summary\}<\/p>/);
  assert.doesNotMatch(ai,/페이지별 AI 분석/);
  assert.match(ai,/다른 화면 자료와 섞지 않고 아래 범위만 사용해요/);
  assert.match(ai,/panel\.snapshot_token/);
});
