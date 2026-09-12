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
