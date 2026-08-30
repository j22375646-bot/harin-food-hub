'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('shared heading owns the single underline animation',()=>{
  const heading=read('app/_phase28/primitives/page-heading.js');
  const css=read('app/_phase28/primitives/primitives.module.css');
  assert.match(heading,/page-title-accent/);
  assert.match(css,/\.heading h1\{[^}]*font-size:clamp\(34px,3vw,50px\)!important/);
  assert.match(css,/\.heading \.headingAccent\{[^}]*font-size:inherit!important/);
  assert.match(css,/transform:scaleX\(0\)/);
  assert.match(css,/transform-origin:left/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
});

test('shared channel logos keep one brand-tile contract',()=>{
  const logo=read('app/_phase28/primitives/channel-logo.js');
  const css=read('app/_phase28/primitives/primitives.module.css');
  assert.match(logo,/NAVER.*mark:'N'/s);
  assert.match(logo,/CAFE24.*mark:'24'/s);
  assert.match(logo,/COUPANG.*mark:'C'/s);
  assert.match(css,/--channel-logo-size:40px/);
  assert.match(css,/--channel-logo-compact-size:30px/);
});

test('right rail collapses to a square without a vertical shell',()=>{
  const rail=read('app/_phase28/primitives/right-rail-layout.js');
  const css=read('app/_phase28/primitives/primitives.module.css');
  assert.match(rail,/aria-expanded=\{open\}/);
  assert.match(rail,/aria-hidden=\{!open\}/);
  assert.match(rail,/inert=\{open\?undefined:true\}/);
  assert.match(css,/--panel-closed-width:48px/);
  assert.match(css,/max-height:48px/);
  assert.match(css,/440ms/);
  assert.match(css,/@media \(max-width:1480px\)/);
  assert.doesNotMatch(css,/border-left\s*:/);
});

test('right rail pages keep route-scoped panels and hide nested scrollbar tracks',()=>{
  const css=read('app/_phase28/primitives/primitives.module.css');
  const orders=read('app/_phase28/pages/orders-page.css');
  const cs=read('app/_phase28/pages/cs-page.css');
  assert.match(css,/--panel-open-width:clamp\(400px,22vw,460px\)/);
  assert.match(css,/\.railContent,.railContent :global\(\*\)\{[^}]*scrollbar-width:none/);
  assert.match(css,/\.railContent::-webkit-scrollbar,.railContent :global\(\*\)::-webkit-scrollbar\{[^}]*display:none/);
  assert.match(orders,/\.ordersRailPanels\{/);
  assert.match(cs,/\.csRailPanels\{/);
  assert.doesNotMatch(orders,/\.railPanels\b/);
  assert.doesNotMatch(cs,/\.railPanels\b/);
});
