'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const origin=require('../lib/cafe24/order-origin.js');

test('Cafe24 official-mall Naver Pay checkout stays in the Cafe24 seller-shipping lane',()=>{
  const order={raw_data:{order_place_id:'NCHECKOUT',market_id:'NCHECKOUT',order_place_name:'네이버 페이'}};
  assert.equal(origin.orderPlaceId(order),'NCHECKOUT');
  assert.equal(origin.isCafe24StorefrontOrder(order),true);
  assert.equal(origin.isNaverPayCheckout(order),true);
  assert.equal(origin.cafe24OrderChannelLabel(order),'Cafe24 · 네이버페이');
});

test('Cafe24 open-market mirrors remain outside the official-mall lane',()=>{
  assert.equal(origin.isCafe24StorefrontOrder({raw_data:{order_place_id:'shopn'}}),false);
  assert.equal(origin.isCafe24StorefrontOrder({market_id:'shopn',raw_data:{}}),false);
  assert.equal(origin.isCafe24StorefrontOrder({raw_data:{market_id:'coupang'}}),false);
  assert.equal(origin.isCafe24StorefrontOrder({raw_data:{market_id:'SELF'}}),true);
  assert.equal(origin.isCafe24StorefrontOrder({raw_data:{market_id:'MOBILE_D'}}),true);
});
