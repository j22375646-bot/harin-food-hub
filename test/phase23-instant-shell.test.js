'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-1 keeps the current hub shell visible during App Router navigation',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  assert.equal(fs.existsSync(path.join(root,'app/loading.js')),false);
  assert.doesNotMatch(dashboard,/const \[mounted|setMounted\(true\)|if \(!mounted\)/);
  assert.match(dashboard,/view=\{pendingView\|\|view\}/);
  assert.match(dashboard,/setPendingView\(state\.view\)/);
});

test('23-1 gives immediate compact feedback and a content-only skeleton',()=>{
  const dashboard=read('app/legacy-dashboard-client.js');
  const ui=read('app/_design-system/harin-ui.js');
  const sharedLoading=read('app/_design-system/harin-loading-screen.js');
  const marketLoading=read('app/market-intelligence/loading.js');
  const css=read('app/_design-system/harin-interactions-v8.css');
  const entryCss=read('app/_shell/harin-entry-v8.css');
  assert.match(dashboard,/<HarinRouteProgress label=/);
  assert.match(ui,/export function HarinRouteProgress/);
  assert.match(ui,/className="viewLoadingRibbon" role="status" aria-live="polite"/);
  assert.match(css,/\.viewLoadingProgress/);
  assert.match(sharedLoading,/export function HarinRouteSkeleton/);
  assert.match(marketLoading,/<HarinRouteSkeleton/);
  assert.match(entryCss,/\.harinV8 \.routePartialSkeleton/);
  assert.match(entryCss,/\.routePartialSkeleton\{[^}]*border:1px solid var\(--p28-line,var\(--v8-line\)\)[^}]*background:var\(--p28-surface,var\(--harin-color-surface\)\)[^}]*color:var\(--p28-ink,var\(--harin-color-ink\)\)/);
  assert.match(entryCss,/\.routePartialSkeleton>header>span\{[^}]*background:var\(--p28-blue-soft,var\(--harin-color-action-soft\)\)[^}]*color:var\(--p28-blue,var\(--harin-color-action-strong\)\)/);
  assert.match(entryCss,/\.routePartialSkeleton>header small\{[^}]*color:var\(--p28-muted,var\(--v8-muted\)\)/);
  assert.match(entryCss,/\.routePartialSkeletonMetrics i,\.harinV8 \.routePartialSkeletonBody i\{[^}]*background:var\(--p28-soft,var\(--harin-color-neutral-soft\)\)/);
  assert.match(entryCss,/@media\(prefers-reduced-motion:reduce\)/);
});
