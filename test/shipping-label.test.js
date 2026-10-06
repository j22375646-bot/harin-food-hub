'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {shippingLabelForOrder:label}=require('../lib/orders/shipping-label.js');
const gift={name:'🎁 사은품 🎁 하린식품 밸런스 소금',quantity:1};
const tea=(total,quantity=1)=>({name:'구기결명자차 30g(1gX30TB)<br>',option:`용량 선택❤️ [단품/세트]=[무료배송 세트] /30TB ${total/30}개/55000원/(총 ${total}티백)`,quantity});
test('same tea combines option totals and multiplies ordered quantity',()=>{
 assert.equal(label({platform:'CAFE24',items:[tea(150),tea(30),gift]}).goodsName,'구기결명자차(총 180티백), 사은품 밸런스 소금');
 const actual=label({platform:'CAFE24',items:[tea(150),tea(30,2),gift]});
 assert.equal(actual.goodsName,'구기결명자차(총 210티백), 사은품 밸런스 소금');assert.equal(actual.quantity,8);
});
test('mixed bundle retains every product, option weight, total and gift',()=>{
 const result=label({platform:'CAFE24',items:[
 {name:'도라지차 36g(1.2gX30TB)',option:'용량 선택❤️ [단품/세트]=[단품] /30TB 1개/12000원/(총 30티백)',quantity:1},
 {name:'하린식품 해썹인증 햇 작두콩열매볶은 작두콩 깍지차 200g',option:'용량 선택❤️ [단품/세트]=[단품] /100g 2개/17000원/(총 2개)',quantity:1},
 {name:'하린식품 해썹인증 작수차 108g(1.2gX90TB)',option:'용량선택 🌿 =[BEST 세트]/30TB 3개/36000원/(총90티백)',quantity:1},gift]});
 assert.equal(result.goodsName,'도라지차(총 30티백), 작두콩깍지차 100g(총 2개), 작수차(총 90티백), 사은품 밸런스 소금');assert.equal(result.quantity,7);
});
test('different weights stay separate, repeated identical packs combine',()=>{
 assert.equal(label({platform:'CAFE24',items:[{name:'작두콩깍지차 100g',quantity:2},{name:'작두콩깍지차 200g',quantity:1},{name:'작두콩깍지차 100g',quantity:1}]}).goodsName,'작두콩깍지차 100g(총 3개), 작두콩깍지차 200g(총 1개)');
});
test('explicit tea total wins; missing total uses package units and row quantity',()=>{
 assert.equal(label({platform:'CAFE24',items:[{name:'하린식품 레드비트차 45g(1.5gX30TB)',option:'30TB 3개 / 36000원',quantity:2}]}).goodsName,'레드비트차(총 180티백)');
 assert.equal(label({platform:'CAFE24',items:[{name:'작두콩차 36g(1.2gX30TB)',option:'기본 옵션',quantity:2}]}).goodsName,'작두콩차(총 60티백)');
});
test('pick and mix retains named selections and duplicate selection quantity',()=>{
 assert.equal(label({platform:'CAFE24',items:[{name:'하린식품 차 골라담기',option:'1번 선택: 우엉차 / 2번 선택: 국화차',quantity:2}]}).goodsName,'우엉차(총 2개), 국화차(총 2개)');
});
test('all products survive above the previous 100 byte cutoff',()=>{
 const items=Array.from({length:9},(_,i)=>({name:`고유제품${i}차 100g`,quantity:1}));const result=label({platform:'CAFE24',items});
 for(let i=0;i<9;i++)assert.ok(result.goodsName.includes(`고유제품${i}차 100g(총 1개)`));assert.doesNotMatch(result.goodsName,/외 \d/);
});
test('unrepresentable label refuses silent truncation',()=>{
 assert.throws(()=>label({platform:'CAFE24',items:[{name:'아주긴제품'.repeat(100),quantity:1},gift]}),{code:'SHIPPING_LABEL_TOO_LONG'});
});
test('gift counts aggregate without merging with paid product',()=>{
 assert.equal(label({platform:'CAFE24',items:[gift,gift,{name:'밸런스 소금',quantity:1}]}).goodsName,'사은품 밸런스 소금(총 2개), 밸런스 소금(총 1개)');
});
test('explicit loose-leaf option overrides teabag default title',()=>{
 assert.equal(label({platform:'CAFE24',items:[{name:'작두콩차 30티백',option:'용량=100g 2개/(총 2개)',quantity:1}]}).goodsName,'작두콩차 100g(총 2개)');
});
