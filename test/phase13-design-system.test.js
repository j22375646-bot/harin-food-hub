'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('13-2 defines one readable typography and control scale',()=>{
  const css=read('app/globals.css');
  assert.match(css,/--ui-font-body:16px/);
  assert.match(css,/--ui-font-list:15px/);
  assert.match(css,/--ui-font-support:13px/);
  assert.match(css,/--ui-font-title:clamp\(32px,3vw,36px\)/);
  assert.match(css,/--ui-font-kpi:clamp\(28px,2\.6vw,36px\)/);
  assert.match(css,/--ui-control-height:46px/);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*--ui-font-title:clamp\(25px,7vw,28px\)/);
});

test('13-2 shares card state and motion rules with reduced motion protection',()=>{
  const css=read('app/globals.css');
  assert.match(css,/--ui-radius-card:20px/);
  assert.match(css,/\.panel,\.contentCard,\.statusCard,\.kpi,\.helpBox,\.harinAiResult,\.harinAiEmpty/);
  assert.match(css,/\.empty,\.emptyState,\.knowledgeEmpty,\.reportLearningEmpty/);
  assert.match(css,/@keyframes phase13Enter/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('13-2 keeps desktop text control and moves mobile control into More view settings',()=>{
  const client=read('app/dashboard-client.js');
  const css=read('app/globals.css');
  assert.match(client,/className="fontScaleControl"/);
  assert.match(client,/className="mobileViewSettings"/);
  assert.match(client,/aria-label="모바일 허브 글자 크기"/);
  assert.match(client,/fontScale=\{fontScale\} onFontScale=\{setFontScale\}/);
  assert.match(css,/\.headerActions \.fontScaleControl\{display:none\}/);
  assert.match(css,/\.mobileViewSettings\{display:flex!important/);
  assert.match(client,/13-7 · 실행 흐름 연결/);
});
