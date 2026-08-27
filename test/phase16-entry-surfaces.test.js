'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-8 loads the isolated entry stylesheet only on entry surfaces',()=>{
  const layout=read('app/layout.js');
  const login=read('app/login/page.js');
  const loading=read('app/_design-system/harin-loading-screen.js');
  assert.doesNotMatch(layout,/harin-entry-v8\.css/);
  assert.match(login,/harin-entry-v8\.css/);
  assert.match(loading,/harin-entry-v8\.css/);
});

test('16-2 keeps password-only owner login while adding the pastel welcome layout',()=>{
  const login=read('app/login/page.js');
  const form=read('app/login/login-form.js');
  assert.match(login,/className="loginWelcome"/);
  assert.match(login,/className="loginAccess"/);
  assert.match(form,/action="\/api\/dashboard\/login" method="post"/);
  assert.match(form,/name="password"[\s\S]*type="password"[\s\S]*inputMode="numeric"[\s\S]*pattern="\[0-9\]\{6\}"/);
  assert.match(login,/nextPath\.startsWith\('\/'\)&&!nextPath\.startsWith\('\/\/'\)/);
  assert.doesNotMatch(`${login}\n${form}`,/name="(?:account|username|email)"/);
});

test('23-1 supersedes full route and hydration loading with the persistent shell',()=>{
  const dashboard=read('app/dashboard-client.js');
  const shared=read('app/_design-system/harin-loading-screen.js');
  const marketLoading=read('app/market-intelligence/loading.js');
  assert.equal(fs.existsSync(path.join(root,'app/loading.js')),false);
  assert.doesNotMatch(dashboard,/if \(!mounted\)|HarinLoadingScreen/);
  assert.match(dashboard,/<HarinRouteProgress label=/);
  assert.match(marketLoading,/HarinRouteSkeleton/);
  assert.match(shared,/aria-live="polite" aria-busy="true"/);
  assert.match(shared,/className="routePartialSkeleton"/);
});

test('26-3 entry motion uses the flat brand system and stays responsive and reduced-motion safe',()=>{
  const css=read('app/_shell/harin-entry-v8.css');
  assert.match(css,/background:var\(--harin-color-canvas\)/);
  assert.match(css,/background:var\(--harin-button-primary-bg\)/);
  assert.doesNotMatch(css,/(?:radial|linear)-gradient\(/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.routeLoadingOrbit[^}]*animation:v8EntryOrbit/);
  assert.doesNotMatch(css,/#(?:15724f|176d50|1e4e3d|2c6952)/i);
});

test('16-15 uses one clean circular arrow for the global sync action',()=>{
  const icons=read('app/_design-system/harin-icon.js');
  const shell=read('app/_shell/harin-app-shell.js');
  assert.match(icons,/sync:\s*<><path d="M20 12a8 8 0 1 1-2\.35-5\.65"\/><path d="M20 4v6h-6"\/><\/>/);
  assert.match(shell,/<HarinIcon name="sync"\/><span>\{syncing\?'동기화 중…':'지금 동기화'\}<\/span>/);
});
