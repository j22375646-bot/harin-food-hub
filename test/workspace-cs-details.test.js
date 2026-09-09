'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {seal}=require('../lib/coupang/operation-queue.js');
const {csDetails}=require('../lib/dashboard/workspace-cs-details.js');
const secret='fixture-cs-details';
test('CS decrypts only display fields and never exposes source envelopes or internal data',()=>{
 const d=csDetails({platform:'NAVER',content_envelope:seal({value:'고객 문의',private:'SECRET'},secret),title_envelope:seal({value:'제목'},secret),raw_data:{private:'SECRET'}},{secret});
 assert.equal(d.body,'고객 문의');assert.equal(d.title,'제목');assert.equal(d.status,'AVAILABLE');assert.doesNotMatch(JSON.stringify(d),/SECRET|envelope|A256GCM/);
 assert.equal(csDetails({platform:'CAFE24',content_envelope:seal({value:'본문'},secret)},{secret:'wrong'}).status,'UNAVAILABLE');
 assert.equal(csDetails({platform:'NAVER'}).status,'MISSING');
});
test('CS online and encrypted call-center history retain missing dates and disclose truncation',()=>{
 assert.equal(csDetails({inquiry_type:'ONLINE',question_text:'온라인 문의'}).body,'온라인 문의');
 const d=csDetails({inquiry_type:'CALL_CENTER',thread_envelope:seal({content:'가'.repeat(2001),conversation:Array.from({length:6},(_,i)=>({content:String(i)+'나'.repeat(1000),replyAt:i===5?'bad':'2026-09-10'}))},secret)},{secret});
 assert.equal(d.body.length,2000);assert.equal(d.history.length,5);assert.equal(d.history[0].content[0],'1');assert.equal(d.history[4].occurredAt,null);assert.equal(d.truncated,true);
 assert.equal(csDetails({inquiry_type:'CALL_CENTER',question_text:'상담이력'}).status,'MISSING');
});
test('Supabase query selects only explicit detail fields, including encrypted thread JSON path',async()=>{
 const {createClient}=require('@supabase/supabase-js');const calls=[];
 const db=createClient('https://fixture.supabase.co','fixture',{global:{fetch:async(url)=>{calls.push(new URL(url));return Response.json([]);}}});
 await require('../lib/dashboard/workspace-cs-loader.js').loadWorkspaceCs({db,includeDetails:true});
 assert.equal(calls.length,4);const q=calls.find(u=>u.pathname.endsWith('coupang_inquiries')).searchParams;
 assert.match(q.get('select'),/thread_envelope:raw_data->cs_thread_encrypted/);assert.ok(!q.get('select').split(',').includes('raw_data'));assert.equal(q.get('limit'),'201');
});
