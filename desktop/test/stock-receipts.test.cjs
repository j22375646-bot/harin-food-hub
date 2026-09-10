'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {select}=require('../ui/stock-receipts.js');
const {documentFor,validRequest}=require('../stock-receipt-preview.cjs');
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const rows=[{id,name:'차 <script>alert(1)</script>',productNo:'1',receivedDate:'2026-09-01',receivedQuantity:150,receivedUnit:'티백',quantity:30,lot:'A&B'},{id:'b',name:'차',productNo:'1',receivedDate:'2026-09-11',receivedQuantity:30,unit:'KG'},{id:'c',name:'차',productNo:'1'},{id:'d',name:'다른 제품',productNo:'2',receivedDate:'2026-09-11'}];
test('receipt range includes endpoints and excludes undated history only when bounded',()=>{assert.equal(select(rows,rows[0]).length,3);assert.equal(select(rows,rows[0],'2026-09-01','2026-09-11').length,2);assert.deepEqual(select(rows,rows[0],'2026-09-11','2026-09-11').map(r=>r.id),['b']);assert.throws(()=>select(rows,rows[0],'2026-09-12','2026-09-11'));assert.throws(()=>select(rows,rows[0],'2026-02-30',''));});
test('receipt document prints original quantity and escapes all data without current balance',()=>{const html=documentFor(rows,{id,from:'2026-09-01',to:'2026-09-11'});assert.match(html,/150 티백/);assert.match(html,/A&amp;B/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|잔량|30 티백/);assert.equal((html.match(/<tr>/g)||[]).length,3);assert.throws(()=>documentFor(rows,{id,from:'2099-01-01',to:''}));assert.equal(validRequest({id,from:'bad',to:''}),false);});
