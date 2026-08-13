'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client=fs.readFileSync(path.join(__dirname,'..','app','dashboard-client.js'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'..','app','globals.css'),'utf8');

test('desktop navigation includes grouped expansion, menu search, badges, and breadcrumbs', () => {
  assert.match(client,/function SidebarMenu/);
  assert.match(client,/placeholder="메뉴 이름 찾기"/);
  assert.match(client,/aria-expanded=\{expanded\}/);
  assert.match(client,/function BreadcrumbBar/);
  assert.match(client,/최근 갱신/);
  assert.match(styles,/\.sidebarGroup\.expanded/);
  assert.match(styles,/\.hubBreadcrumb/);
});

test('history navigation also restores the active sidebar group', () => {
  assert.match(client,/window\.addEventListener\('popstate',syncFromAddress\)/);
  assert.match(client,/setOpenNavGroup\(hubRoutesModule\.groupForView\(next\.view\)\)/);
  assert.match(client,/window\.history\[replace\|\|current===href\?'replaceState':'pushState'\]/);
});

test('mobile all-functions menu keeps the same groups and closes after selection', () => {
  assert.match(client,/function MobileMoreMenu/);
  assert.match(client,/closest\('details'\)\?\.removeAttribute\('open'\)/);
  assert.match(styles,/\.mobileGroupedMenu>section>div/);
});

test('main renders only the all-channel command center and links channel details to work pages', () => {
  assert.match(client,/\{view!=='main'&&<section className="platformSwitch"/);
  assert.doesNotMatch(client,/view==='main' && platform!=='all'/);
  assert.doesNotMatch(client,/view==='main' && !channelUnavailable && <MainView/);
  assert.match(client,/onOpen\(\{view:'insight',platform:item\.platform\}\)/);
  assert.match(client,/view==='insight' && !channelUnavailable && platform!=='all' && <details className="channelLegacyDetails"/);
  assert.match(client,/10-3단계 · 메인 사령실 정리/);
  assert.match(styles,/Phase 10-3 — the main page is one all-channel command center/);
});
