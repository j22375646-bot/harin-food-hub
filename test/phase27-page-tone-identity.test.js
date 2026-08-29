'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const brandSystem=require('../lib/ui/brand-system.js');

function luminance(hex){
  const channels=hex.slice(1).match(/.{2}/g).map(value=>{
    const normalized=parseInt(value,16)/255;
    return normalized<=.03928?normalized/12.92:((normalized+.055)/1.055)**2.4;
  });
  return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];
}

function contrast(foreground,background){
  const light=Math.max(luminance(foreground),luminance(background));
  const dark=Math.min(luminance(foreground),luminance(background));
  return (light+.05)/(dark+.05);
}

test('27-1 assigns one semantic page tone to each operating area',()=>{
  assert.equal(typeof brandSystem.resolvePageTone,'function');
  const areas=['today','orders','customer','inventory','settlement','analysis','development','system'];
  assert.deepEqual(areas.map(area=>brandSystem.resolvePageTone(area)),areas);
  assert.equal(new Set(areas.map(area=>brandSystem.resolvePageTone(area))).size,areas.length);
});

test('27-1 detail views inherit the correct operating-area tone',()=>{
  assert.equal(brandSystem.resolvePageTone('main'),'today');
  assert.equal(brandSystem.resolvePageTone('orders'),'orders');
  assert.equal(brandSystem.resolvePageTone('cs'),'customer');
  assert.equal(brandSystem.resolvePageTone('product'),'inventory');
  assert.equal(brandSystem.resolvePageTone('keyword'),'analysis');
  assert.equal(brandSystem.resolvePageTone('market'),'development');
  assert.equal(brandSystem.resolvePageTone('collection'),'system');
});

test('27-1 page identity text keeps WCAG AA contrast on its soft surface',()=>{
  for(const area of ['today','orders','customer','inventory','settlement','analysis','development','system']){
    const tone=brandSystem.PAGE_TONES[area];
    assert.ok(tone,area);
    assert.ok(contrast(tone.ink,tone.soft)>=4.5,`${area} ink on soft`);
  }
});

test('27-1 shell consumes semantic page tones without decorative gradients or glow shadows',()=>{
  const shell=read('app/_shell/harin-shell-v8.css');
  const dashboard=read('app/legacy-dashboard-client.js');
  const marketShell=read('app/_shell/market-intelligence-shell.js');
  for(const area of ['today','orders','customer','inventory','settlement','analysis','development','system']){
    assert.match(shell,new RegExp(`\\[data-tone="${area}"\\]`));
  }
  assert.doesNotMatch(shell,/\[data-tone="lavender"\][^{]*\[data-tone="sky"\]/);
  assert.doesNotMatch(shell,/linear-gradient/i);
  assert.doesNotMatch(shell,/\.mobileNavGroup(?:\[open\]| button\.active)\{[^}]*box-shadow/i);
  assert.match(dashboard,/className=\{`hubMain[^`]*`\} data-view=\{view\} data-tone=\{navContext\.group\.id\}/);
  assert.match(marketShell,/className="hubMain marketHubMain" data-tone="development"/);
  assert.match(shell,/\.hubMain\[data-tone\] \.v8PageHeaderEyebrow\{color:var\(--nav-ink\)\}/);
  assert.match(shell,/\.hubMain\[data-tone\] \.v8PageHeader \.v8Pictogram\{background:var\(--nav-soft\);color:var\(--nav-ink\)\}/);
});
