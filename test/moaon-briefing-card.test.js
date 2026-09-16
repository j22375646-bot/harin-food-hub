const test=require('node:test'),assert=require('node:assert/strict');
const cards=require('../lib/assistant/briefing-card.js'),{telegram}=require('../lib/assistant/bots.js');
const body='모아온 업무비서 브리핑\n네이버 · 발급 전 0건 / 배송대기 확인 필요\n쿠팡 · 미답변 1건\n조회: 2026-09-16 09:00 KST\n모아온 저장 자료 기준 · 원본 수집 시각 확인 필요';
test('Korean card preserves unknowns, zero and channels and produces bounded PNG',async()=>{
 const model=cards.model(body,'WORK');assert.ok(model.rows.includes('네이버 · 발급 전 0건 / 배송대기 확인 필요'));assert.ok(model.rows.includes('쿠팡 · 미답변 1건'));assert.equal(model.clipped,false);
 const png=await cards.render(body,'WORK');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),model.height);assert.ok(png.length<2000000);
 assert.throws(()=>cards.model(body,'SUP'));assert.throws(()=>cards.model('x'.repeat(3901),'WORK'));
 const long=cards.model(Array(40).fill('긴 내용'.repeat(40)).join('\n').slice(0,3900),'AD');assert.equal(long.clipped,true);assert.ok(long.height<=4200);
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
