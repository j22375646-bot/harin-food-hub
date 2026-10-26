'use strict';
// Deployment acceptance: aggregate-only stored reads. No sessions or orders are
// created and no provider collection, invoice, registration or key writes run.
const {getSupabase}=require('../lib/cafe24/supabase.js');
const {loadOrderReadModel}=require('../lib/orders/order-read-model.js');
const adapter=require('../lib/ui/phase28-adapters/orders.js');
const calendar=require('../lib/calendar/calendar-center.js');
(async()=>{
 const started=Date.now(),db=getSupabase();let timer;
 try{
  const [first,second]=await Promise.race([Promise.all([loadOrderReadModel(db),loadOrderReadModel(db)]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Read deadline')),60000);})]);
  if(first.eventResult.error||first.center.channels.some(c=>c.status==='FAILED')||second.center.orders.length!==first.center.orders.length)throw Error('Source unavailable');
  const events=first.eventResult.data.map(calendar.decorateEntry);
  const scopes=Object.fromEntries(['ACTIVE','REGISTER','IN_TRANSIT','COMPLETED'].map(stage=>[stage,adapter.buildOrderPage(first.center.orders,events,{stage,platform:'ALL'}).total]));
  console.log('MOAON_ORDER_LIST_READ '+JSON.stringify({status:'PASS',readMs:Date.now()-started,orders:first.center.orders.length,scopes,readOnly:true}));
 }finally{clearTimeout(timer);}
})().catch(()=>{console.error('MOAON_ORDER_LIST_READ_FAILED');process.exitCode=1;});
