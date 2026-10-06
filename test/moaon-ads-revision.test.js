const test=require('node:test'),assert=require('node:assert/strict');
const {compareRevision,describe}=require('../lib/assistant/ads-revision.js');
const make=(metrics={},extra={})=>({period:{start:'2026-09-01',end:'2026-09-07'},status:'OBSERVED',campaigns:[{id:'a'}],observedRows:7,expectedRows:7,sourceAsOf:'2026-09-08T00:00:00Z',metrics:{cost:100,clicks:10,conversions:1,revenue:200,roas:200,...metrics},...extra});
test('revision compares same-period snapshots and distinguishes percentage points',()=>{
 const c=compareRevision(make({cost:120,roas:250}),make());assert.equal(c.status,'CHANGED');
 assert.equal(c.rows.find(x=>x.key==='cost').delta,20);assert.equal(c.rows.find(x=>x.key==='roas').unit,'%p');assert.equal(c.rows.find(x=>x.key==='roas').delta,50);
 assert.equal(compareRevision(make(),make()).status,'UNCHANGED');assert.match(describe(c),/광고비/);
});
test('unknown and zero baselines never invent a percentage',()=>{
 const c=compareRevision(make({revenue:100}),make({revenue:0}));assert.equal(c.rows.find(x=>x.key==='revenue').percent,null);
 const d=compareRevision(make({cost:100}),make({cost:null},{status:'PARTIAL',observedRows:6}));assert.equal(d.status,'HOLD');assert.equal(d.rows.find(x=>x.key==='cost').delta,null);assert.equal(d.rows.find(x=>x.key==='cost').state,'ADDED');assert.match(d.reason,/자료/);
});
test('missing parents or changed campaign/period/coverage hold comparisons',()=>{
 for(const p of [null,make({}, {campaigns:[{id:'b'}]}),make({}, {period:{start:'2026-09-02',end:'2026-09-08'}}),make({}, {observedRows:6})])assert.equal(compareRevision(make(),p).status,'HOLD');
});

test('HTML comparison escapes data and shows unknown values',()=>{
 const c=compareRevision(make({cost:120}),make());c.reason='<img src=x onerror=x>';
 const html=require('../lib/assistant/ads-report.js').html({title:'test',summary_json:{...make(),caveats:[],revisionComparison:c}});
 assert.match(html,/원본과 재작성 비교/);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/확인 필요/);
});
