'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const brandSystem=require('../lib/ui/brand-system.js');

function cssVariables(css){
  return new Map([...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(match=>[match[1],match[2].trim()]));
}

function resolveCssVariable(variables,name,visited=new Set()){
  assert.ok(!visited.has(name),`circular CSS variable reference: ${name}`);
  visited.add(name);
  const value=variables.get(name);
  assert.ok(value,`missing CSS variable: ${name}`);
  const reference=value.match(/^var\((--[a-z0-9-]+)\)$/i);
  return reference?resolveCssVariable(variables,reference[1],visited):value.toLowerCase();
}

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

test('27-0 keeps action, selection, analysis, and information as distinct semantic colors',()=>{
  const variables=cssVariables(read('app/_design-system/harin-brand-tokens.css'));
  const roles=[
    '--harin-color-action',
    '--harin-color-selection',
    '--harin-color-analysis',
    '--harin-color-info'
  ];
  const resolved=roles.map(role=>resolveCssVariable(variables,role));
  assert.equal(new Set(resolved).size,roles.length,'semantic roles must not collapse into the same blue');
  assert.notEqual(resolveCssVariable(variables,'--harin-color-canvas'),resolved[0],'page canvas must stay neutral');
});

test('27-0 legacy lavender and shared AI aliases consume their intended semantic roles',()=>{
  const v8=read('app/_design-system/harin-v8.css');
  const ai=read('app/_ai/harin-ai-page-v8.css');
  assert.match(v8,/--v8-lavender:var\(--harin-color-selection\)/);
  assert.match(v8,/--v8-lavender-strong:var\(--harin-color-selection-strong\)/);
  assert.match(v8,/--v8-lavender-soft:var\(--harin-color-selection-soft\)/);
  assert.match(ai,/--ai-accent:var\(--harin-color-analysis\)/);
  assert.match(ai,/--ai-accent-strong:var\(--harin-color-analysis-strong\)/);
  assert.match(ai,/--ai-soft:var\(--harin-color-analysis-soft\)/);
});

test('27-0 new semantic text colors preserve WCAG AA contrast on their soft surfaces',()=>{
  const palette=brandSystem.BRAND_PALETTE;
  for(const [foreground,background] of [
    ['selectionStrong','selectionSoft'],
    ['analysisStrong','analysisSoft'],
    ['infoStrong','infoSoft']
  ]){
    assert.equal(typeof palette[foreground],'string',foreground);
    assert.equal(typeof palette[background],'string',background);
    assert.ok(contrast(palette[foreground],palette[background])>=4.5,`${foreground} on ${background}`);
  }
});
