'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/operations-health/config.js');
const github=require('../lib/operations-health/github-release-client.js');
const uptime=require('../lib/operations-health/uptimerobot-client.js');
const telegram=require('../lib/operations-health/telegram-client.js');
const resend=require('../lib/operations-health/resend-client.js');
const readiness=require('../lib/operations-health/readiness.js');

const root=path.join(__dirname,'..');

test('phase 20-4 credentials stay provider-owned and external writes remain locked by default',()=>{
  const env={GITHUB_RELEASE_TOKEN:'github-secret',UPTIMEROBOT_READ_ONLY_API_KEY:'uptime-secret',TELEGRAM_BOT_TOKEN:'telegram-secret',TELEGRAM_ALERT_CHAT_ID:'chat-id',RESEND_API_KEY:'resend-secret',REPORT_FROM_EMAIL:'Harin <reports@example.com>'};
  const githubConfig=config.providerConfig('GITHUB_RELEASES',env);const uptimeConfig=config.providerConfig('UPTIMEROBOT',env);const telegramConfig=config.providerConfig('TELEGRAM_BOT',env);const resendConfig=config.providerConfig('RESEND',env);
  assert.equal(githubConfig.token,'github-secret');assert.equal(Object.hasOwn(githubConfig,'apiKey'),false);
  assert.equal(uptimeConfig.apiKey,'uptime-secret');assert.equal(Object.hasOwn(uptimeConfig,'token'),false);
  assert.equal(telegramConfig.token,'telegram-secret');assert.equal(telegramConfig.writesEnabled,false);
  assert.equal(resendConfig.apiKey,'resend-secret');assert.equal(resendConfig.writesEnabled,false);
});

test('GitHub probe stores release metadata without release body or token',async()=>{
  const calls=[];const payloadFor=url=>url.includes('/tags?')?[{name:'v1.20.2',commit:{sha:'abcdef1234567890'}}]:url.includes('/releases?')?[{tag_name:'v1.20.2',name:'Phase 20-3',published_at:'2026-08-18T01:05:00Z',body:'must not persist'}]:{private:true,default_branch:'main',pushed_at:'2026-08-18T01:00:00Z'};
  const result=await github.probe({config:{owner:'j22375646-bot',repo:'harin-food-hub',token:'top-secret'},fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>payloadFor(url)};}});
  assert.equal(result.status,'SUCCESS');assert.equal(result.metricSummary.latest_tag,'v1.20.2');assert.equal(result.metricSummary.latest_tag_sha,'abcdef1234567890');
  assert.equal(result.metricSummary.latest_release_name,'Phase 20-3');assert.equal(Object.hasOwn(result.metricSummary,'body'),false);assert.doesNotMatch(JSON.stringify(result),/top-secret/);
  assert.equal(calls.every(call=>call.options.headers.Authorization==='Bearer top-secret'),true);
});

test('UptimeRobot read-only probe finds the fixed production URL and reports external downtime honestly',async()=>{
  const result=await uptime.probe({config:{apiKey:'uptime-secret',publicUrl:'https://harin-cafe24-sync.vercel.app/'},fetchImpl:async(url,options)=>{assert.equal(new URL(url).searchParams.get('limit'),'50');assert.equal(options.headers.Authorization,'Bearer uptime-secret');return {ok:true,status:200,json:async()=>({data:[{friendlyName:'Harin Hub',url:'https://harin-cafe24-sync.vercel.app',status:'DOWN'},{friendlyName:'Other',url:'https://example.com',status:'UP'}]})};}});
  assert.equal(result.status,'PARTIAL');assert.equal(result.metricSummary.target_found,true);assert.equal(result.metricSummary.target_status,'DOWN');assert.equal(result.metricSummary.down,1);
});

test('Telegram and Resend probes verify readiness without sending anything',async()=>{
  let telegramCall,resendCall;
  const bot=await telegram.probe({config:{token:'bot-token'},fetchImpl:async(url,options)=>{telegramCall={url,options};return {ok:true,status:200,json:async()=>({ok:true,result:{id:123,is_bot:true,username:'harin_ops_bot'}})};}});
  const mail=await resend.probe({config:{apiKey:'resend-token'},fetchImpl:async(url,options)=>{resendCall={url,options};return {ok:true,status:200,json:async()=>({data:[{name:'harinfood.co.kr',status:'verified',capabilities:{sending:'enabled'}}]})};}});
  assert.match(telegramCall.url,/\/getMe$/);assert.equal(telegramCall.options.method,undefined);assert.equal(bot.metricSummary.bot_username,'harin_ops_bot');
  assert.equal(resendCall.url,'https://api.resend.com/domains');assert.equal(resendCall.options.headers.Authorization,'Bearer resend-token');assert.equal(mail.status,'SUCCESS');
});

test('release and alert readiness preserves one provider success when another fails',()=>{
  const env={GITHUB_RELEASE_TOKEN:'github',UPTIMEROBOT_READ_ONLY_API_KEY:'uptime',TELEGRAM_BOT_TOKEN:'telegram',TELEGRAM_ALERT_CHAT_ID:'chat',RESEND_API_KEY:'resend',REPORT_FROM_EMAIL:'Harin <reports@example.com>',PUBLIC_APP_URL:'https://harin-cafe24-sync.vercel.app'};
  const center=readiness.buildOperationsHealth({env,snapshots:[{provider:'GITHUB_RELEASES',status:'SUCCESS',fetched_at:'2026-08-18T02:00:00Z',metric_summary:{latest_tag:'v1.20.2',release_count:3}},{provider:'UPTIMEROBOT',status:'FAILED',fetched_at:'2026-08-18T02:01:00Z',error_message:'rate limit'}]});
  assert.equal(center.services.find(item=>item.key==='github').status,'READY');assert.equal(center.services.find(item=>item.key==='uptimerobot').status,'FAILED');
  assert.equal(center.services.find(item=>item.key==='telegram').capabilities.at(-1).writeStatus,'LOCKED');
});

test('phase 20-4 UI, protected routes, migration and deferred environment checklist are present',()=>{
  const ui=fs.readFileSync(path.join(root,'app/operations-health-center.js'),'utf8');const css=fs.readFileSync(path.join(root,'app/_reliability/harin-naver-api-center.css'),'utf8');const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260818103000_expand_operations_health_providers.sql'),'utf8');
  assert.match(ui,/릴리스·외부 감시·알림/);assert.match(ui,/operationsHealthHighlights/);assert.match(css,/operationsReleaseGrid/);
  for(const name of ['github','uptimerobot','telegram','resend']){const source=fs.readFileSync(path.join(root,`app/api/operations-health/${name}/probe/route.js`),'utf8');assert.match(source,/handleProbe/);}
  for(const key of ['GITHUB_RELEASE_TOKEN','UPTIMEROBOT_READ_ONLY_API_KEY','TELEGRAM_BOT_TOKEN','TELEGRAM_ALERT_WRITES_ENABLED=false','RESEND_ALERT_WRITES_ENABLED=false'])assert.match(env,new RegExp(key));
  for(const provider of ['GITHUB_RELEASES','UPTIMEROBOT','TELEGRAM_BOT','RESEND'])assert.match(migration,new RegExp(provider));
});

test('manual operations-health probes store provider snapshots without the automatic request ledger',()=>{
  const source=fs.readFileSync(path.join(root,'lib/operations-health/route-handler.js'),'utf8');
  assert.match(source,/readiness\.probeProvider\(provider,\{db\}\)/);assert.doesNotMatch(source,/protectedRead|provider_request_runs/);
});
