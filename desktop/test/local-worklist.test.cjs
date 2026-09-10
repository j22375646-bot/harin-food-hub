'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {renderWorklist}=require('../local-worklist.cjs');
const order={hubOrderId:'HR-NV-1234ABCD',platform:'NAVER',externalOrderId:'N-1',productName:'상품 fallback',stage:'PREPARING',amount:null,items:[{name:'차 <한정>',option:'30T & 선물',quantity:null}],packingInstructions:['완충재 <필수>'],gifts:[{name:'컵 & 받침',quantity:2}],invoice:null};
test('packing A4 escapes content, unifies dispatch and packing with large print and authorized delivery information',()=>{
 const html=renderWorklist({type:'packing',orders:[order],generatedAt:'2026-09-09T01:02:03.000Z'});
 assert.match(html,/@page\{size:A4 portrait/);assert.match(html,/출고 작업표 A4/);assert.match(html,/차 &lt;한정&gt;/);assert.match(html,/30T &amp; 선물/);assert.match(html,/수량 확인 필요/);assert.doesNotMatch(html,/완충재|포장 지시/);assert.match(html,/컵 &amp; 받침 × 2/);assert.match(html,/받는 분/);assert.match(html,/font-size:14pt/);assert.match(html,/font-size:16pt/);assert.match(html,/송장등록·출고승인 기능이 아닙니다/);assert.match(html,/외부 송장을 대신할 수 없습니다/);
});
test('dispatch A4 distinguishes stage and registered invoice state for all channels',()=>{
 const orders=['CAFE24','NAVER','COUPANG'].map((platform,index)=>({...order,hubOrderId:`HR-${platform==='CAFE24'?'C24':platform==='NAVER'?'NV':'CP'}-1234ABC${index}`,platform,invoice:index===0?{status:'REGISTERED',number:'1234567890123'}:null}));
 const html=renderWorklist({type:'dispatch',orders,generatedAt:'2026-09-09T01:02:03.000Z'});
 assert.match(html,/출고 작업표 A4/);assert.match(html,/상품 준비 중/);assert.match(html,/송장/);for(const channel of ['카페24','네이버','쿠팡'])assert.match(html,new RegExp(channel));assert.match(html,/1234567890123/);assert.match(html,/확인 필요/);assert.equal((html.match(/class="order-check"/g)||[]).length,3);
});
test('worklist validates type, identity, count and explicit content limits',()=>{
 for(const args of [{type:'wrong',orders:[order]},{type:'packing',orders:[]},{type:'packing',orders:[order,order]},{type:'packing',orders:Array(21).fill(0).map((_,i)=>({...order,hubOrderId:`HR-NV-${i.toString(16).padStart(8,'0').toUpperCase()}`}))},{type:'packing',orders:[{...order,items:Array(101).fill(order.items[0])}]}])assert.throws(()=>renderWorklist(args));
});
test('more than eight items and gifts are not silently dropped and pages repeat headings',()=>{
 const items=Array.from({length:9},(_,i)=>({name:`상품${i+1}`,option:'',quantity:i+1})),gifts=Array.from({length:9},(_,i)=>({name:`사은품${i+1}`,quantity:1}));
 const orders=Array.from({length:5},(_,i)=>({...order,hubOrderId:`HR-NV-1234ABC${i}`,items,gifts}));const html=renderWorklist({type:'packing',orders});
 assert.match(html,/상품9/);assert.match(html,/사은품9/);assert.equal((html.match(/class="work-page"/g)||[]).length,1);assert.equal((html.match(/출고 작업표 A4/g)||[]).length>=1,true);assert.match(html,/class="sequence">5</);
});

test('delivery is escaped, codes hidden, absent gifts omitted, packing aliases dispatch',()=>{const args={orders:[{...order,gifts:[],receiver:{name:'가상 <고객>',postCode:'01234',address:'서울 가상로 1',addressDetail:'101호',contact:'01012345678',message:'문 앞 & 연락'},invoice:{status:'ISSUED',number:'1234567890123'}}],generatedAt:'2026-09-11T00:00:00Z'};const html=renderWorklist({...args,type:'dispatch'});assert.equal(html,renderWorklist({...args,type:'packing'}));assert.match(html,/가상 &lt;고객&gt;/);assert.match(html,/01234 서울 가상로 1 101호/);assert.match(html,/문 앞 &amp; 연락/);assert.doesNotMatch(html,/class="gifts"|1234567890123/);const visible=html.replace(/<[^>]*>/g,'');assert.doesNotMatch(visible,/HR-NV-1234ABCD|N-1/);});
