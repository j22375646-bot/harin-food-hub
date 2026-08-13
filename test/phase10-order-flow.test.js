'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = fs.readFileSync(path.join(__dirname, '..', 'app', 'dashboard-client.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

test('phase 10-8 keeps the route loading layer outside the desktop sidebar', () => {
  assert.match(styles, /\.viewLoadingOverlay\{z-index:30;top:84px;left:var\(--hub-sidebar-width\)/);
  assert.match(styles, /\.desktopSidebar\{z-index:35;isolation:isolate\}/);
  assert.match(styles, /@media\(max-width:900px\)[\s\S]*\.viewLoadingOverlay\{top:72px;left:0\}/);
});

test('seller orders expose the five real delivery stages as clickable boxes', () => {
  assert.match(client, /\['ACCEPT','결제완료'/);
  assert.match(client, /\['INSTRUCT','상품준비중'/);
  assert.match(client, /\['DEPARTURE','배송지시'/);
  assert.match(client, /\['DELIVERING','배송중'/);
  assert.match(client, /\['FINAL_DELIVERY','배송완료'/);
  assert.match(client, /className="orderProcessFlow"/);
  assert.match(client, /onClick=\{\(\)=>setStatus\(step\.id\)\}/);
});

test('inventory comparison and order details use readable text sizes', () => {
  assert.match(styles, /\.inventoryCompareRow>b\{font-size:15px/);
  assert.match(styles, /\.inventoryCompareRow span\{height:27px/);
  assert.match(styles, /\.inventoryCompareRow em\{[^}]*font-size:12px!important/);
  assert.match(styles, /\.sellerOrderItems b\{font-size:15px\}/);
});
