'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const values=require('../lib/coupang/order-values.js'),map=require('../lib/coupang/mappers.js'),unified=require('../lib/orders/unified-orders.js');
test('Coupang quantity is applied once; totals, unit price, Money and zero stay distinct',()=>{
 assert.deepEqual(values.lineAmounts({shippingCount:2,orderPrice:88000,salesPrice:44000}),{quantity:2,unitPrice:44000,total:88000});
 assert.equal(values.lineAmounts({shippingCount:2,orderPrice:{currencyCode:'KRW',units:88000},salesPrice:44000}).total,88000);
 assert.equal(values.lineAmounts({shippingCount:3,salesPrice:44000}).total,132000);
 assert.equal(values.lineAmounts({shippingCount:2,orderPrice:0,salesPrice:44000}).total,0);
 assert.equal(values.lineAmounts({shippingCount:2}).total,null);
 assert.equal(values.orderAmount({orderItems:[{shippingCount:2,orderPrice:88000},{shippingCount:3,orderPrice:9000}]}),97000);
});
test('old doubled stored amounts project correctly from original raw evidence',()=>{
 const raw={shipmentBoxId:'123',orderId:'456',orderItems:[{vendorItemId:'7',shippingCount:2,orderPrice:88000,salesPrice:44000}]};
 const order={...map.mapOrder(raw),gross_amount:176000};const item={...map.mapOrderItems(raw)[0],paid_amount:176000,unit_price:88000};
 const result=unified.normalizeCoupangOrders([order],[item])[0];assert.equal(result.amount,88000);assert.equal(result.quantity,2);assert.equal(result.items[0].amount,88000);
});
test('initial order collection retains receiver encrypted, readable only with server key',()=>{
 const old=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key';
 try{const row=map.mapOrder({shipmentBoxId:'123',orderId:'456',receiver:{name:'TEST RECIPIENT',safeNumber:'05000000000',addr1:'TEST ADDRESS',postCode:'12345'},orderItems:[{orderPrice:88000,shippingCount:2}]});
 assert.equal(JSON.stringify(row).includes('TEST RECIPIENT'),false);assert.equal(JSON.stringify(row).includes('TEST ADDRESS'),false);
 assert.equal(unified.normalizeCoupangOrders([row])[0].receiver.postCode,'12345');
 process.env.SUPABASE_SERVICE_ROLE_KEY='different-test-key';assert.equal(values.storedReceiver(row.raw_data),null);
 }finally{if(old===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old;}
});
