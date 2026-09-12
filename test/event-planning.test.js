'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const calendar=require('../lib/calendar/calendar-center.js');
const {compactOrders}=require('../lib/ui/phase28-adapters/orders.js');
const {validCalendarDraft,projectMonth}=require('../desktop/today-calendar.cjs');
const draft={type:'EVENT',title:'가을 기획',body:'행사 안내',date:'2026-09-14',endDate:'2026-09-20',time:'',eventColor:'VIOLET',platforms:['NAVER','CAFE24'],plan:{stage:'READY',goal:'100건',audience:'재구매',benefit:'차 증정',preparation:'재고 확인',review:''},giftTiers:[{minimumAmount:30000,maximumAmount:49999,giftName:'차',quantity:1},{minimumAmount:50000,maximumAmount:70000,giftName:'컵',quantity:1}]};
function stored(input=draft){const n=calendar.normalizeEntryInput(input);return calendar.decorateEntry({id:'11111111-1111-4111-8111-111111111111',title:n.title,body:calendar.encodeEventBody(n),due_at:n.dueAt,context_label:n.contextLabel,item_type:'TASK',status:'OPEN'});}
function order(platform,amount=50000,orderedAt='2026-09-14T00:00:00+09:00'){return {hubOrderId:platform,platform,amount,orderedAt,stage:'PAID',quantity:1};}
test('planning survives storage and desktop projection; missing metadata remains compatible',()=>{
 const event=stored();assert.deepEqual(event.platforms,draft.platforms);assert.deepEqual(event.plan,draft.plan);assert.equal(validCalendarDraft(draft),true);
 const out=projectMonth({ok:true,range:{from:'2026-09-01',to:'2026-09-30'},entries:[event],complete:true,holidays:[],holidayReady:true},'2026-09');assert.deepEqual(out.entries[0].plan,draft.plan);assert.deepEqual(out.entries[0].platforms,draft.platforms);
 const legacy=calendar.decodeEventBody('[[HARIN_CALENDAR_EVENT_V1]]\n'+JSON.stringify({description:'옛 행사',giftTiers:draft.giftTiers}));assert.deepEqual(legacy.platforms,['NAVER','COUPANG','CAFE24']);assert.equal(legacy.plan.stage,'READY');
});
test('actual order projection scopes gifts by platform, date, amount, draft and removal',()=>{
 const event=stored();let rows=compactOrders(['NAVER','COUPANG','CAFE24'].map(p=>order(p)),[event]);assert.deepEqual(rows.map(r=>r.gifts.length),[1,0,1]);assert.equal(rows[0].gifts[0].giftName,'컵');
 for(const amount of [29999,70001])assert.equal(compactOrders([order('NAVER',amount)],[event])[0].gifts.length,0);
 assert.equal(compactOrders([order('NAVER',30000)],[event])[0].gifts[0].giftName,'차');
 for(const when of ['2026-09-13T23:59:59+09:00','2026-09-21T00:00:00+09:00'])assert.equal(compactOrders([order('NAVER',50000,when)],[event])[0].gifts.length,0);
 assert.equal(compactOrders([order('NAVER',50000,'2026-09-20T23:59:59+09:00')],[event])[0].gifts.length,1);
 assert.equal(compactOrders([order('NAVER')],[stored({...draft,plan:{...draft.plan,stage:'DRAFT'}})])[0].gifts.length,0);
 assert.equal(compactOrders([order('NAVER')],[])[0].gifts.length,0);
 const changed=stored({...draft,platforms:['COUPANG']});assert.deepEqual(compactOrders([order('NAVER'),order('COUPANG')],[changed]).map(r=>r.gifts.length),[0,1]);
});
test('invalid platform/planning metadata fails closed before save and gift resolution',()=>{
 for(const platforms of [[],['OTHER'],['NAVER','NAVER']]){assert.throws(()=>calendar.normalizeEntryInput({...draft,platforms}));assert.equal(validCalendarDraft({...draft,platforms}),false);}
 assert.throws(()=>calendar.normalizeEntryInput({...draft,plan:{stage:'INVALID'}}));
 const n=calendar.normalizeEntryInput(draft);const corrupted=calendar.decorateEntry({id:'x',due_at:n.dueAt,context_label:n.contextLabel,body:'[[HARIN_CALENDAR_EVENT_V1]]\n'+JSON.stringify({...draft,platforms:['OTHER']}),status:'OPEN'});assert.equal(corrupted.eventConfigInvalid,true);assert.equal(compactOrders([order('NAVER')],[corrupted])[0].gifts.length,0);
});
