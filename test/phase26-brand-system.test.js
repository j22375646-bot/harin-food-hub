'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

let brandSystem;
try { brandSystem=require('../lib/ui/brand-system.js'); }
catch { brandSystem=null; }

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

test('26-3 maps operational provider states to one honest visual language',()=>{
  assert.equal(typeof brandSystem?.resolveStatusTone,'function');
  for(const status of ['READY','SUCCESS','CONNECTED','COMPLETED'])assert.equal(brandSystem.resolveStatusTone(status),'success');
  for(const status of ['PARTIAL','STALE','CHECK','SETUP_REQUIRED'])assert.equal(brandSystem.resolveStatusTone(status),'warning');
  for(const status of ['FAILED','ERROR','BLOCKED','CRITICAL'])assert.equal(brandSystem.resolveStatusTone(status),'danger');
  for(const status of ['RUNNING','SYNCING','PROCESSING'])assert.equal(brandSystem.resolveStatusTone(status),'info');
  assert.equal(brandSystem.resolveStatusTone('unexpected'),'neutral');
});

test('26-3 palette keeps body, action, and status text above WCAG AA contrast',()=>{
  const palette=brandSystem?.BRAND_PALETTE;
  assert.ok(palette);
  for(const [foreground,background] of [
    ['ink','surface'],
    ['body','canvas'],
    ['actionStrong','actionSoft'],
    ['successStrong','successSoft'],
    ['warningStrong','warningSoft'],
    ['dangerStrong','dangerSoft'],
    ['neutralStrong','neutralSoft']
  ]){
    assert.ok(contrast(palette[foreground],palette[background])>=4.5,`${foreground} on ${background}`);
  }
  assert.ok(contrast(palette.actionStrong,palette.surface)>=4.5,'primary action on white');
});

test('26-3 loads primitive, semantic, and component tokens before V8 compatibility styles',()=>{
  const layout=read('app/layout.js');
  const css=read('app/_design-system/harin-brand-tokens.css');
  const entry=read('app/_shell/harin-entry-v8.css');
  assert.ok(layout.indexOf("./_design-system/harin-brand-tokens.css")<layout.indexOf("./_design-system/harin-v8.css"));
  for(const token of [
    '--harin-blue-700',
    '--harin-color-action',
    '--harin-button-primary-bg',
    '--harin-font-heading',
    '--harin-type-body',
    '--harin-card-radius'
  ])assert.match(css,new RegExp(`${token.replaceAll('-','\\-')}:`));
  assert.doesNotMatch(css,/linear-gradient|radial-gradient|background-clip\s*:\s*text|backdrop-filter|font-family\s*:\s*(?:Inter|Geist|Space Grotesk|Instrument Serif)/i);
  assert.doesNotMatch(entry,/linear-gradient|radial-gradient|background-clip\s*:\s*text|backdrop-filter/i);
});

test('26-3 shared status components expose the resolved tone to CSS and assistive inspection',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  const shell=read('app/_shell/harin-app-shell.js');
  assert.match(ui,/resolveStatusTone/);
  assert.match(ui,/data-status-tone=\{resolvedTone\}/);
  assert.match(shell,/data-status-tone=\{resolvedConnectionTone\}/);
});
