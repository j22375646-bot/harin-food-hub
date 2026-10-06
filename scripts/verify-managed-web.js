'use strict';
// Explicit deployment-time read probe. Uses the web host's existing credentials;
// never prints secrets, creates sessions, places orders, or issues shipments.
if(process.env.MOAON_VERIFY_CONNECTIONS==='1'){
 (async()=>{
  const db=require('../lib/cafe24/supabase').getSupabase();
  const probe=require('../lib/integrations/key-probe');
  const adResult=await probe.probeNaverAds({db});
  console.log('MOAON_WEB_CONNECTION_CHECK '+JSON.stringify({provider:'NAVER_ADS',...adResult}));
  await require('../lib/coupang/operation-queue').queueOperation(db,{operationType:'MANAGED_KEY_PROBE',targetType:'CHANNEL',targetId:'NAVER',payload:{adResult},idempotencyKey:'managed-deploy-probe:'+Date.now()});
  console.log('MOAON_WEB_CONNECTION_CHECK '+JSON.stringify({provider:'CAFE24',...await probe.probe('CAFE24',{db})}));
 })().catch(()=>{console.error('MOAON_WEB_CONNECTION_CHECK_UNAVAILABLE');process.exitCode=1;});
}

// P4-152: deployment-time aggregate-only read verification. No event/order writes.
if(process.env.MOAON_VERIFY_EVENT_PERFORMANCE==='1'){
 (async()=>{
  const calendar=require('../lib/calendar/calendar-center'),date=calendar.seoulDateKey(),event={id:'read-only-verification',date:calendar.addDays(date,-7),endDate:calendar.addDays(date,-1),platforms:['NAVER','CAFE24','COUPANG']};
  const result=await require('../lib/calendar/event-performance').load(require('../lib/cafe24/supabase').getSupabase(),event);
  console.log('MOAON_EVENT_PERFORMANCE_PROBE '+JSON.stringify({status:result.status,channels:result.channels.map(c=>({key:c.key,periods:c.periods.map(p=>({status:p.status,orders:p.orders,amountKnown:p.amount!==null}))}))}));
  if(result.channels.every(c=>c.periods.every(p=>p.orders===null)))throw Error('No source verified');
 })().catch(()=>{console.error('MOAON_EVENT_PERFORMANCE_PROBE_UNAVAILABLE');process.exitCode=1;});
}
