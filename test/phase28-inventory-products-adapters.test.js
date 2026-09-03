'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  buildPhase28InventoryModel,
  buildPhase28ProductsModel,
  inventoryMarkerLabel,
  PHASE28_AVAILABLE_ADAPTERS
}=require('../lib/ui/phase28-adapters/index.js');

test('inventory marker uses the product initial after removing the Harin brand prefix',()=>{
  assert.equal(inventoryMarkerLabel('하린식품 쌀조청 1kg'),'쌀');
  assert.equal(inventoryMarkerLabel('2026년 국내산 하린식품 소금 500g'),'소');
  assert.equal(inventoryMarkerLabel('하린식품 국내산 구운 다시마 용융소금 · 1개 200g'),'소');
});

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

test('products adapter exposes a sanitized platform-separated mapping workbench',()=>{
  const model=buildPhase28ProductsModel({
    loadedWorkspace:'mappings',
    masterProducts:[{id:'M1',name:'작두콩차 30티백',selling_price:11000,is_active:true}],
    productMapping:{
      summary:{source_naver:1,source_coupang:1,candidate_naver:1,candidate_coupang:1},
      candidates:[
        {platform:'NAVER',external_product_id:'N1',external_product_name:'네이버 작두콩차',selling_price:11000,is_active:true,raw_data:{access_token:'secret'},auto_eligible:true,candidates:[{master_product_id:'M1',master_name:'작두콩차 30티백',score:.98,confidence:98,reasons:['상품명 일치']}]},
        {platform:'COUPANG',external_product_id:'C1',external_product_name:'쿠팡 작두콩차',selling_price:12000,is_active:true,candidates:[]}
      ],
      links:[{platform:'NAVER',external_product_id:'N2',external_product_name:'연결된 상품',master_product_id:'M1',is_active:true,match_method:'MANUAL',match_confidence:.97,raw_data:{secret:'hide'}}]
    }
  });
  assert.equal(model.mapping.masterProducts[0].id,'M1');
  assert.deepEqual(model.mapping.candidates.map(item=>item.platform),['NAVER','COUPANG']);
  assert.equal(model.mapping.candidates[0].suggestions[0].masterProductId,'M1');
  assert.equal(model.mapping.links[0].masterProductId,'M1');
  assert.equal(JSON.stringify(model.mapping).includes('secret'),false);
  assert.equal(JSON.stringify(model.mapping).includes('access_token'),false);
});

test('products adapter keeps only explicitly selling mapping rows and sorts master products in Korean order',()=>{
  const model=buildPhase28ProductsModel({
    loadedWorkspace:'mappings',
    productMapping:{
      masterProducts:[
        {id:'M3',name:'하린식품 작두콩차',selling_price:13000,is_active:true},
        {id:'M1',name:'가시오가피차',selling_price:11000,is_active:true},
        {id:'M2',name:'보리차',selling_price:9000,is_active:true},
        {id:'STOPPED',name:'단종 상품',selling_price:1000,is_active:false},
        {id:'UNKNOWN',name:'상태 미확인 상품',selling_price:1000,is_active:null}
      ],
      candidates:[
        {platform:'NAVER',external_product_id:'N-SALE',external_product_name:'네이버 판매중',is_active:true,candidates:[{master_product_id:'M1',master_name:'가시오가피차'}]},
        {platform:'NAVER',external_product_id:'N-STOP',external_product_name:'네이버 판매중단',is_active:false,candidates:[]},
        {platform:'COUPANG',external_product_id:'C-UNKNOWN',external_product_name:'쿠팡 상태 미확인',is_active:null,candidates:[]}
      ],
      links:[
        {platform:'NAVER',external_product_id:'N-LINKED',external_product_name:'연결 판매중',master_product_id:'M1',is_active:true},
        {platform:'COUPANG',external_product_id:'C-STOPPED',external_product_name:'연결 판매중단',master_product_id:'M2',is_active:false}
      ]
    }
  });

  assert.deepEqual(model.mapping.masterProducts.map(item=>item.name), ['가시오가피차','보리차','하린식품 작두콩차']);
  assert.deepEqual(model.mapping.candidates.map(item=>item.externalProductId), ['N-SALE']);
  assert.deepEqual(model.mapping.links.map(item=>item.externalProductId), ['N-LINKED']);
});

test('products adapter exposes saved no-link decisions and a dedicated editable cost workbench',()=>{
  const source={
    loadedWorkspace:'costs',
    masterProducts:[
      {id:'M1',name:'가시오가피차',sku:'SKU-1',selling_price:11000,is_active:true},
      {id:'M2',name:'보리차',sku:'SKU-2',selling_price:9000,is_active:true}
    ],
    productOperations:{items:[
      {master_product_id:'M1',name:'가시오가피차',base_price:11000,channels:{}},
      {master_product_id:'M2',name:'보리차',base_price:9000,channels:{}}
    ]},
    productCosts:[{master_product_id:'M1',unit_cost:4200,packaging_cost:300,other_unit_cost:100}],
    productMapping:{masterProducts:[],candidates:[{platform:'NAVER',external_product_id:'N1',external_product_name:'네이버 단독상품',is_active:true,no_link:true,candidates:[]}],links:[]}
  };
  const model=buildPhase28ProductsModel(source);
  assert.equal(model.costWorkbench.rows.length,2);
  assert.deepEqual(model.costWorkbench.rows[0],{
    id:'M1',name:'가시오가피차',sku:'SKU-1',basePrice:11000,
    unitCost:4200,packagingCost:300,otherUnitCost:100,total:4600,ready:true
  });
  assert.equal(model.costWorkbench.rows[1].unitCost,null);
  assert.equal(model.costWorkbench.readyCount,1);
  assert.equal(model.costWorkbench.pendingCount,1);

  assert.deepEqual(model.rows,[]);
  assert.deepEqual(model.mapping.masterProducts,[]);
  assert.deepEqual(model.mapping.candidates,[]);
  assert.deepEqual(model.mapping.links,[]);

  const mappingModel=buildPhase28ProductsModel({...source,loadedWorkspace:'mappings'});
  assert.equal(mappingModel.mapping.candidates[0].noLink,true);
  assert.deepEqual(mappingModel.rows,[]);
  assert.deepEqual(mappingModel.costWorkbench.rows,[]);

  const catalogModel=buildPhase28ProductsModel({...source,loadedWorkspace:'catalog'});
  assert.equal(catalogModel.rows.length,2);
  assert.deepEqual(catalogModel.mapping.candidates,[]);
  assert.deepEqual(catalogModel.costWorkbench.rows,[]);
});

test('inventory and products adapters join the implemented V106 set',()=>{
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','calendar','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes','validation','experiments','knowledge']);
});
