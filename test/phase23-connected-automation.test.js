'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const readiness=require('../lib/automation/sync-readiness.js');
const syncModule=require('../lib/automation/sync-all.js');
const notificationService=require('../lib/notifications/service.js');
const telegram=require('../lib/operations-health/telegram-client.js');

const root=path.join(__dirname,'..');

test('23-6 core collection calls only providers with verified readiness',async()=>{
  const env={CAFE24_MALL_ID:'mall',CAFE24_CLIENT_ID:'id',CAFE24_CLIENT_SECRET:'secret',CAFE24_REDIRECT_URI:'https://hub/callback',NAVER_CUSTOMER_ID:'customer',NAVER_API_KEY:'key',NAVER_SECRET_KEY:'secret'};
  const calls=[];
  const result=await syncModule.syncConnectedPlatforms({
    env,cafe24Token:{access_token:'token'},evidence:{naverCommerceWorkerReady:false,coupangWorkerReady:false},now:new Date('2026-08-19T10:00:00Z'),db:{},
    syncFunctions:{
      CAFE24:async()=>{calls.push('CAFE24');return {status:'SUCCESS'};},
      NAVER_ADS:async()=>{calls.push('NAVER_ADS');return {status:'SUCCESS'};},
      NAVER_COMMERCE:async()=>{calls.push('NAVER_COMMERCE');return {queued:true};},
      COUPANG:async()=>{calls.push('COUPANG');return {queued:true};}
    }
  });
  assert.deepEqual(calls,['CAFE24','NAVER_ADS']);
  assert.equal(result.attempted_count,2);assert.equal(result.skipped_count,2);assert.equal(result.status,'SUCCESS');
  assert.equal(result.jobs.find(item=>item.name==='NAVER_COMMERCE').status,'SETUP_REQUIRED');
  assert.equal(result.channel_updates.find(item=>item.platform==='CAFE24').health_status,'READY');
  assert.equal(result.channel_updates.find(item=>item.platform==='COUPANG').health_status,'WAITING');
});

test('23-6 fixed IP worker evidence enables only its own provider queue',()=>{
  const plan=readiness.buildCoreSyncPlan({env:{},evidence:{naverCommerceWorkerReady:true,coupangWorkerReady:false}});
  assert.equal(plan.find(item=>item.name==='NAVER_COMMERCE').runnable,true);
  assert.equal(plan.find(item=>item.name==='NAVER_COMMERCE').code,'WORKER_CONNECTED');
  assert.equal(plan.find(item=>item.name==='COUPANG').runnable,false);
  assert.equal(plan.find(item=>item.name==='NAVER_ADS').runnable,false);
});

test('connected collection keeps a provider partial result visible at the top level',async()=>{
  const env={CAFE24_MALL_ID:'mall',CAFE24_CLIENT_ID:'id',CAFE24_CLIENT_SECRET:'secret',CAFE24_REDIRECT_URI:'https://hub/callback'};
  const result=await syncModule.syncConnectedPlatforms({
    env,cafe24Token:{access_token:'token'},evidence:{naverCommerceWorkerReady:false,coupangWorkerReady:false},db:{},
    syncFunctions:{CAFE24:async()=>({status:'PARTIAL',errors:[{dataset:'salesDaily',code:'APPROVAL_REQUIRED'}]})}
  });
  const cafe24=result.jobs.find(item=>item.name==='CAFE24');
  assert.equal(result.status,'PARTIAL');
  assert.equal(cafe24.ok,true);
  assert.equal(cafe24.degraded,true);
  assert.equal(result.channel_updates.find(item=>item.platform==='CAFE24').health_status,'PARTIAL');
});

function deliveryDb(){
  const rows=[];
  return {rows,from(table){assert.equal(table,'notification_deliveries');let mode='select',inserted=null,updated=null,filters=[];
    const query={
      select(){return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},in(key,values){filters.push(row=>values.includes(row[key]));return query;},limit(){return query;},
      insert(row){mode='insert';inserted={id:`delivery-${rows.length+1}`,...row};return query;},
      update(values){mode='update';updated=values;return query;},
      async maybeSingle(){const data=rows.find(row=>filters.every(filter=>filter(row)))||null;return {data,error:null};},
      async single(){
        if(mode==='insert'){
          const duplicate=inserted.dedup_key&&['PENDING','SENT'].includes(inserted.status)&&rows.some(row=>row.channel===inserted.channel&&row.dedup_key===inserted.dedup_key&&['PENDING','SENT'].includes(row.status));
          if(duplicate)return {data:null,error:{code:'23505',message:'duplicate'}};
          rows.push(inserted);return {data:inserted,error:null};
        }
        if(mode==='update'){const row=rows.find(value=>filters.every(filter=>filter(value)));if(row)Object.assign(row,updated);return {data:row||null,error:null};}
        return {data:rows.find(row=>filters.every(filter=>filter(row)))||null,error:null};
      }
    };return query;
  }};
}

test('Telegram sender posts plain operational alert to the configured chat',async()=>{
  let captured;
  const sent=await telegram.sendAlert({config:{token:'bot-token',chatId:'chat-1'},text:'중요 알림',fetchImpl:async(url,options)=>{captured={url,options};return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:77,chat:{id:'chat-1'}}})};}});
  assert.match(captured.url,/\/sendMessage$/);assert.equal(captured.options.method,'POST');
  assert.deepEqual(JSON.parse(captured.options.body),{chat_id:'chat-1',text:'중요 알림',disable_web_page_preview:true});
  assert.equal(sent.id,'77');
});

test('Telegram delivery claims the dedup key before sending and does not resend',async()=>{
  const db=deliveryDb();let sends=0;
  const options={db,env:{TELEGRAM_ALERTS_ENABLED:'true',TELEGRAM_BOT_TOKEN:'bot-token',TELEGRAM_ALERT_CHAT_ID:'chat-1',TELEGRAM_ALERT_WRITES_ENABLED:'true'},dedupKey:'ALERT:same',subject:'중요 이상징후 1건',fetchImpl:async()=>{sends+=1;return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:81,chat:{id:'chat-1'}}})};}};
  const alert={id:'alert-1',platform:'CAFE24',severity:'ERROR',title:'주문 수집 실패',message:'최근 자료를 확인해주세요.'};
  const first=await notificationService.deliverTelegramAlerts([alert],options);
  const second=await notificationService.deliverTelegramAlerts([alert],options);
  assert.equal(first.status,'SENT');assert.equal(second.status,'SKIPPED');assert.equal(sends,1);
  assert.equal(db.rows[0].status,'SENT');assert.equal(db.rows[0].channel,'TELEGRAM');
});

test('23-6 scheduled sync and dashboard use the same provider-aware result',()=>{
  const cron=fs.readFileSync(path.join(root,'app/api/cron/daily-sync/route.js'),'utf8');
  const dashboard=fs.readFileSync(path.join(root,'app/legacy-dashboard-client.js'),'utf8');
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260819193000_expand_notification_delivery_channels.sql'),'utf8');
  assert.match(cron,/syncAllPlatforms/);assert.doesNotMatch(cron,/syncCafe24\('CRON'/);assert.doesNotMatch(cron,/queueRequest\(/);
  assert.match(dashboard,/channel_updates/);assert.doesNotMatch(dashboard,/health_status:'RUNNING',latest_collection_summary:'전체 수집·검증 요청'/);
  assert.match(migration,/TELEGRAM/);assert.match(migration,/PENDING/);assert.match(migration,/channel,dedup_key/);
});
