'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-1 keeps the current hub shell visible during App Router navigation',()=>{
  const rootLoading=read('app/loading.js');
  const dashboard=read('app/dashboard-client.js');
  assert.match(rootLoading,/return null/);
  assert.doesNotMatch(rootLoading,/routeLoading|HarinLoadingScreen/);
  assert.doesNotMatch(dashboard,/const \[mounted|setMounted\(true\)|if \(!mounted\)/);
  assert.match(dashboard,/view=\{pendingView\|\|view\}/);
  assert.match(dashboard,/setPendingView\(state\.view\)/);
});

test('23-1 gives immediate compact feedback and a content-only skeleton',()=>{
  const dashboard=read('app/dashboard-client.js');
  const sharedLoading=read('app/_design-system/harin-loading-screen.js');
  const marketLoading=read('app/market-intelligence/loading.js');
  const css=read('app/globals.css');
  const entryCss=read('app/_shell/harin-entry-v8.css');
  assert.match(dashboard,/className="viewLoadingRibbon" role="status" aria-live="polite"/);
  assert.match(dashboard,/className="viewLoadingSkeleton"/);
  assert.match(css,/\.viewLoadingSkeleton/);
  assert.match(sharedLoading,/export function HarinRouteSkeleton/);
  assert.match(marketLoading,/<HarinRouteSkeleton/);
  assert.match(entryCss,/\.harinV8 \.routePartialSkeleton/);
  assert.match(entryCss,/@media\(prefers-reduced-motion:reduce\)/);
});
