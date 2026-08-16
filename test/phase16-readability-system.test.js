'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('16-8 loads the final readability layer after every route stylesheet',()=>{
  const layout=read('app/layout.js');
  const entryIndex=layout.indexOf("import './_shell/harin-entry-v8.css'");
  const readabilityIndex=layout.indexOf("import './_design-system/harin-readability-v8.css'");
  assert.ok(entryIndex>=0);
  assert.ok(readabilityIndex>entryIndex);
});

test('16-8 keeps support text, controls and mobile inputs comfortably readable',()=>{
  const css=read('app/_design-system/harin-readability-v8.css');
  assert.match(css,/--v8-readable-body:15px/);
  assert.match(css,/--v8-readable-support:13px/);
  assert.match(css,/--v8-readable-touch:46px/);
  assert.match(css,/\.harinV8 main small,/);
  assert.match(css,/font-size:var\(--v8-readable-support\)!important/);
  assert.match(css,/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/font-size:16px!important/);
  assert.doesNotMatch(css,/font-size:(?:[1-9]|1[0-2])px/);
});

test('16-8 applies the same readable rhythm to dense keyword and reliability workbenches',()=>{
  const css=read('app/_design-system/harin-readability-v8.css');
  assert.match(css,/\.harinV8 \.keywordOpsRow\{min-height:76px/);
  assert.match(css,/\.harinV8 \.keywordOpsRow\.head\{min-height:54px/);
  assert.match(css,/\.harinV8 \.reliabilityChannelRail article\{min-height:84px/);
  assert.match(css,/\.harinV8 \.liveStatusToggle\{min-height:64px/);
  assert.match(css,/\.harinV8 \.ownerWorkCheck\{width:44px;height:44px\}/);
});
