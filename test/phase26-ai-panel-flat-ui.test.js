'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('26-5 keeps every page AI analysis independent while sharing only its visual shell',()=>{
  const dashboard=read('app/dashboard-client.js');
  const panel=read('app/harin-ai-page-panel.js');

  for(const page of ['main','collection','insight','orders','cs','inventory','settlement','keyword','product','reports','changes','validation','experiments','notifications']){
    assert.match(dashboard,new RegExp(`aiPagePanels\\?\\.${page}`));
  }
  assert.match(panel,/snapshot_token/);
  assert.match(panel,/\/api\/ai\/page-analysis/);
  assert.match(panel,/다른 화면 자료와 섞지 않고/);
});

test('26-5 page AI shell uses the flat brand system without decorative effects',()=>{
  const css=read('app/_ai/harin-ai-page-v8.css');
  const panel=read('app/harin-ai-page-panel.js');

  assert.match(css,/--ai-accent:var\(--harin-color-analysis\)/);
  assert.match(css,/background:var\(--harin-color-surface\)/);
  assert.match(css,/background:var\(--ai-soft\)/);
  assert.match(css,/font-size:var\(--harin-type-body\)/);
  assert.doesNotMatch(css,/(?:linear|radial)-gradient\(/);
  assert.doesNotMatch(css,/backdrop-filter\s*:/);
  assert.doesNotMatch(css,/border-radius:(?:1[7-9]|[2-9]\d)px/);
  assert.doesNotMatch(panel,/페이지별 AI 분석/);

  for(const block of css.matchAll(/[^{}]+\{([^{}]*)\}/g)){
    assert.equal(/border(?:-[^:]+)?\s*:/.test(block[1])&&/box-shadow\s*:/.test(block[1]),false,`테두리와 그림자를 함께 쓰는 블록: ${block[0].slice(0,120)}`);
  }
});

test('26-5 page AI controls remain readable and touch safe on mobile',()=>{
  const css=read('app/_ai/harin-ai-page-v8.css');

  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/\.aiPagePanel>summary\{[^}]*min-height:48px/);
  assert.match(css,/\.aiResultActions button,[^{]+\{[^}]*min-height:48px/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
