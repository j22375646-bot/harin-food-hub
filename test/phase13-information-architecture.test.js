'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { HUB_NAV, HUB_NAV_GROUPS, HUB_LEGACY_ROUTES, buildHubHref, parseHubHref, navigationContext }=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('13-3 exposes nine owner-oriented groups and preserves every concrete function URL',()=>{
  assert.deepEqual(HUB_NAV_GROUPS.map(group=>group.id),['today','orders','customer','inventory','settlement','analysis','execution','collection','settings']);
  const ids=HUB_NAV_GROUPS.flatMap(group=>group.items);
  assert.equal(ids.length,HUB_NAV.length);
  assert.equal(new Set(ids).size,HUB_NAV.length);
  for(const item of HUB_NAV){
    assert.ok(item.href.startsWith('/'));
    assert.equal(parseHubHref(buildHubHref({view:item.id})).view,item.id);
  }
});

test('13-3 keeps product operations with inventory and AI reference material in settings',()=>{
  assert.equal(navigationContext('product').group.label,'재고·상품');
  assert.equal(navigationContext('keyword').group.label,'분석');
  assert.equal(navigationContext('knowledge').group.label,'설정');
  assert.equal(navigationContext('collection').group.label,'수집상태');
});

test('13-3 keeps legacy addresses and browser history restoration behavior',()=>{
  assert.ok(HUB_LEGACY_ROUTES.every(route=>parseHubHref(route.href).view===route.view));
  const client=read('app/dashboard-client.js');
  assert.match(client,/window\.addEventListener\('popstate',syncFromAddress\)/);
  assert.match(client,/router\[replace\|\|current===href\?'replace':'push'\]\(href,\{scroll:false\}\)/);
});

test('13-3 renders concrete second-level items on desktop and collapsible groups on mobile',()=>{
  const client=read('app/dashboard-client.js');
  const css=read('app/globals.css');
  assert.match(client,/className="sidebarItems"/);
  assert.match(client,/className="mobileNavGroup"/);
  assert.match(client,/group\.items\.map\(item=>/);
  assert.match(css,/Phase 13-3: nine owner-oriented groups/);
  assert.match(css,/\.mobileNavGroup\[open\]/);
});
