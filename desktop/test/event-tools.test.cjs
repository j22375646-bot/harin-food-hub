'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),t=require('../ui/event-tools.js');
const costs={price:10000,quantity:10,unitCost:3000,feeRate:10,shipping:2000,gift:500,adBudget:1000};
test('profit keeps missing costs unknown, explicit zero known, rounds fees, and rejects excessive discounts',()=>{
 assert.equal(t.profit({costs:{...costs,unitCost:null}},{discountType:'NONE'}).status,'UNKNOWN');
 const p=t.profit({costs},{discountType:'PERCENT',discountValue:10});assert.equal(p.revenue,90000);assert.equal(p.fees,9000);assert.equal(p.profit,25000);
 assert.equal(t.profit({costs:{...costs,gift:0,adBudget:0}},{discountType:'AMOUNT',discountValue:1000}).profit,31000);
 assert.equal(t.profit({costs},{discountType:'AMOUNT',discountValue:10001}).status,'INVALID');
 for(const patch of [{price:-1},{quantity:0},{feeRate:101},{shipping:''}])assert.throws(()=>t.normalize({costs:{...costs,...patch}}));
});
test('copy preserves benefit/duration but clears completion, sent date, review, identity and old tracking campaign',()=>{
 const row={id:'old',date:'2026-09-29',endDate:'2026-10-02',title:'행사',plan:{stage:'READY',review:'이전 회고',goal:'목표'},campaign:{discountType:'PERCENT',discountValue:10,messageStatus:'SENT',messageSentDate:'2026-09-29'},execution:{checks:{banner:true},costs,messageDraft:'발송한 문구',utmCampaign:'old'}};
 const copy=t.duplicate(row,'2026-12-30');assert.equal(copy.endDate,'2027-01-02');assert.equal(copy.id,undefined);assert.equal(copy.plan.stage,'DRAFT');assert.equal(copy.plan.review,'');assert.equal(copy.campaign.messageSentDate,'');assert.equal(copy.campaign.messageStatus,'PLANNED');assert.equal(copy.execution.checks.banner,false);assert.equal(copy.execution.messageDraft,'');assert.equal(copy.execution.utmCampaign,'');assert.deepEqual(copy.execution.costs,costs);assert.equal(row.execution.checks.banner,true);
});
test('readiness and overdue marketing cross month boundaries and exclude ended, deleted, complete events',()=>{
 const row={id:'event',type:'EVENT',status:'OPEN',date:'2026-10-02',endDate:'2026-10-05',execution:{checks:{}},campaign:{messageStatus:'PLANNED',messagePlannedDate:'2026-09-29'}};
 assert.equal(t.reminders(row,'2026-09-29').length,2);assert.equal(t.reminders(row,'2026-09-28').length,0);
 for(const patch of [{status:'DONE'},{status:'ARCHIVED'},{eventConfigInvalid:true},{endDate:'2026-09-28'}])assert.equal(t.reminders({...row,...patch},'2026-09-29').length,0);
 assert.equal(t.reminders({...row,campaign:{messageStatus:'SENT'},execution:{checks:{banner:true,stock:true,coupon:true,message:true}}},'2026-09-29').length,0);
});
test('message drafts and UTM preserve HTTPS query/hash, reject scripts and credentials and do not claim sending',()=>{
 const execution={link:'https://example.com/product?id=1#detail',utmSource:'카카오',utmMedium:'message',utmCampaign:'추석'};
 const u=new URL(t.trackedLink(execution));assert.equal(u.searchParams.get('id'),'1');assert.equal(u.searchParams.get('utm_campaign'),'추석');assert.equal(u.hash,'#detail');
 assert.match(t.draft({title:'시즌 행사',date:'2026-09-13',campaign:{discountType:'PERCENT',discountValue:15},execution},'SNS'),/15% 할인/);
 for(const link of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.throws(()=>t.normalize({link}));
});
