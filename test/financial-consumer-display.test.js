'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('ad target footer preserves unknown conversion counts while displaying measured zero',()=>{
 const source=read('app/product-ad-targets-center.js');
 assert.match(source,/item\.naver_conversions\s*==\s*null\s*\?\s*'확인 필요'/);
 assert.doesNotMatch(source,/naver_conversions\s*\|\|\s*0/);
 assert.match(source,/Math\.round\(item\.naver_conversions\)\.toLocaleString\('ko-KR'\)/);
});
test('actual commerce revenue and units are labelled as actual sales in legacy consumers',()=>{
 const workbench=read('app/_products/harin-product-workbench.js');
 const growth=read('app/product-growth-center.js');
 assert.match(workbench,/네이버 실매출/);
 assert.match(workbench,/Cafe24·네이버·쿠팡은 주문 실매출/);
 assert.doesNotMatch(workbench,/네이버 전환매출|판매\/전환|네이버는 매핑된 광고그룹의 키워드 전환매출/);
 assert.doesNotMatch(growth,/판매\/전환/);
 assert.doesNotMatch(growth,/네이버는 상품에 연결된 광고 전환매출/);
});
