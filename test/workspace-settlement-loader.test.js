'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const load=options=>require('../lib/dashboard/workspace-settlement-loader.js').loadWorkspaceSettlement(options);
const now=new Date('2026-09-09T09:00:00Z');
function database(tables={},broken={}){
 const calls=[];
 return {calls,from(table){
  const call={table,filters:[],offset:0,end:499};calls.push(call);
  const query={
   select(columns,options){call.columns=columns;call.count=options?.count;return this;},
   order(key){(call.orders||=[]).push(key);return this;},
   eq(...args){call.filters.push(['eq',...args]);return this;},
   gte(...args){call.filters.push(['gte',...args]);return this;},
   or(...args){call.filters.push(['or',...args]);return this;},
   like(...args){call.filters.push(['like',...args]);return this;},
   in(...args){call.filters.push(['in',...args]);return this;},
   limit(n){call.end=n-1;return this;},
   range(a,b){call.offset=a;call.end=b;return this;},
   maybeSingle(){call.single=true;return this;},
   then(resolve,reject){const rows=tables[table]||[];const result=broken[table]||{data:call.single?(rows[0]||null):rows.slice(call.offset,call.end+1),error:null,count:rows.length};return Promise.resolve(result).then(resolve,reject);}
  };return query;
 }};
}
const naver=(key,date,amount=90)=>({settlement_key:key,settle_basis_end_date:date,settle_complete_date:date,settle_amount:amount,pay_settle_amount:100,commission_settle_amount:-10});
test('selected period alone is calculated from settlement evidence, not main dashboard data',async()=>{
 for(const [days,actual,start] of [[7,90,'2026-09-02T15:00:00.000Z'],[30,180,'2026-08-10T15:00:00.000Z'],[90,180,'2026-06-11T15:00:00.000Z']]){
  const db=database({naver_commerce_settlements:[naver('new','2026-09-09'),naver('old','2026-08-20')]});
  const data=await load({db,now,days});
  assert.deepEqual(Object.keys(data.settlementPeriods),[String(days)]);
  const period=data.settlementPeriods[days];assert.equal(period.period_start,start);
  assert.equal(period.channels.find(c=>c.platform==='NAVER').actual_payout,actual);
  assert.equal(data.generatedAt,'2026-09-09T09:00:00.000Z');
  assert.ok(db.calls.every(c=>!/reports|alerts|inventory|product_costs|business_targets|monthly/.test(c.table)));
  assert.ok(db.calls.length<25);
  assert.ok(db.calls.find(c=>c.table==='naver_commerce_settlements').filters.some(f=>f[0]==='or'&&f[1].includes(start.slice(0,10)==='2026-09-02'?'2026-09-03':days===30?'2026-08-11':'2026-06-12')));
 }
});
test('ledger pagination reads beyond first page rather than certifying a subtotal',async()=>{
 const db=database({naver_commerce_settlements:Array.from({length:501},(_,i)=>naver(String(i),'2026-09-09',1))});
 const data=await load({db,now,days:7});
 assert.equal(data.settlementPeriods[7].channels.find(c=>c.platform==='NAVER').actual_payout,501);
 assert.deepEqual(db.calls.filter(c=>c.table==='naver_commerce_settlements').map(c=>c.offset),[0,500]);
});
test('truncated or failed ledger is unavailable, never a known partial subtotal',async()=>{
 for(const result of [{data:[naver('1','2026-09-09')],count:2,error:null},{data:null,error:{code:'DB_DOWN'}}]){
  const data=await load({db:database({}, {naver_commerce_settlements:result}),now,days:7});
  const channel=data.settlementPeriods[7].channels.find(c=>c.platform==='NAVER');
  assert.equal(channel.status,'UNAVAILABLE');assert.equal(channel.actual_payout,null);
 }
});
test('unknown Coupang family cannot be assigned to seller or Rocket Growth',async()=>{
 const db=database({coupang_settlements:[{settlement_key:'unknown',recognition_date:'2026-09-09',sale_amount:123,settlement_amount:100,delivery_family:'UNKNOWN'}]});
 const period=(await load({db,now,days:7})).settlementPeriods[7];
 const seller=period.channels.find(c=>c.platform==='COUPANG');
 assert.equal(seller.gross_sales,null);assert.equal(seller.ledger_status,'FAMILY_REQUIRED');
});
test('invalid periods fail before any database read',async()=>{
 const db=database();for(const days of [0,8,'7',91])await assert.rejects(load({db,now,days}),/period/i);
 assert.equal(db.calls.length,0);
});
test('Cafe24 sales pages are deterministically ordered by date and shop',async()=>{
 const db=database();await load({db,now,days:7});
 assert.deepEqual(db.calls.find(c=>c.table==='cafe24_sales_daily').orders,['date','shop_no']);
});
test('Cafe24 finance sync approval evidence survives the focused loader',async()=>{
 const db=database({sync_logs:[{platform:'CAFE24',job_type:'FETCH_ALL',finished_at:'2026-09-09T08:00:00Z',metadata:{capabilities:{settlement:'APPROVAL_REQUIRED'}}}],cafe24_oauth_tokens:[{token_data:{access_token:'local-test',scopes:['mall.read_order','mall.read_analytics']}}]});
 const center=(await load({db,now,days:7})).settlementPeriods[7];
 const cafe=center.channels.find(c=>c.platform==='CAFE24');
 assert.equal(cafe.last_updated_at,'2026-09-09T08:00:00Z');
 assert.ok(['APPROVAL_REQUIRED','RECONNECT_REQUIRED'].includes(cafe.status));
});
