'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMonthlyRevenue, fetchMonthlyRevenue } = require('../lib/analytics/monthly-revenue.js');

test('monthly revenue uses every channel, removes marketplace mirrors, cancellations, and Coupang duplicates', () => {
  const result = calculateMonthlyRevenue({
    cafe24Orders:[
      { order_id:'cafe', paid_amount:100_000, raw_data:{ market_id:'self' } },
      { order_id:'cafe-naver-pay', paid_amount:39_000, raw_data:{ market_id:'NCHECKOUT', order_place_id:'NCHECKOUT' } },
      { order_id:'mirror', paid_amount:900_000, raw_data:{ market_id:'naver' } },
      { order_id:'cancelled', paid_amount:50_000, payment_status:'CANCELLED', raw_data:{ market_id:'self' } }
    ],
    naverOrders:[
      { order_id:'naver', paid_amount:70_000, status:'PURCHASE_DECIDED' },
      { order_id:'naver-cancelled', paid_amount:30_000, status:'CANCELED' }
    ],
    coupangOrders:[
      { order_id:'shared', gross_amount:50_000, status:'FINAL_DELIVERY' },
      { order_id:'seller', gross_amount:40_000, status:'FINAL_DELIVERY' },
      { order_id:'seller-cancelled', gross_amount:20_000, status:'CANCELLED' }
    ],
    coupangRgOrders:[
      { order_id:'shared', total_amount:60_000, status:null }
    ]
  });

  assert.deepEqual(result.totals, {
    CAFE24:139_000,
    NAVER:70_000,
    COUPANG:100_000,
    ALL:309_000
  });
  assert.equal(result.status, 'READY');
});

test('monthly revenue keeps the all-channel total unavailable when one source failed', () => {
  const result = calculateMonthlyRevenue({
    cafe24Orders:[{ order_id:'cafe', paid_amount:100_000, raw_data:{ market_id:'self' } }],
    naverOrders:[],
    coupangOrders:[],
    coupangRgOrders:[],
    availability:{ CAFE24:true, NAVER:false, COUPANG:true, COUPANG_RG:true }
  });

  assert.equal(result.totals.CAFE24, 100_000);
  assert.equal(result.totals.NAVER, null);
  assert.equal(result.totals.ALL, null);
  assert.equal(result.status, 'PARTIAL');
});

test('monthly revenue pages through more than the first 1000 orders', async () => {
  const tables={
    cafe24_orders:[],naver_commerce_orders:[],coupang_orders:[],
    coupang_rg_orders:Array.from({length:1105},(_,index)=>({order_id:`RG-${index}`,status:'',paid_at:'2026-08-20T00:00:00+09:00',total_amount:10}))
  };
  const db={from(table){
    const rows=tables[table]||[];
    const query={
      select(){return query;},gte(){return query;},lt(){return query;},order(){return query;},
      range(from,to){return Promise.resolve({data:rows.slice(from,to+1),error:null,count:rows.length});}
    };
    return query;
  }};
  const result=await fetchMonthlyRevenue(db,'2026-08');
  assert.equal(result.counts.COUPANG_RG,1105);
  assert.equal(result.totals.COUPANG,11050);
  assert.equal(result.totals.ALL,11050);
});

test('monthly revenue can retain the fetched source rows for the server-only cashflow calculation',async()=>{
  const tables={
    cafe24_orders:[{order_id:'C-1',paid_amount:1000,raw_data:{market_id:'self'}}],
    naver_commerce_orders:[],coupang_orders:[],coupang_rg_orders:[]
  };
  const db={from(table){
    const rows=tables[table]||[];
    const query={
      select(){return query;},gte(){return query;},lt(){return query;},order(){return query;},
      range(from,to){return Promise.resolve({data:rows.slice(from,to+1),error:null,count:rows.length});}
    };
    return query;
  }};

  const result=await fetchMonthlyRevenue(db,'2026-08',{includeSourceRows:true});
  assert.equal(result.sourceRows.CAFE24[0].order_id,'C-1');
  assert.equal(result.sourceRows.NAVER.length,0);
});
