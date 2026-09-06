'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {calculateProductTarget}=require('../lib/marketing/product-ad-targets.js');
const input={item:{master_product_id:'p',revenue:10000,orders:1,contribution_before_ads:9000,cost_status:'CALCULATED',channels:{NAVER:{orders:1,clicks:10,ad_spend:1000,attributed_orders:0}}},target:{target_profit_margin_rate:10},financialTrust:{status:'READY'},periodEnd:'2026-09-07',asOf:'2026-09-07T12:00:00+09:00'};
test('organic commerce order cannot create an advertising conversion or allowable bid',()=>{
 const result=calculateProductTarget(input);
 assert.equal(result.naver_conversions,0);
 assert.equal(result.naver_cvr,0);
 assert.equal(result.allowable_cpc,0);
 assert.equal(result.status,'OBSERVE');
});
test('missing attributed conversions cannot fall back to commerce orders',()=>{
 const result=calculateProductTarget({...input,item:{...input.item,channels:{NAVER:{orders:10,clicks:10,ad_spend:1000}}}});
 assert.equal(result.naver_conversions,null);
 assert.equal(result.naver_cvr,null);
 assert.equal(result.allowable_cpc,null);
 assert.equal(result.status,'OBSERVE');
});
test('attributed conversions drive CVR while commerce orders supply sales sample',()=>{
 const result=calculateProductTarget({...input,item:{...input.item,channels:{NAVER:{orders:99,clicks:10,ad_spend:1000,attributed_orders:2}}}});
 assert.equal(result.orders,1);
 assert.equal(result.naver_conversions,2);
 assert.equal(result.naver_cvr,20);
 assert.equal(result.allowable_cpc,1600);
});
