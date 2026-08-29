'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = fs.readFileSync(path.join(__dirname, '..', 'app', 'legacy-dashboard-client.js'), 'utf8');
const coupangOperations = fs.readFileSync(path.join(__dirname, '..', 'app', '_operations', 'coupang-operation-details.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

test('phase 10-8 keeps the route loading layer outside the desktop sidebar', () => {
  assert.match(styles, /\.viewLoadingOverlay\{z-index:30;top:84px;left:var\(--hub-sidebar-width\)/);
  assert.match(styles, /\.desktopSidebar\{z-index:35;isolation:isolate\}/);
  assert.match(styles, /@media\(max-width:900px\)[\s\S]*\.viewLoadingOverlay\{top:72px;left:0\}/);
});

test('seller orders expose the five real delivery stages as clickable boxes', () => {
  assert.match(coupangOperations, /\['ACCEPT','결제완료'/);
  assert.match(coupangOperations, /\['INSTRUCT','상품준비중'/);
  assert.match(coupangOperations, /\['DEPARTURE','배송지시'/);
  assert.match(coupangOperations, /\['DELIVERING','배송중'/);
  assert.match(coupangOperations, /\['FINAL_DELIVERY','배송완료'/);
  assert.match(coupangOperations, /className="orderProcessFlow"/);
  assert.match(coupangOperations, /onClick=\{\(\)=>setStatus\(step\.id\)\}/);
});

test('inventory comparison and order details use readable text sizes', () => {
  assert.match(styles, /\.inventoryCompareRow>b\{font-size:15px/);
  assert.match(styles, /\.inventoryCompareRow span\{height:27px/);
  assert.match(styles, /\.inventoryCompareRow em\{[^}]*font-size:12px!important/);
  assert.match(styles, /\.sellerOrderItems b\{font-size:15px\}/);
});
