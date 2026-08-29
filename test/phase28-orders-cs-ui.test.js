'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('operational dashboards expose the fixed rail accessibility contract',()=>{
  const shell=read('app/_phase28/operational-dashboard.js');
  assert.match(shell,/aria-expanded=\{railOpen\}/);
  assert.match(shell,/aria-hidden=\{!active\}/);
  assert.match(shell,/inert=\{active\?undefined:''\}/);
  assert.match(shell,/role="tablist"/);
  assert.match(shell,/role="tabpanel"/);
  assert.match(shell,/Phase28ChannelLogo/);
});

test('shared operational CSS keeps the Phase 28 readable scale and balanced states',()=>{
  const css=read('app/_phase28/phase28-operational.css');
  assert.match(css,/440ms cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css,/clamp\(34px,3vw,50px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/width:48px/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|backdrop-filter/);
});

test('orders and cs dashboards keep page-specific evidence and AI tabs',()=>{
  const orders=read('app/_phase28/orders-dashboard.js');
  const cs=read('app/_phase28/cs-dashboard.js');
  assert.match(orders,/오늘의 출고 레일/);
  assert.match(orders,/수집 상태/);
  assert.match(orders,/주문·배송 AI/);
  assert.match(cs,/우선 처리/);
  assert.match(cs,/채널 상태/);
  assert.match(cs,/고객·CS AI/);
  assert.match(read('app/_phase28/operational-dashboard.js'),/page-title-accent/);
});
