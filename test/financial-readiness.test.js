'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const readiness = require('../lib/analytics/financial-readiness.js');

test('selects the smallest revenue-priority batch needed to reach 95 percent cost coverage', () => {
  const result = readiness.buildFinancialReadiness({
    performance:{summary:{revenue:100000,coupang_ad_spend_unassigned:0},items:[
      {master_product_id:'A',name:'입력 완료',revenue:50000,cost_status:'CALCULATED'},
      {master_product_id:'B',name:'우선 1',revenue:30000,cost_status:'COST_DATA_REQUIRED'},
      {master_product_id:'C',name:'우선 2',revenue:15000,cost_status:'COST_DATA_REQUIRED'},
      {master_product_id:'D',name:'나중 입력',revenue:5000,cost_status:'COST_DATA_REQUIRED'}]},
    productCosts:[{master_product_id:'A',unit_cost:1000}]
  });
  assert.equal(result.current_cost_coverage_rate,50);
  assert.equal(result.priority_input_count,2);
  assert.deepEqual(result.priority_products.filter(item=>item.required_for_target).map(item=>item.master_product_id),['B','C']);
  assert.equal(result.priority_products[1].projected_coverage_rate,95);
});

test('does not treat a zero-value placeholder row as configured cost data', () => {
  const result = readiness.buildFinancialReadiness({
    performance:{summary:{revenue:10000},items:[{master_product_id:'A',name:'상품',revenue:10000,cost_status:'COST_DATA_REQUIRED'}]},
    productCosts:[{master_product_id:'A',unit_cost:0,packaging_cost:0,other_unit_cost:0}]
  });
  assert.equal(result.current_cost_coverage_rate,0);
  assert.equal(result.missing_cost_products,1);
  assert.equal(result.priority_input_count,1);
});

test('keeps profit readiness blocked while ad spend remains unassigned', () => {
  const result = readiness.buildFinancialReadiness({
    performance:{summary:{revenue:10000,coupang_ad_spend_unassigned:2500},items:[{master_product_id:'A',name:'상품',revenue:10000,cost_status:'CALCULATED'}]},
    productCosts:[{master_product_id:'A',unit_cost:1000}]
  });
  assert.equal(result.status,'ACTION_REQUIRED');
  assert.equal(result.checklist.find(item=>item.id==='AD_ASSIGNMENT').status,'ACTION_REQUIRED');
});
