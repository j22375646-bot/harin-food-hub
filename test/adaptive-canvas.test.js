'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

let adaptiveCanvas;
try { adaptiveCanvas=require('../lib/ui/adaptive-canvas.js'); }
catch { adaptiveCanvas=null; }

test('dense operating workbenches receive a wide canvas without mixing route concerns',()=>{
  assert.equal(typeof adaptiveCanvas?.resolveCanvasProfile,'function');
  for(const [view,workspace] of [
    ['orders',null],
    ['inventory',null],
    ['keyword','registered'],
    ['keyword','search-terms'],
    ['product','mappings'],
    ['product','costs'],
    ['collection','provider-runtime'],
    ['notifications',null]
  ]){
    assert.equal(adaptiveCanvas.resolveCanvasProfile({view,workspace}),'wide',`${view}:${workspace||'default'}`);
  }
});

test('decision and reading pages keep a balanced line length',()=>{
  for(const [view,workspace] of [
    ['main',null],
    ['insight','overview'],
    ['insight','causes'],
    ['reports',null],
    ['knowledge',null],
    ['validation',null],
    ['experiments',null]
  ]){
    assert.equal(adaptiveCanvas.resolveCanvasProfile({view,workspace}),'balanced',`${view}:${workspace||'default'}`);
  }
});

test('unknown route input cannot inject an arbitrary canvas profile',()=>{
  assert.equal(adaptiveCanvas.resolveCanvasProfile({view:'wide',workspace:'full-bleed'}),'balanced');
  assert.equal(adaptiveCanvas.resolveCanvasProfile(),'balanced');
});
