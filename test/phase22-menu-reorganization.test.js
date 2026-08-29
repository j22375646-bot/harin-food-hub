'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HUB_NAV,HUB_NAV_GROUPS,navigationContext,parseHubHref}=require('../lib/navigation/hub-routes.js');

const read=file=>fs.readFileSync(file,'utf8');

test('22-4 preserves the six approved one-glance operating groups',()=>{
  assert.deepEqual(HUB_NAV_GROUPS.slice(0,6).map(group=>group.label),[
    '오늘','주문·배송','고객·CS','재고·상품','정산·비용','분석'
  ]);
});

test('22-4 replaces execution, collection and settings with focused development and system groups',()=>{
  assert.deepEqual(HUB_NAV_GROUPS.slice(6).map(group=>group.id),['development','system']);
  assert.deepEqual(HUB_NAV_GROUPS.find(group=>group.id==='analysis').items,['insight','keyword','reports']);
  assert.deepEqual(HUB_NAV_GROUPS.find(group=>group.id==='development').items,['product-analysis','market','validation','experiments']);
  assert.deepEqual(HUB_NAV_GROUPS.find(group=>group.id==='system').items,['collection','changes','notifications','knowledge']);
  assert.equal(HUB_NAV_GROUPS.some(group=>['execution','collection','settings'].includes(group.id)),false);
});

test('22-4 keeps every function and canonical URL exactly once',()=>{
  const grouped=HUB_NAV_GROUPS.flatMap(group=>group.items);
  assert.equal(grouped.length,HUB_NAV.length);
  assert.equal(new Set(grouped).size,HUB_NAV.length);
  assert.deepEqual(new Set(grouped),new Set(HUB_NAV.map(item=>item.id)));
  for(const item of HUB_NAV)assert.equal(parseHubHref(item.href).view,item.id);
});

test('22-4 keeps history as a record and opens market work under development',()=>{
  assert.equal(navigationContext('changes').group.label,'시스템');
  assert.equal(navigationContext('market').group.label,'개발');
  assert.equal(navigationContext('reports').group.label,'분석');
  const shell=read('app/_shell/harin-app-shell.js');
  const marketShell=read('app/_shell/market-intelligence-shell.js');
  const icons=read('app/_design-system/harin-icon.js');
  assert.match(shell,/const toneForGroup=groupId=>resolvePageTone\(groupId\)/);
  assert.equal(require('../lib/ui/brand-system.js').resolvePageTone('development'),'development');
  assert.equal(require('../lib/ui/brand-system.js').resolvePageTone('system'),'system');
  assert.match(marketShell,/useState\('development'\)/);
  assert.match(marketShell,/group:\{label:'개발'\}/);
  assert.match(icons,/development:'experiments', system:'settings'/);
});
