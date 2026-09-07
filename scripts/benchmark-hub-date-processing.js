'use strict';

// Synthetic CPU benchmark only: no database, network, or personal order data.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {buildMainSalesHistory}=require('../lib/analytics/main-sales-history.js');
const {buildUnifiedOrders}=require('../lib/orders/unified-orders.js');
const {calculateShippingEstimate,calculateCutoffSchedule}=require('../lib/shipping-reference/business-calendar.js');

const asOf='2026-09-07T10:00:00Z';
const orders=count=>Array.from({length:count},(_,index)=>({order_id:`SYNTHETIC-${index}`,order_date:'2026-09-07T01:00:00Z',status:'PAYED',paid_amount:30000}));
const mainInput={asOf,naverOrders:orders(2000)};
const unifiedInput={asOf,naverOrders:orders(1000)};
const completedInput={asOf,naverOrders:orders(1000).map(row=>({...row,status:'DELIVERED'}))};
const shippingInputs=Array.from({length:2000},(_,index)=>({orderedAt:index%2?'2026-09-04T06:01:00Z':'2026-09-04T06:00:00Z',asOf,holidayDates:['20260907'],holidayReady:true}));
const cases=[
  {name:'mainSalesHistory',rows:2000,run:()=>buildMainSalesHistory(mainInput)},
  {name:'unifiedPaidOrders',rows:1000,run:()=>buildUnifiedOrders(unifiedInput)},
  {name:'unifiedCompletedOrders',rows:1000,run:()=>buildUnifiedOrders(completedInput)},
  {name:'shippingCalendar',rows:2000,run:()=>({estimates:shippingInputs.map(calculateShippingEstimate),cutoff:calculateCutoffSchedule({asOf,holidayDates:['20260907'],holidayReady:true})})}
];

function benchmark(){
  return {node:process.version,platform:process.platform,asOf,samples:5,provenance:'Deterministic synthetic production-function CPU benchmark; not live navigation timing',results:cases.map(({name,rows,run})=>{
    let reference;
    const elapsedMs=Array.from({length:5},()=>{
      const start=performance.now();
      const output=run();
      const elapsed=performance.now()-start;
      if(reference===undefined)reference=output;
      else assert.deepEqual(output,reference,`${name} changed output between samples`);
      return Number(elapsed.toFixed(3));
    });
    return {name,rows,elapsedMs,sha256:createHash('sha256').update(JSON.stringify(reference)).digest('hex'),summary:reference.summary||{totalOrders:reference.totalOrders,totalRevenue:reference.totalRevenue}};
  })};
}

if(require.main===module)console.log(JSON.stringify(benchmark(),null,2));
module.exports={benchmark};
