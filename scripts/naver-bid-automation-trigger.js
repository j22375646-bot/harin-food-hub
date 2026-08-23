'use strict';

const crypto=require('node:crypto');

async function main(){
  const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');
  if(!serviceKey)throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  const token=crypto.createHash('sha256').update(`harin-naver-bid-automation\0${serviceKey}`).digest('hex');
  const response=await fetch('https://harin-cafe24-sync.vercel.app/api/cron/naver-bid-automation',{
    headers:{'x-harin-naver-bid-token':token},signal:AbortSignal.timeout(290000)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok&&response.status!==207)throw new Error(`Naver bid automation failed: HTTP ${response.status}`);
  process.stdout.write(`${new Date().toISOString()} naver bid schedules ${result.ok?'SUCCESS':'PARTIAL'} due=${Number(result.due_count||0)}\n`);
}

main().catch(error=>{console.error(`${new Date().toISOString()} ${error.message}`);process.exit(1);});
