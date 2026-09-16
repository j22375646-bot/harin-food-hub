const test=require('node:test'),assert=require('node:assert/strict');
const cards=require('../lib/assistant/briefing-card.js'),{telegram}=require('../lib/assistant/bots.js');
const body='모아온 업무비서 브리핑\n네이버 · 발급 전 0건 / 배송대기 확인 필요\n쿠팡 · 미답변 1건\n조회: 2026-09-16 09:00 KST\n모아온 저장 자료 기준 · 원본 수집 시각 확인 필요';
test('Korean card preserves unknowns, zero and channels and produces bounded PNG',async()=>{
 const model=cards.model(body,'WORK');assert.ok(model.rows.includes('네이버 · 발급 전 0건 / 배송대기 확인 필요'));assert.ok(model.rows.includes('쿠팡 · 미답변 1건'));assert.equal(model.clipped,false);
 const png=await cards.render(body,'WORK');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),model.height);assert.ok(png.length<2000000);
 assert.throws(()=>cards.model(body,'INVALID'));assert.throws(()=>cards.model('x'.repeat(3901),'WORK'));
 const long=cards.model(Array(40).fill('긴 내용'.repeat(40)).join('\n').slice(0,3900),'AD');assert.equal(long.clipped,true);assert.ok(long.height<=5000);assert.ok(long.extra.length<=8);
});
test('mobile card combines channels without inventing zeroes and removes duplicate title',()=>{
 const m=cards.model('모아온 시험 브리핑\n모아온 업무비서 브리핑\n네이버 · 발급 전 1건 / 배송대기 0건\n네이버 · 미답변 2건\n쿠팡 · 미답변 확인 필요\n키 발급자 업무 · 오늘 마감 3건 / 기한 초과 0건\n조회: 2026-09-16T04:01:53.339Z','WORK');
 assert.equal(m.badge,'시험 발송');assert.equal(m.channels.length,2);assert.deepEqual(m.channels[0],{name:'네이버',orders:'1건',shipping:'0건',cs:'2건'});assert.equal(m.channels[1].orders,undefined);assert.equal(m.channels[1].cs,'확인 필요');assert.equal(m.extra.length,0);assert.equal(m.tasks.today,'3건');assert.equal(m.time,'9월 16일 (수) 13:01 · 한국 시간');
 const solo=cards.model('모아온 개인비서 브리핑\n키 발급자 업무 · 오늘 마감 확인 필요 / 기한 초과 0건','SOLO');assert.equal(solo.channels.length,0);assert.equal(solo.tasks.today,'확인 필요');
 const ad=cards.model('광고비서 리포트 완료\n광고비 확인 필요원 · 클릭 0\n전환 2 · ROAS 확인 필요%\n자료 상태: PARTIAL','AD');assert.deepEqual(ad.metrics.map(x=>x.value),['확인 필요','0','2','확인 필요']);assert.equal(ad.notes[0],'일부 일자·지표는 확인이 필요해요.');
});
test('photo keeps action markup and short caption; rendering failure falls back once',async()=>{
 const calls=[],args={token:'test',chatId:'123',text:body,slot:'WORK',markup:{inline_keyboard:[[{text:'다시 알림',callback_data:'moa:S:id'}]]},telegram:async(...a)=>calls.push(a)};
 await cards.send({...args,renderer:async()=>Buffer.from('png')});assert.equal(calls[0][1],'sendPhoto');assert.deepEqual(calls[0][2].reply_markup,args.markup);assert.ok(!calls[0][2].caption.includes('미답변 1건'));
 calls.length=0;await cards.send({...args,renderer:async()=>{throw Error('render');}});assert.equal(calls.length,1);assert.equal(calls[0][1],'sendMessage');assert.equal(calls[0][2].text,body);
});
test('uncertain photo send never causes a second text notification',async()=>{
 let calls=0;await assert.rejects(cards.send({token:'test',chatId:'123',text:body,slot:'WORK',renderer:async()=>Buffer.from('png'),telegram:async()=>{calls++;throw Error('network timeout');}}));assert.equal(calls,1);
});
test('Telegram photo is multipart with markup and never a JSON encoded Buffer',async()=>{
 const token='123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';let called=false;
 await telegram(token,'sendPhoto',{chat_id:'123',photo:Buffer.from('png'),caption:'시험',reply_markup:{inline_keyboard:[]}},async(url,opts)=>{called=true;assert.ok(url.endsWith('/sendPhoto'));assert.ok(opts.body instanceof FormData);assert.equal(opts.headers['content-type'],undefined);assert.equal(await opts.body.get('photo').text(),'png');assert.equal(opts.body.get('reply_markup'),'{"inline_keyboard":[]}');return {ok:true,text:async()=>JSON.stringify({ok:true,result:{message_id:123}})};});assert.equal(called,true);
});
test('render endpoint rejects unapproved worker keys before rendering',async()=>{
 const {handler}=require('../lib/assistant/automation.js');const {valid}=require('../desktop/assistant-automation-contract.cjs');const input={action:'CARD_RENDER',slot:'WORK',body};assert.equal(valid(input,true),true);assert.equal(valid(input,false),false);assert.equal(valid({...input,url:'https://outside'},true),false);
 let auth=0;const response=await handler({worker:true,database:()=>({rpc:async(name,p)=>{auth++;assert.equal(name,'moaon_assistant_automation');assert.equal(p.p_input.action,'CONFIG');return {error:{message:'AUTH_REQUIRED'}};}})})(new Request('https://harin-cafe24-sync.vercel.app/api/moaon/assistant/worker',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer moaon_ro_'+'a'.repeat(43)},body:JSON.stringify(input)}));assert.equal(response.status,401);assert.equal(auth,1);
});

test('management and study get role headings and metric tiles',async()=>{for(const [slot,text] of [['SUP','관리 브리핑\n연결 확인 필요 · 2건\n발송 실패 · 24시간 · 1건'],['STUDY','학습 브리핑\n검토 대기 · 3건\n공유 지식 · 7건']]){const card=require('../lib/assistant/briefing-card.js');const m=card.model(text,slot);assert.equal(m.metrics.length,2);assert.equal(m.channels.length,0);const png=await card.render(text,slot);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}});
