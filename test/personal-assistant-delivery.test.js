'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {tick,buildText,workText,roleText,adText,latestAd}=require('../lib/assistant/personal-delivery.js');
const {cipher,TENANT}=require('../lib/integrations/managed-keys.js');
const env={MOAON_MANAGED_KEY:Buffer.alloc(32,17).toString('base64')},token='123456789:'+ 'A'.repeat(35);
const now=new Date('2026-09-17T01:00:00Z');
function harness({send=async()=>({message_id:1}),renderCard=async()=>Buffer.from('png'),resultFailure=false}={}){
 const job={id:'opaque-delivery',userId:'recipient-user',slot:'SOLO',revision:3,botRevision:2,kind:'SCHEDULE',chatId:'12345'},calls=[],sent=[],claims=new Set();
 const bot={slot:'SOLO',revision:2,envelope:cipher(env).seal({tenantId:TENANT,provider:'TELEGRAM_SOLO',revision:2},{token})};
 const db={rpc:async(name,p)=>{calls.push({name,...p});const x=p.p_input;
  if(x.action==='PREF_DUE')return {data:{jobs:[job]}};
  if(x.action==='PREF_CLAIM'){if(claims.has(x.id))return {data:{claimed:false}};claims.add(x.id);return {data:{claimed:true,userId:job.userId,slot:job.slot,chatId:job.chatId,bot}};}
  if(x.action==='PREF_RESULT')return resultFailure?{error:{message:'offline'}}:{data:{saved:true}};
  throw Error('Unexpected RPC');}};
 const run=()=>tick({db,digest:'worker-hash',env,now,renderCard,build:async({delivery})=>'모아온 개인비서 브리핑\n내 업무 · '+delivery.userId,send:async(...a)=>{sent.push(a);return send(...a);}});
 return {run,job,bot,calls,sent};
}
test('personal claims are consumed once and only bound chat receives a card with public production link',async()=>{
 const h=harness();assert.deepEqual(await h.run(),{processed:1,sent:1,failed:0,unknown:0});await h.run();assert.equal(h.sent.length,1);
 const [key,method,payload]=h.sent[0];assert.equal(key,token);assert.equal(method,'sendPhoto');assert.equal(payload.chat_id,'12345');
 assert.deepEqual(payload.reply_markup,{inline_keyboard:[[{text:'모아온에서 확인',url:'https://harin-cafe24-sync.vercel.app'}]]});
 const claim=h.calls.find(c=>c.p_input.action==='PREF_CLAIM');assert.equal(claim.p_input.revision,3);assert.equal(claim.p_input.botRevision,2);
 const result=h.calls.find(c=>c.p_input.action==='PREF_RESULT');assert.deepEqual(result.p_input,{action:'PREF_RESULT',userId:'recipient-user',slot:'SOLO',id:'opaque-delivery',status:'SENT'});
});
test('Telegram timeout records UNKNOWN with no second send or text fallback',async()=>{
 const h=harness({send:async()=>{throw Object.assign(Error('timeout'),{code:'BOT_UNKNOWN'});}});assert.equal((await h.run()).unknown,1);await h.run();assert.equal(h.sent.length,1);assert.equal(h.sent[0][1],'sendPhoto');
});
test('definite rejection is FAILED; renderer failure falls back before first request',async()=>{
 const rejected=harness({send:async()=>{throw Object.assign(Error('blocked'),{code:'BOT_REJECTED'});}});assert.equal((await rejected.run()).failed,1);
 const fallback=harness({renderCard:async()=>{throw Error('font missing');}});assert.equal((await fallback.run()).sent,1);assert.equal(fallback.sent.length,1);assert.equal(fallback.sent[0][1],'sendMessage');
});
test('result persistence failure cannot cause resend of consumed claim',async()=>{
 const h=harness({resultFailure:true});await assert.rejects(h.run(),/ASSISTANT_UNAVAILABLE/);await h.run();assert.equal(h.sent.length,1);
});
test('mismatched bot credential or group binding never sends',async()=>{
 for(const mutate of [h=>{h.bot.slot='WORK';},h=>{h.job.chatId='-100999';}]){const h=harness();mutate(h);assert.equal((await h.run()).failed,1);assert.equal(h.sent.length,0);}
});
test('WORK/SOLO loader uses recipient context; unavailable and false counts stay unknown',async()=>{
 let context;const data={retrievedAt:now.toISOString(),sources:{orders:{channels:[{platform:'NAVER',status:'READY',counts:{ACTIVE:2,REGISTER:0}},{platform:'COUPANG',status:'UNAVAILABLE',counts:{ACTIVE:0,REGISTER:0}}]},tasks:{status:'READY',scope:'ASSIGNED_TO_ME',counts:{dueToday:3,overdue:false}},cs:{status:'PARTIAL',channels:[{platform:'NAVER',unanswered:0}]}}};
 const text=await buildText({db:{},digest:'issuer-key',delivery:{slot:'SOLO',userId:'recipient',scopes:['orders','cs','tasks','reports']},now,load:async p=>{context=p.context;return data;}});
 assert.deepEqual(context,{tenantId:TENANT,userId:'recipient'});assert.match(text,/네이버 · 발급 전 2건 \/ 배송대기 0건/);assert.match(text,/쿠팡 · 발급 전 확인 필요/);assert.match(text,/내 업무 · 오늘 마감 3건 \/ 기한 초과 확인 필요/);assert.match(text,/네이버 · 미답변 확인 필요/);assert.doesNotMatch(text,/키 발급자/);
 const missing=workText(null,'WORK');assert.match(missing,/카페24 · 발급 전 확인 필요/);assert.doesNotMatch(missing,/0건/);
});
test('task counts without own-assignee scope are omitted as unknown',()=>{
 const text=workText({sources:{tasks:{status:'READY',scope:'ALL',counts:{dueToday:9,overdue:8}}}},'SOLO');assert.match(text,/내 업무 · 오늘 마감 확인 필요 \/ 기한 초과 확인 필요/);assert.doesNotMatch(text,/9건|8건/);
});
test('role sources preserve unknown, disabled, and future health timestamps accurately',()=>{
 assert.match(roleText(null,'STUDY',now),/공유 지식 자료 확인 필요/);assert.doesNotMatch(roleText(null,'STUDY',now),/공유 꺼짐/);
 assert.match(roleText({knowledgeEnabled:false},'STUDY',now),/공유 꺼짐/);
 const unknown=roleText(null,'SUP',now);assert.match(unknown,/연결 확인 필요 · 확인 필요/);assert.match(unknown,/발송 실패 · 24시간 · 확인 필요/);
 const future=roleText({bots:[{slot:'WORK',enabled:true,status:'RUNNING',checkedAt:'2099-01-01T00:00:00Z'}]},'SUP',now);assert.match(future,/업무비서 · 확인 필요/);assert.doesNotMatch(future,/업무비서 · 실행 확인/);
});
test('AD reuses stored report, labels original period and source age, rejects nonnumeric metrics',async()=>{
 const report={period_start:'2026-09-01',period_end:'2026-09-07',summary_json:{sourceAsOf:'2026-09-16T01:00:00Z',status:'PARTIAL',metrics:{cost:0,clicks:false,conversions:null,roas:1.5}}};
 let reads=0;const text=await buildText({db:{},delivery:{slot:'AD',scopes:['reports']},now,loadAd:async()=>{reads++;return report;}});
 assert.equal(reads,1);assert.match(text,/원본 집계 기간: 2026-09-01 ~ 2026-09-07/);assert.match(text,/자료 경과: 24시간/);assert.match(text,/광고비 0원 · 클릭 확인 필요/);assert.match(text,/전환 확인 필요 · ROAS 1.5%/);assert.match(text,/API를 다시 조회하지 않았습니다/);assert.match(adText(null,now),/저장된 광고 리포트 확인 필요/);
});
test('stored AD query restricts successful advertising reports and never invokes provider collection',async()=>{
 const calls=[];const q={};for(const key of ['select','eq','contains','order'])q[key]=(...args)=>{calls.push([key,...args]);return q;};q.limit=async n=>{calls.push(['limit',n]);return {data:[{summary_json:{}}]};};
 await latestAd({db:{from:name=>{assert.equal(name,'reports');return q;}}});assert.ok(calls.some(x=>x[0]==='eq'&&x[1]==='status'&&x[2]==='FINAL'));assert.ok(calls.some(x=>x[0]==='contains'&&x[1]==='summary_json'&&x[2].advertisingAssistant===true));assert.deepEqual(calls.at(-1),['limit',1]);
});
test('new orders use only claimed channel aggregates and do not read another summary',async()=>{
 const text=await buildText({delivery:{slot:'WORK',kind:'NEW_ORDER',scopes:['orders'],groups:[{platform:'NAVER',count:3},{platform:'COUPANG',count:false}]},load:async()=>{throw Error('must not load');}});
 assert.match(text,/네이버 · 신규 주문 3건/);assert.match(text,/쿠팡 · 신규 주문 확인 필요/);assert.doesNotMatch(text,/카페24|0건|업무 · 오늘 마감/);
});
test('preference change for one due member does not block the next member',async()=>{
 const calls=[],db={rpc:async(_,p)=>{const x=p.p_input;calls.push(x);if(x.action==='PREF_DUE')return {data:{jobs:[{id:'stale'},{id:'next'}]}};if(x.id==='stale')return {error:{message:'ASSISTANT_CONFLICT'}};return {data:{claimed:false}};}};
 await tick({db,digest:'hash',send:async()=>assert.fail('no claim')});assert.ok(calls.some(c=>c.action==='PREF_CLAIM'&&c.id==='next'));
});
test('restricted worker scopes constrain reads and exclude unrequested returned sources',async()=>{
 let scopes;const text=await buildText({delivery:{slot:'WORK',userId:'recipient',scopes:['cs']},load:async p=>{scopes=p.scopes;return {sources:{orders:{channels:[{platform:'NAVER',status:'READY',counts:{ACTIVE:91}}]},tasks:{status:'READY',scope:'ASSIGNED_TO_ME',counts:{dueToday:92}},cs:{status:'READY',channels:[{platform:'NAVER',unanswered:3}]}}};}});
 assert.deepEqual(scopes,['cs']);assert.match(text,/네이버 · 미답변 3건/);assert.match(text,/내 업무 · 오늘 마감 확인 필요/);assert.doesNotMatch(text,/91건|92건/);
 for(const slot of ['WORK','SOLO','AD']){let reads=0;const value=await buildText({delivery:{slot,userId:'recipient'},load:async()=>{reads++;},loadAd:async()=>{reads++;},now});assert.equal(reads,0);assert.match(value,/확인 필요/);}
 const denied=await buildText({delivery:{slot:'WORK',kind:'NEW_ORDER',scopes:['cs'],groups:[{platform:'NAVER',count:98}]}});assert.doesNotMatch(denied,/98건/);assert.match(denied,/신규 주문 자료 확인 필요/);
});
