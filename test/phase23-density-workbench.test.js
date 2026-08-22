'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const costWorkbench=require('../lib/products/cost-workbench.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('23-4 sorts missing product costs first and preserves zero as a real value',()=>{
  const products=[{id:'ready',name:'완료 상품'},{id:'missing',name:'확인 상품'}];
  const rows={
    ready:{unit_cost:1000,packaging_cost:0,other_unit_cost:0},
    missing:{unit_cost:'',packaging_cost:200,other_unit_cost:''}
  };
  assert.equal(costWorkbench.costStatus(rows.ready).ready,true);
  assert.equal(costWorkbench.costStatus(rows.missing).label,'2개 확인 필요');
  assert.deepEqual(costWorkbench.filterCostProducts(products,rows).map(item=>item.id),['missing','ready']);
});

test('23-4 product cost pages render at most eight list rows at once',()=>{
  const products=Array.from({length:21},(_,index)=>({id:`p${index}`,name:`상품 ${index}`}));
  const first=costWorkbench.paginateCostProducts(products,1);
  const last=costWorkbench.paginateCostProducts(products,3);
  assert.equal(costWorkbench.PAGE_SIZE,8);
  assert.equal(first.items.length,8);
  assert.equal(first.totalPages,3);
  assert.equal(last.items.length,5);
  assert.deepEqual([last.start,last.end],[17,21]);
});

test('23-4 calculates visible progress without treating unknown costs as zero',()=>{
  const products=[{id:'ready'},{id:'pending'}];
  const summary=costWorkbench.summarizeCostProgress(products,{
    ready:{unit_cost:1000,packaging_cost:0,other_unit_cost:0},
    pending:{unit_cost:1000,packaging_cost:'',other_unit_cost:''}
  });
  assert.deepEqual(summary,{total:2,ready:1,pending:1,rate:50});
});

test('23-4 uses a paged spreadsheet grid and one-confirmation bulk save',()=>{
  const productWorkbench=read('app/_products/harin-product-workbench.js');
  const start=productWorkbench.indexOf('function CostManager');
  const manager=productWorkbench.slice(start);
  assert.match(productWorkbench,/function ProductCostQuickGrid/);
  assert.match(productWorkbench,/className="productCostQuickGrid"/);
  assert.match(productWorkbench,/작성한 \$\{dirtyReadyIds\.length\}개 저장/);
  assert.match(manager,/saveCostRows/);
  assert.match(manager,/window\.confirm\(`작성한 상품 원가 \$\{products\.length\}개를 한 번에 저장할까요/);
  assert.doesNotMatch(manager,/masterProducts\.slice\(0,20\)/);
  assert.doesNotMatch(manager,/value=\{row\[field\]\?\?0\}/);
  assert.match(read('app/_analysis/harin-analysis-v8.css'),/Phase 23-4B: spreadsheet product costs/);
});
