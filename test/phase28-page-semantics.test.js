'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Phase 28 공통 셸 안의 페이지와 로딩 표시는 중첩 main 영역을 만들지 않는다',()=>{
  const files=[
    'app/_phase28/pages/inventory-products-page.js',
    'app/_phase28/pages/product-analysis-page.js',
    'app/_phase28/pages/settlement-page.js',
    'app/_phase28/phase28-loading.js'
  ];
  for(const file of files){
    const source=read(file);
    assert.doesNotMatch(source,/<main\b/,`${file}가 공통 셸의 main 안에 중첩 main을 만들면 안 됩니다.`);
  }
});
