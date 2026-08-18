'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('16-2 loads the isolated entry stylesheet after the shared V8 layers',()=>{
  const layout=read('app/layout.js');
  assert.match(layout,/import '.\/_shell\/harin-entry-v8\.css'/);
  assert.ok(layout.indexOf("harin-entry-v8.css")>layout.indexOf("harin-ai-page-v8.css"));
});

test('16-2 keeps password-only owner login while adding the pastel welcome layout',()=>{
  const login=read('app/login/page.js');
  assert.match(login,/className="loginWelcome"/);
  assert.match(login,/className="loginAccess"/);
  assert.match(login,/action="\/api\/dashboard\/login" method="post"/);
  assert.match(login,/name="password" type="password" inputMode="numeric" pattern="\[0-9\]\{6\}"/);
  assert.match(login,/nextPath\.startsWith\('\/'\)&&!nextPath\.startsWith\('\/\/'\)/);
  assert.doesNotMatch(login,/name="(?:account|username|email)"/);
});

test('23-1 supersedes full route and hydration loading with the persistent shell',()=>{
  const dashboard=read('app/dashboard-client.js');
  const shared=read('app/_design-system/harin-loading-screen.js');
  const marketLoading=read('app/market-intelligence/loading.js');
  assert.equal(fs.existsSync(path.join(root,'app/loading.js')),false);
  assert.doesNotMatch(dashboard,/if \(!mounted\)|HarinLoadingScreen/);
  assert.match(dashboard,/className="viewLoadingSkeleton"/);
  assert.match(marketLoading,/HarinRouteSkeleton/);
  assert.match(shared,/aria-live="polite" aria-busy="true"/);
  assert.match(shared,/className="routePartialSkeleton"/);
});

test('16-2 entry motion is pastel, responsive and reduced-motion safe',()=>{
  const css=read('app/_shell/harin-entry-v8.css');
  assert.match(css,/radial-gradient\(circle at 12% 18%,rgba\(213,232,249/);
  assert.match(css,/linear-gradient\(135deg,#655c9c,#7d73b9\)/);
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
