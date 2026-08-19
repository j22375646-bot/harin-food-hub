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

test('23-4 uses a searchable list and one selected-product detail editor',()=>{
  const dashboard=read('app/dashboard-client.js');
  const start=dashboard.indexOf('function CostManager');
  const end=dashboard.indexOf('function ReportsView',start);
  const manager=dashboard.slice(start,end);
  assert.match(manager,/filterCostProducts\(masterProducts,rows,search\)/);
  assert.match(manager,/paginateCostProducts\(filteredProducts,page,COST_PAGE_SIZE\)/);
  assert.match(manager,/className="productCostWorkbenchLayout"/);
  assert.match(manager,/className="productCostEditor"/);
  assert.match(manager,/disabled=\{saving===selectedProduct\.id\|\|!costStatus\(selectedRow\)\.ready\}/);
  assert.doesNotMatch(manager,/masterProducts\.slice\(0,20\)/);
  assert.doesNotMatch(manager,/value=\{row\[field\]\?\?0\}/);
  assert.match(read('app/globals.css'),/Phase 23-4A: dense product costs/);
});
