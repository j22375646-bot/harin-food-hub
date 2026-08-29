'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  buildPhase28InventoryModel,
  buildPhase28ProductsModel,
  PHASE28_AVAILABLE_ADAPTERS
}=require('../lib/ui/phase28-adapters/index.js');

test('inventory adapter keeps observed zero stock distinct from missing holding evidence',()=>{
  const model=buildPhase28InventoryModel({
    generatedAt:'2026-08-29T02:00:00.000Z',
    coupang:{
      rgInventory:[
        {vendor_item_id:'V-1',external_sku_id:'RG-1',total_orderable_quantity:0,sales_last_30_days:12,days_of_stock:0,stock_status:'OUT_OF_STOCK',snapshot_at:'2026-08-29T01:55:00.000Z',productItem:{item_name:'작두콩수세미차 30티백',sale_price:13500},inventoryMarketing:{code:'RESTOCK_URGENT',label:'재입고 최우선',action:'광고 일시 제한',tone:'danger'}},
        {vendor_item_id:'V-2',external_sku_id:'RG-2',total_orderable_quantity:42,sales_last_30_days:0,days_of_stock:null,stock_status:'HEALTHY',productItem:{item_name:'우엉차 40티백',sale_price:14200},inventoryMarketing:{code:'DISCOVERY',label:'노출 개선 필요',action:'검색어 점검',tone:'purple'}}
      ],
      inventoryLots:[{id:'LOT-1',platform:'COUPANG',vendor_item_id:'V-1',lot_code:'A-01',expires_on:'2027-08-01',quantity:20,status:'ACTIVE'}],
      latestSync:{status:'SUCCESS',finished_at:'2026-08-29T01:55:00.000Z'}
    }
  });

  assert.equal(model.rows[0].orderableQuantity,0);
  assert.equal(model.rows[0].daysOfStock,0);
  assert.equal(model.rows[1].daysOfStock,null);
  assert.equal(model.rows[1].holdingStatus,'CHECK_REQUIRED');
  assert.equal(model.rows[0].lots[0].lotCode,'A-01');
  assert.equal(model.hero.itemCount,2);
  assert.equal(model.collection.status,'SUCCESS');
});

test('inventory adapter strips raw provider payloads from the client model',()=>{
  const model=buildPhase28InventoryModel({
    coupang:{rgInventory:[{vendor_item_id:'V-1',external_sku_id:'RG-1',total_orderable_quantity:3,sales_last_30_days:6,days_of_stock:15,raw_data:{secret:'do-not-serialize'},productItem:{item_name:'보리차',raw_data:{access_token:'no'}}}]}
  });
  assert.equal(JSON.stringify(model).includes('do-not-serialize'),false);
  assert.equal(JSON.stringify(model).includes('access_token'),false);
});

test('products adapter keeps channel evidence separate and blocks unknown costs',()=>{
  const model=buildPhase28ProductsModel({
    generatedAt:'2026-08-29T02:00:00.000Z',
    productOperations:{
      summary:{master_products:2,all_channels_connected:1,action_required:1,price_gap:0},
      items:[
        {master_product_id:'M-1',name:'작두콩수세미차 30티백',base_price:13500,connected_channels:3,action_required:false,issues:[],channels:{CAFE24:{state:'ACTIVE',label:'판매중',name:'카페24 상품',price:13500,detail:'실상품 연결'},NAVER:{state:'ACTIVE',label:'판매중',name:'네이버 상품',price:13500,detail:'스마트스토어 실상품'},COUPANG:{state:'ACTIVE',label:'판매중',name:'쿠팡 상품',price:13500,inventory:null,detail:'재고 확인 필요'}}},
        {master_product_id:'M-2',name:'우엉차 40티백',base_price:14200,connected_channels:1,action_required:true,issues:[{code:'NAVER_MISSING',level:'INFO',label:'네이버 실상품 미연결'}],channels:{CAFE24:{state:'ACTIVE',label:'판매중',name:'카페24 상품',price:14200,detail:'실상품 연결'},NAVER:{state:'MISSING',label:'미연결',name:null,price:null,detail:'커머스 API 연결 후 확인'},COUPANG:{state:'MISSING',label:'미연결',name:null,price:null,inventory:null,detail:'상품 연결 필요'}}}
      ]
    },
    productCosts:[{master_product_id:'M-1',unit_cost:5000,packaging_cost:500,other_unit_cost:0}],
    financialTrust:{status:'BLOCKED',reasons:['COST_COVERAGE_BELOW_THRESHOLD']}
  });

  assert.equal(model.rows[0].channels.CAFE24.state,'ACTIVE');
  assert.equal(model.rows[0].channels.NAVER.state,'ACTIVE');
  assert.equal(model.rows[0].channels.COUPANG.state,'ACTIVE');
  assert.equal(model.rows[0].cost.total,5500);
  assert.equal(model.rows[0].judgment.status,'READY');
  assert.equal(model.rows[1].cost.total,null);
  assert.equal(model.rows[1].judgment.status,'HOLD');
  assert.equal(model.hero.costReadyCount,1);
});

test('inventory and products adapters join the implemented V106 set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes']);
});
