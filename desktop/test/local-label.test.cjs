'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {renderLabel,barcodeSvg}=require('../local-label.cjs');
const input={hubOrderId:'HR-C24-1234ABCD',trackingNo:'1234567890123',goodsName:'시험 상품',quantity:2,receiver:{name:'가상 수취인',contact:'01012345678',postCode:'12345',address:'가상시 시험로 1',addressDetail:'101호',message:'문 앞'}};
test('local label renders escaped delivery and real barcode without remote dependencies',()=>{
 const html=renderLabel({...input,goodsName:'<img src="https://example.invalid" onerror="alert(1)">'});
 assert.match(html,/&lt;img/);assert.equal(html.includes('<img'),false);assert.match(html,/가상 수취인/);assert.match(html,/100mm 150mm/);assert.match(html,/default-src 'none'/);assert.equal(html.includes('<script'),false);
 assert.equal(barcodeSvg(input.trackingNo),require('../../lib/shipping/label.js').barcodeSvg(input.trackingNo));
});
test('batch label document has exact identities and physical page breaks; rejects duplicate parcel',()=>{
 const {renderLabels}=require('../local-label.cjs');
 const other={...input,hubOrderId:'HR-CP-ABCDEF12',trackingNo:'9876543210123'};
 const html=renderLabels([input,other]);
 assert.equal((html.match(/<article class="label">/g)||[]).length,2);assert.match(html,/HR-CP-ABCDEF12/);assert.match(html,/break-after:page/);assert.match(html,/last-child/);
 assert.throws(()=>renderLabels([input,{...other,trackingNo:input.trackingNo}]));assert.throws(()=>renderLabels([]));assert.throws(()=>renderLabels([input,{...other,quantity:0}]));
});
test('invalid labels fail before displaying a printable document',()=>{
 for(const patch of [{trackingNo:'TESTREGINOAPI'},{trackingNo:'123'},{receiver:{...input.receiver,address:''}},{receiver:{...input.receiver,postCode:'bad'}},{quantity:0},{goodsName:''}])assert.throws(()=>renderLabel({...input,...patch}));
});
