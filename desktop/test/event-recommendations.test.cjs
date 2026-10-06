const test=require('node:test'),assert=require('node:assert/strict'),{forMonth}=require('../ui/event-recommendations.js');
test('all twelve months supply bounded editable ideas without invented prices or discounts',()=>{
 for(let m=1;m<=12;m++){const ideas=forMonth('2026-'+String(m).padStart(2,'0'));assert.ok(ideas.length);for(const i of ideas){assert.ok(i.title&&i.goal&&i.preparation);assert.ok(!('discountValue' in i));if(i.start){assert.ok(i.end>=i.start);assert.equal(new Date(i.start).toISOString().slice(0,10),i.start);}}}
 for(const month of ['2026-00','2026-13','x',null])assert.deepEqual(forMonth(month),[]);
});
test('black friday follows fourth Thursday, not a fixed November date or fourth Friday',()=>{
 for(const [y,d] of [[2024,29],[2025,28],[2026,27],[2027,26],[2028,24],[2029,23]])assert.equal(forMonth(y+'-11').find(i=>i.id==='blackfriday').start,y+'-11-'+d);
});
test('lunar suggestions require source dates and ignore invalid, wrong-month and substitute rows',()=>{
 assert.equal(forMonth('2026-09')[0].start,'');
 const bad=[{name:'추석',date:'2026-09-99'},{name:'대체공휴일',date:'2026-09-28'},{name:'추석',date:'2025-09-24'}];assert.equal(forMonth('2026-09',bad)[0].start,'');
 const rows=[{name:'추석',date:'2026-09-25'},{name:'추석',date:'2026-09-24'},{name:'추석',date:'2026-09-26'}];const idea=forMonth('2026-09',rows)[0];assert.equal(idea.start,'2026-09-03');assert.equal(idea.end,'2026-09-24');assert.match(idea.dateKind,/조회된 첫 휴일/);assert.equal(rows[0].date,'2026-09-25');
});
