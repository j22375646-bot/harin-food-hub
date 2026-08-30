'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const pageFiles=['home-page.js','orders-page.js','cs-page.js','inventory-products-page.js','settlement-page.js','keywords-page.js','product-analysis-page.js','insights-page.js','development-page.js','system-page.js','notifications-page.js','diagnoses-page.js','changes-page.js','validation-page.js'];
const cssFiles=['orders-page.css','cs-page.css','inventory-products-page.css','settlement-page.css','keywords-page.css','product-analysis-page.css','insights-page.css','development-page.css','system-page.css','notifications-page.css','diagnoses-page.css','changes-page.css','validation-page.css'];

function finalInteractiveHeights(css){
  const values=new Map();
  for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const height=match[2].match(/min-height:\s*(\d+)px/);
    if(!height)continue;
    for(const selector of match[1].split(',').map(value=>value.trim())){
      if(/(?:button|select|textarea|\ba)$/.test(selector))values.set(selector,Number(height[1]));
    }
  }
  return values;
}

test('교체된 모든 Phase 28 페이지는 공통 루트·제목·우측 패널을 사용한다',()=>{
  for(const file of pageFiles){
    const source=read(`app/_phase28/pages/${file}`);
    assert.match(source,/data-phase28-root="true"/,`${file} 공통 루트 누락`);
    assert.match(source,/Phase28PageHeading/,`${file} 공통 페이지 제목 누락`);
    assert.match(source,/Phase28RightRailLayout/,`${file} 공통 우측 패널 누락`);
  }
});

test('페이지 CSS는 V106 읽기 크기·대형 폭·모바일·감속 설정을 같은 계약으로 지킨다',()=>{
  for(const file of cssFiles){
    const css=read(`app/_phase28/pages/${file}`);
    assert.match(css,/max-width:\s*2300px/,`${file} 대형 해상도 폭 누락`);
    assert.match(css,/@media\s*\(max-width:\s*760px\)/,`${file} 모바일 기준 누락`);
    assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/,`${file} 감속 설정 누락`);
    assert.doesNotMatch(css,/font-size:\s*(?:[0-9]|1[01])px/,`${file} 12px 미만 텍스트`);
    assert.doesNotMatch(css,/border-left\s*:/,`${file} 한쪽 선택선`);
    for(const [selector,height] of finalInteractiveHeights(css))assert.ok(height>=44,`${file} ${selector} 조작 높이 ${height}px`);
  }
});

test('공통 제목과 우측 패널은 승인된 V106 모션과 접힘 크기를 단일 구현으로 고정한다',()=>{
  const css=read('app/_phase28/primitives/primitives.module.css');
  const rail=read('app/_phase28/primitives/right-rail-layout.js');
  assert.match(css,/--panel-motion-duration:440ms/);
  assert.match(css,/--panel-open-width:clamp\(370px,21vw,410px\)/);
  assert.match(css,/--panel-closed-width:48px/);
  assert.match(css,/--panel-closed-gap:16px/);
  assert.match(css,/\.heading h1\{[^}]*font-size:clamp\(34px,3vw,50px\)!important/);
  assert.match(css,/\.heading p\{[^}]*font-size:18px!important/);
  assert.match(css,/headingAccent::after\{[^}]*transform:scaleX\(0\)[^}]*animation:headlineDraw/);
  assert.doesNotMatch(css,/scaleX\(\.92\)/);
  assert.match(rail,/aria-expanded=\{open\}/);
  assert.match(rail,/aria-hidden=\{!open\}/);
  assert.match(rail,/inert=\{open\?undefined:true\}/);
});
