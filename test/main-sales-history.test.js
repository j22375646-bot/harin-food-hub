'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildMainSalesHistory,historyMonthKeys}=require('../lib/analytics/main-sales-history.js');

test('recent sales history crosses a month boundary instead of dropping the previous month',()=>{
  assert.deepEqual(historyMonthKeys('2026-09-01T12:00:00+09:00',7),['2026-08','2026-09']);
  assert.deepEqual(historyMonthKeys('2026-09-10T12:00:00+09:00',7),['2026-09']);
});

test('main sales history combines channel orders without double-counting Rocket Growth',()=>{
  const history=buildMainSalesHistory({
    asOf:'2026-08-31T12:00:00+09:00',
    cafe24Orders:[
      {order_id:'c1',order_date:'2026-08-29T08:00:00+09:00',paid_amount:10_000},
      {order_id:'c2',order_date:'2026-08-30T08:00:00+09:00',paid_amount:0,raw_data:{payment_amount:20_000}},
      {order_id:'c3',order_date:'2026-08-30T09:00:00+09:00',paid_amount:39_000,raw_data:{market_id:'NCHECKOUT',order_place_id:'NCHECKOUT'}}
    ],
    naverOrders:[
      {order_id:'n1',payment_date:'2026-08-30T10:00:00+09:00',paid_amount:30_000,status:'PAYED'}
    ],
    coupangOrders:[
      {order_id:'rg1',paid_at:'2026-08-31T11:00:00+09:00',gross_amount:40_000,status:'ACCEPT'},
      {order_id:'s1',paid_at:'2026-08-31T11:30:00+09:00',gross_amount:50_000,status:'ACCEPT'},
      {order_id:'cancelled',paid_at:'2026-08-31T11:40:00+09:00',gross_amount:90_000,status:'CANCELLED'}
    ],
    coupangRgOrders:[
      {order_id:'rg1',paid_at:'2026-08-31T11:00:00+09:00',total_amount:40_000,status:'PAID'}
    ]
  });

  assert.equal(history.status,'READY');
  assert.equal(history.totalOrders,6);
  assert.equal(history.totalRevenue,189_000);
  assert.deepEqual(history.channels,['CAFE24','COUPANG','NAVER']);
  assert.equal(history.daily.find(item=>item.date==='2026-08-31').revenue,90_000);
});

test('main sales history blocks the forecast when a paid order has no usable amount',()=>{
  const history=buildMainSalesHistory({
    asOf:'2026-08-31T12:00:00+09:00',
    naverOrders:[{order_id:'n1',payment_date:'2026-08-31T10:00:00+09:00',paid_amount:null,status:'PAYED'}]
  });

  assert.equal(history.status,'BLOCKED');
  assert.equal(history.missingRevenueOrders,1);
});

test('main sales history blocks a partial date window instead of treating missing days as zero sales',()=>{
  const history=buildMainSalesHistory({
    asOf:'2026-09-01T12:00:00+09:00',sourceComplete:false,
    coupangOrders:[{order_id:'s1',paid_at:'2026-09-01T11:30:00+09:00',gross_amount:50_000,status:'ACCEPT'}]
  });
  assert.equal(history.status,'BLOCKED');
  assert.match(history.basis,/수집 범위/);
});
