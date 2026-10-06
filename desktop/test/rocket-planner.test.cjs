const {test}=require('node:test'),assert=require('node:assert/strict');
const {plan}=require('../ui/rocket-planner.js');
const row={quantity:12,sales30:60,stale:false,updatedAt:'2026-09-11T00:00:00Z'};
test('30-day projection and adjustable replenishment use last 30-day velocity',()=>{
 const p=plan(row);assert.equal(p.daily,2);assert.equal(p.days,6);assert.equal(p.remaining30,0);assert.equal(p.shortage30,48);assert.equal(p.replenish,48);assert.equal(p.depletesAt,'2026-09-17T00:00:00.000Z');assert.equal(p.risk,'URGENT');
 assert.equal(plan(row,14).replenish,16);assert.equal(plan(row,60).replenish,108);assert.equal(plan({...row,quantity:100},30).remaining30,40);
});
test('missing sales, no sales and stale stock never invent a replenishment recommendation',()=>{
 for(const changes of [{sales30:null},{sales30:0},{sales30:-1},{stale:true},{quantity:null}]){const p=plan({...row,...changes});assert.equal(p.replenish,null);assert.equal(p.remaining30,null);assert.equal(p.coverage,null);}
 const sold=plan({...row,quantity:0});assert.equal(sold.risk,'EMPTY');assert.equal(sold.replenish,60);assert.equal(sold.days,0);
});
test('fractional velocity rounds only replenishment upward and handles target boundaries',()=>{
 assert.equal(plan({...row,sales30:1,quantity:0},14).replenish,1);
 assert.equal(plan({...row,quantity:14},30).risk,'LOW');assert.equal(plan({...row,quantity:28},30).risk,'ENOUGH');
 assert.equal(plan(row,999).replenish,48);
});
