'use strict';

const crypto=require('node:crypto');

async function main(){
  const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if(!serviceKey)throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  const token=crypto.createHash('sha256').update(`harin-hourly-orders\0${serviceKey}`).digest('hex');
  const response=await fetch('https://harin-cafe24-sync.vercel.app/api/cron/hourly-orders',{
    headers:{'x-harin-hourly-token':token}, signal:AbortSignal.timeout(110000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`Hourly order collection failed: HTTP ${response.status}`);
  process.stdout.write(`${new Date().toISOString()} hourly orders ${result.ok?'SUCCESS':'PARTIAL'}\n`);
}

main().catch(error=>{console.error(`${new Date().toISOString()} ${error.message}`);process.exit(1);});
