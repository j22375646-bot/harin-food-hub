const test=require('node:test'),assert=require('node:assert/strict');
test('calendar scan retains later pages and old overlapping events',async()=>{
 const {readCalendarPages}=require('../lib/calendar/paged-read.js');
 const old={id:'old',date:'2020-01-01',endDate:'2027-01-01'};
 const rows=Array.from({length:501},(_,i)=>({id:String(i),date:'2025-01-01',endDate:'2025-01-01'})).concat(old);
 const result=await readCalendarPages(async(start,end)=>({data:rows.slice(start,end+1),count:502}),x=>x,'2026-09-01','2026-09-30');
 assert.deepEqual(result.entries,[old]);assert.equal(result.complete,true);
});
test('a server-capped page is not mistaken for a complete scan',async()=>{
 const {readCalendarPages}=require('../lib/calendar/paged-read.js');
 const result=await readCalendarPages(async()=>({data:[],count:10}),x=>x,'2026-09-01','2026-09-30');
 assert.equal(result.complete,false);
});
test('calendar scan declares limit and propagates database errors',async()=>{
 const {readCalendarPages}=require('../lib/calendar/paged-read.js');
 const result=await readCalendarPages(async(start,end)=>({data:Array.from({length:end-start+1},(_,i)=>({id:String(start+i),date:'2026-09-01'}))}),x=>x,'2026-09-01','2026-09-30');
 assert.equal(result.complete,false);assert.equal(result.entries.length,499);
 await assert.rejects(()=>readCalendarPages(async()=>({error:new Error('DB unavailable')}),x=>x,'2026-09-01','2026-09-30'),/DB unavailable/);
});
