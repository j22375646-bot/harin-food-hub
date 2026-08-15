'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildUnifiedInventoryCenter } = require('../lib/inventory/unified-center.js');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-5 재고 센터는 판매 중 상품과 품절·판매중단 상품을 분리한다',()=>{
  const masterProducts=[
    {id:'m1',name:'판매 상품',is_active:true},
    {id:'m2',name:'품절 상품',is_active:true},
    {id:'m3',name:'판매중단 상품',is_active:true},
    {id:'m4',name:'사은품 상품',is_active:true}
  ];
  const channelProducts=masterProducts.map((item,index)=>({master_product_id:item.id,platform:'CAFE24',external_product_id:String(index+1)}));
  const cafe24Products=[
    {external_product_no:'1',product_name:'판매 상품',display:true,selling:true,raw_data:{variants:[]}},
    {external_product_no:'2',product_name:'품절 상품',display:true,selling:true,raw_data:{variants:[{display:'T',selling:'T',inventories:{use_inventory:'T',display_soldout:'T',quantity:0}}]}},
    {external_product_no:'3',product_name:'판매중단 상품',display:true,selling:false,raw_data:{variants:[]}},
    {external_product_no:'4',product_name:'사은품 상품',display:true,selling:true,raw_data:{variants:[]}}
  ];
  const center=buildUnifiedInventoryCenter({masterProducts,channelProducts,cafe24Products});
  assert.equal(center.summary.sellable_products,1);
  assert.equal(center.summary.unavailable_products,2);
  assert.equal(center.summary.catalog_out_of_stock,1);
  assert.equal(center.summary.stopped_products,1);
  assert.equal(center.items.some(item=>item.master_product_id==='m4'),false);
});

test('14-5 재고 화면은 발주 미리보기와 접힌 판매 제외 그룹을 제공한다',()=>{
  const source=read('app/unified-inventory-operations-center.js');
  for(const label of ['14-5 · INVENTORY WORKBENCH','발주 미리보기','목표 보유일을 골라보세요','품절·판매중단 상품']) assert.match(source,new RegExp(label));
  assert.match(source,/setTargetDays/);
  assert.match(source,/inventoryAiSlot/);
  assert.match(source,/실제 재고나 플랫폼에는 반영되지 않아요/);
});

test('14-5 정산 화면은 예상·실제 대조와 별도 정산 AI를 제공한다',()=>{
  const source=read('app/unified-settlement-operations-center.js');
  for(const label of ['14-5 · SETTLEMENT WORKBENCH','정산·비용 대조센터','차이가 큰 채널부터 확인해요','매출에서 정산액까지']) assert.match(source,new RegExp(label));
  assert.match(source,/settlementAiSlot/);
  assert.match(source,/상품 원가와 광고비를 반영한 실제 이익은 상품 화면/);
  assert.match(source,/payout_variance/);
});

test('14-5 재고·정산 작업대는 모바일용 가로 집중 카드와 단일 열 흐름을 갖는다',()=>{
  const css=read('app/_operations/harin-operations-v8.css');
  assert.match(css,/\.inventoryFocusRail/);
  assert.match(css,/\.settlementFocusRail/);
  assert.match(css,/\.settlementMoneyJourney/);
  assert.match(css,/@media\(max-width:600px\)/);
});
