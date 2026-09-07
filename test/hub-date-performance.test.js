'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {buildMainSalesHistory,historyMonthKeys}=require('../lib/analytics/main-sales-history.js');
const calendar=require('../lib/shipping-reference/business-calendar.js');
const {buildUnifiedOrders}=require('../lib/orders/unified-orders.js');

test('sales assigns UTC midnight boundaries to the correct Seoul month, year and leap day',()=>{
  for(const [before,after,previous,current] of [
    ['2026-08-31T14:59:59Z','2026-08-31T15:00:00Z','2026-08-31','2026-09-01'],
    ['2025-12-31T14:59:59Z','2025-12-31T15:00:00Z','2025-12-31','2026-01-01'],
    ['2024-02-28T14:59:59Z','2024-02-28T15:00:00Z','2024-02-28','2024-02-29'],
    ['2024-02-29T14:59:59Z','2024-02-29T15:00:00Z','2024-02-29','2024-03-01']
  ]){
    const result=buildMainSalesHistory({asOf:after,days:2,naverOrders:[{order_id:'before',order_date:before,paid_amount:10},{order_id:'after',order_date:after,paid_amount:20}]});
    assert.deepEqual(result.daily,[{date:previous,orders:1,revenue:10},{date:current,orders:1,revenue:20}]);
    assert.equal(calendar.dateKey(before),previous);
    assert.equal(calendar.dateKey(after),current);
    assert.deepEqual(calendar.seoulParts(after),{date:current,hour:0,minute:0});
  }
  assert.deepEqual(historyMonthKeys('2026-01-01T00:00:00+09:00',2),['2025-12','2026-01']);
});

test('invalid and null dates preserve the distinct sales and calendar contracts',()=>{
  for(const asOf of [null,'','invalid']){
    assert.equal(buildMainSalesHistory({asOf}).status,'BLOCKED');
    assert.deepEqual(historyMonthKeys(asOf),[]);
  }
  assert.equal(calendar.dateKey('invalid'),'');
  assert.equal(calendar.seoulParts('invalid'),null);
  assert.equal(calendar.dateKey(null),'1970-01-01');
  assert.deepEqual(calendar.seoulParts(null),{date:'1970-01-01',hour:9,minute:0});
  assert.equal(calendar.dateKey('2026-02-31'),'2026-02-31'); // existing date-only passthrough
  assert.deepEqual(calendar.calculateShippingEstimate({orderedAt:'invalid',asOf:'2026-09-07'}),{status:'NO_DATE',plannedShipDate:null,confidence:'BLOCKED',businessDaysLate:0});
  assert.equal(calendar.calculateCutoffSchedule({asOf:'invalid'}).confidence,'BLOCKED');
  const history=buildMainSalesHistory({asOf:'2026-09-07',naverOrders:[{order_id:'null',order_date:null,paid_amount:50},{order_id:'bad',order_date:'invalid',paid_amount:50}]});
  assert.equal(history.totalOrders,0);
  assert.equal(history.totalRevenue,null);
});

test('shipping retains inclusive 15:00, 15:01 rollover, weekends, holidays and unknown confidence',()=>{
  const base={asOf:'2026-09-07T10:00:00+09:00',holidayDates:['20260907'],holidayReady:true};
  for(const [orderedAt,plannedShipDate,beforeCutoff] of [
    ['2026-09-04T15:00:00+09:00','2026-09-04',true],
    ['2026-09-04T15:01:00+09:00','2026-09-08',false],
    ['2026-09-05T10:00:00+09:00','2026-09-08',true],
    ['2026-09-07T10:00:00+09:00','2026-09-08',true]
  ]){
    const result=calendar.calculateShippingEstimate({...base,orderedAt});
    assert.equal(result.plannedShipDate,plannedShipDate);
    assert.equal(result.beforeCutoff,beforeCutoff);
    assert.equal(result.confidence,'READY');
  }
  const partial=calendar.calculateShippingEstimate({orderedAt:'2026-09-04T15:00:00+09:00',asOf:base.asOf});
  assert.equal(partial.confidence,'PARTIAL');
  assert.equal(partial.businessDaysLate,1);
  assert.equal(calendar.calculateCutoffSchedule({asOf:'2026-09-04T15:00:00+09:00',holidayDates:base.holidayDates,holidayReady:true}).deadlineDate,'2026-09-08');
  assert.equal(calendar.calculateCutoffSchedule({asOf:'2026-09-04T14:59:00+09:00'}).deadlineDate,'2026-09-04');
});

test('unified completed history retains the Seoul 30-day boundary without mutating inputs',()=>{
  const input={asOf:'2026-09-07T10:00:00Z',businessCalendar:{holidayDates:['20260907'],holidayReady:true},naverOrders:[
    {order_id:'outside',order_date:'2026-08-08T14:59:59Z',status:'DELIVERED',paid_amount:10},
    {order_id:'boundary',order_date:'2026-08-08T15:00:00Z',status:'DELIVERED',paid_amount:20},
    {order_id:'active',order_date:'2026-08-08T14:59:59Z',status:'PAYED',paid_amount:30}
  ]};
  const original=structuredClone(input);
  const result=buildUnifiedOrders(input);
  assert.deepEqual(result.orders.map(row=>row.externalOrderId).sort(),['active','boundary']);
  assert.equal(result.summary.amount,50);
  buildMainSalesHistory(input);
  calendar.calculateShippingEstimate({orderedAt:input.naverOrders[0].order_date,asOf:input.asOf,...input.businessCalendar});
  assert.deepEqual(input,original);
});

for(const kind of ['sales','calendar','unified'])test(`${kind} formatter construction stays bounded across real builder batches`,()=>{
  // Separate process keeps instrumentation out of other tests and retains real ICU behavior.
  const program=`
    const assert=require('node:assert/strict');
    let constructions=0;
    Intl.DateTimeFormat=new Proxy(Intl.DateTimeFormat,{construct(target,args){constructions++;return Reflect.construct(target,args);}});
    const sales=require('./lib/analytics/main-sales-history.js');
    const calendar=require('./lib/shipping-reference/business-calendar.js');
    const unified=require('./lib/orders/unified-orders.js');
    const asOf='2026-09-07T10:00:00Z';
    function run(count){
      const naverOrders=Array.from({length:count},(_,i)=>({order_id:'synthetic-'+i,order_date:'2026-09-07T01:00:00Z',status:'DELIVERED',paid_amount:30}));
      if('${kind}'==='sales')assert.equal(sales.buildMainSalesHistory({asOf,naverOrders}).totalOrders,count);
      if('${kind}'==='calendar')for(const row of naverOrders){assert.equal(calendar.calculateShippingEstimate({orderedAt:row.order_date,asOf}).plannedShipDate,'2026-09-07');calendar.calculateCutoffSchedule({asOf});}
      if('${kind}'==='unified')assert.equal(unified.buildUnifiedOrders({asOf,naverOrders}).summary.total,count);
    }
    run(2);
    const warmed=constructions;
    run(120);
    assert.ok(warmed>0);
    assert.ok(warmed<=6,'fixed module formatters should need at most six constructions, got '+warmed);
    assert.equal(constructions,warmed,'formatter construction must not grow with rows or calls');
  `;
  const child=spawnSync(process.execPath,['-e',program],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  assert.equal(child.status,0,child.stderr||child.error?.message);
});
