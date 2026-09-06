'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadUnifiedProductPerformance}=require('../lib/products/performance.js');
function database(tables){
 const field=(row,key)=>key.split(/->>?/).reduce((value,part)=>value?.[part],row);
 return {from(table){
   assert.ok(Object.hasOwn(tables,table),`Unexpected table ${table}`);
   let rows=tables[table].map(row=>({...row}));
   const query={
    select(){return query;},
    gte(key,value){rows=rows.filter(row=>field(row,key)!=null&&Date.parse(field(row,key))>=Date.parse(value));return query;},
    lte(key,value){rows=rows.filter(row=>field(row,key)!=null&&Date.parse(field(row,key))<=Date.parse(value));return query;},
    eq(key,value){rows=rows.filter(row=>field(row,key)===value);return query;},
    is(key,value){assert.equal(value,null);rows=rows.filter(row=>row[key]==null);return query;},
    in(key,values){rows=rows.filter(row=>values.includes(row[key]));return query;},
    order(key,{ascending=true}={}){rows.sort((a,b)=>String(a[key]||'').localeCompare(String(b[key]||''))*(ascending?1:-1));return query;},
    range(from,to){rows=rows.slice(from,to+1);return query;},
    limit(size){rows=rows.slice(0,size);return query;},
    then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}
   };
   return query;
 }};
}
const input={masterProducts:[{id:'m'}],channelProducts:[{platform:'NAVER',external_product_id:'p',master_product_id:'m'}],periodStart:'2026-09-01',periodEnd:'2026-09-07'};
const tables={naver_keywords:[],naver_keyword_stats:[],coupang_ad_keyword_daily:[],naver_commerce_orders:[],naver_commerce_order_items:[],sync_logs:[]};
const coverage={status:'SUCCESS',complete:true,closed:true,source:'NAVER_COMMERCE',basis:'PAYMENT_DATE',period_start:'2026-09-01',period_end:'2026-09-07',collected_at:'2026-09-08T00:00:00Z'};
test('FIN-04 database and builder use payment date with order date only as fallback',async()=>{
 const result=await loadUnifiedProductPerformance({...input,naverCollectionEvidence:coverage,db:database({...tables,
  naver_commerce_orders:[{order_id:'paid',order_date:'2026-08-30T12:00:00+09:00',payment_date:'2026-09-01T01:00:00+09:00'},{order_id:'fallback',order_date:'2026-09-02T12:00:00+09:00',payment_date:null},{order_id:'outside',order_date:'2026-09-02T12:00:00+09:00',payment_date:'2026-09-08T12:00:00+09:00'}],
  naver_commerce_order_items:[{product_order_id:'1',order_id:'paid',product_id:'p',quantity:1,paid_amount:10000},{product_order_id:'2',order_id:'fallback',product_id:'p',quantity:1,paid_amount:20000},{product_order_id:'3',order_id:'outside',product_id:'p',quantity:1,paid_amount:50000}]
 })});
 assert.equal(result.summary.revenue,30000);
});
test('FIN-04 empty stored rows without collection coverage remain unknown',async()=>{
 const result=await loadUnifiedProductPerformance({...input,db:database(tables)});
 assert.equal(result.summary.revenue,null);
 assert.equal(result.source_readiness.NAVER,'CHECK_REQUIRED');
});
test('FIN-04 only explicit matching successful collection coverage certifies zero',async()=>{
 for(const evidence of [null,{...coverage,complete:false},{...coverage,closed:false},{...coverage,closed:undefined},{...coverage,collected_at:'2026-09-07T14:59:59.999Z'},{...coverage,basis:'CHANGED_DATE'},{...coverage,period_end:'2026-09-06'},{...coverage,collected_at:'invalid'}]){
  const result=await loadUnifiedProductPerformance({...input,db:database({...tables,sync_logs:[{platform:'NAVER',job_type:'COMMERCE_SYNC',status:'SUCCESS',finished_at:'2026-09-08',metadata:{order_coverage:evidence}}]})});
  assert.equal(result.summary.revenue,null);
 }
 const result=await loadUnifiedProductPerformance({...input,db:database({...tables,sync_logs:[{platform:'NAVER',job_type:'COMMERCE_SYNC',status:'SUCCESS',finished_at:'2026-09-08',metadata:{order_coverage:coverage}}]})});
 assert.equal(result.summary.revenue,0);
 assert.equal(result.source_readiness.NAVER,'READY');
});

test('FIN-04 dedicated payment-period certificates are consumed without changed-order sync evidence',async()=>{
 const result=await loadUnifiedProductPerformance({...input,db:database({...tables,sync_logs:[{platform:'NAVER',job_type:'COMMERCE_PAYMENT_PERIOD',status:'SUCCESS',finished_at:'2026-09-08',metadata:{order_coverage:coverage}}]})});
 assert.equal(result.summary.revenue,0);
 assert.equal(result.source_readiness.NAVER,'READY');
});

test('FIN-04 a historical success remains available behind newer failed attempts and different successful periods',async()=>{
 const older={platform:'NAVER',job_type:'COMMERCE_PAYMENT_PERIOD',status:'SUCCESS',finished_at:'2026-09-08T00:00:00Z',metadata:{order_coverage:coverage}};
 const failures=Array.from({length:40},(_,index)=>({platform:'NAVER',job_type:index%2?'COMMERCE_SYNC':'COMMERCE_PAYMENT_PERIOD',status:index%2?'FAILED':'PARTIAL',finished_at:'2026-10-09T00:00:00Z',metadata:{order_coverage:{...coverage,status:'FAILED',complete:false}}}));
 const laterPeriods=Array.from({length:40},()=>({...older,finished_at:'2026-10-08T00:00:00Z',metadata:{order_coverage:{...coverage,period_start:'2026-09-08',period_end:'2026-10-07',collected_at:'2026-10-08T00:00:00Z'}}}));
 const result=await loadUnifiedProductPerformance({...input,db:database({...tables,sync_logs:[older,...failures,...laterPeriods]})});
 assert.equal(result.summary.revenue,0);
 assert.equal(result.source_readiness.NAVER,'READY');
});
