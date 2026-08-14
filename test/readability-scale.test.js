'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'globals.css'), 'utf8');

test('phase 10 readability scale keeps core text and controls comfortably sized', () => {
  assert.match(styles, /--hub-font-body:16px/);
  assert.match(styles, /--hub-font-support:13px/);
  assert.match(styles, /--hub-font-control:15px/);
  assert.match(styles, /--hub-touch-target:46px/);
  assert.match(styles, /main small,.topbar small,.desktopSidebar small\{font-size:var\(--hub-font-support\)!important/);
});

test('larger sidebar and content canvas stay aligned', () => {
  assert.match(styles, /--hub-sidebar-width:268px/);
  assert.match(styles, /\.desktopSidebar\{top:84px;width:var\(--hub-sidebar-width\)/);
  assert.match(styles, /\.hubMain\{width:min\(1360px,calc\(100% - var\(--hub-sidebar-width\)\)\)/);
  assert.match(styles, /\.hubFooter\{width:min\(1360px,calc\(100% - var\(--hub-sidebar-width\)\)\)/);
});

test('mobile readability preserves full-width layout and larger navigation targets', () => {
  assert.match(styles, /@media\(max-width:900px\)/);
  assert.match(styles, /\.hubMain\{width:100%;margin-left:0;padding:24px 16px 104px\}/);
  assert.match(styles, /\.mobileBottomNav button,.mobileBottomNav a\{min-height:58px;font-size:13px/);
  assert.match(styles, /\.mobileMoreMenu button,.mobileMoreMenu a\{min-height:50px;font-size:14px\}/);
});
