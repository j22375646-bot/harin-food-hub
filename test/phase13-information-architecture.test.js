'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { HUB_NAV, HUB_NAV_GROUPS, HUB_LEGACY_ROUTES, buildHubHref, parseHubHref, navigationContext }=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('22-4 keeps the approved operating groups and adds focused analysis, development and system groups',()=>{
  assert.deepEqual(HUB_NAV_GROUPS.map(group=>group.id),['today','orders','customer','inventory','settlement','analysis','development','system']);
  const ids=HUB_NAV_GROUPS.flatMap(group=>group.items);
  assert.equal(ids.length,HUB_NAV.length);
  assert.equal(new Set(ids).size,HUB_NAV.length);
  for(const item of HUB_NAV){
    assert.ok(item.href.startsWith('/'));
    assert.equal(parseHubHref(buildHubHref({view:item.id})).view,item.id);
  }
});

test('22-4 keeps product operations with inventory and moves support tools into system',()=>{
  assert.equal(navigationContext('product').group.label,'재고·상품');
  assert.equal(navigationContext('keyword').group.label,'분석');
  assert.equal(navigationContext('market').group.label,'개발');
  assert.equal(navigationContext('knowledge').group.label,'시스템');
  assert.equal(navigationContext('collection').group.label,'시스템');
});

test('13-3 keeps legacy addresses and browser history restoration behavior',()=>{
  assert.ok(HUB_LEGACY_ROUTES.every(route=>parseHubHref(route.href).view===route.view));
  const client=read('app/legacy-dashboard-client.js');
  assert.match(client,/window\.addEventListener\('popstate',syncFromAddress\)/);
  assert.match(client,/router\[replace\|\|current===href\?'replace':'push'\]\(href,\{scroll:false\}\)/);
});

test('13-3 renders concrete second-level items on desktop and collapsible groups on mobile',()=>{
  const shell=read('app/_shell/harin-app-shell.js');
  const css=read('app/globals.css');
  assert.match(shell,/className="sidebarItems"/);
  assert.match(shell,/className="mobileNavGroup"/);
  assert.match(shell,/group\.items\.map\(item=>/);
  assert.match(css,/Phase 22-4: approved flat operations/);
  assert.match(css,/\.mobileNavGroup\[open\]/);
});
