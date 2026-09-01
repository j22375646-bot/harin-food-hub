'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const inbound=require('../lib/inventory/rocket-growth-inbound.js');
const parcel=require('../lib/epost/parcel.js');

test('로켓그로스 물류센터 수취처는 우체국 필수값을 정규화하고 누락을 차단한다',()=>{
  const destination=inbound.normalizeDestination({
    centerCode:'inc30 ',label:' 인천30 센터 ',recipientName:' 쿠팡 로켓그로스 ',
    contact:'032-123-4567',postCode:' 22382 ',address:'인천광역시 중구 물류로 1',addressDetail:'A동 입고장'
  });
  assert.deepEqual(destination,{
    centerCode:'INC30',label:'인천30 센터',recipientName:'쿠팡 로켓그로스',contact:'0321234567',
    postCode:'22382',address:'인천광역시 중구 물류로 1',addressDetail:'A동 입고장'
  });
  assert.deepEqual(inbound.validateDestination(destination),{ok:true,errors:[]});
  assert.equal(inbound.validateDestination({...destination,addressDetail:''}).ok,false);
});

test('쿠팡 비용 원본의 물류센터 코드를 저장 수취처와 합쳐 선택 목록으로 만든다',()=>{
  const directory=inbound.buildDestinationDirectory({
    costTransactions:[
      {raw_data:{fulfillment_center:'INC30'}},
      {raw_data:{fulfillment_center:'SAN3'}},
      {raw_data:{fulfillment_center:'INC30'}}
    ],
    savedDestinations:[{
      id:'dest-1',center_code:'INC30',label:'인천30 센터',recipient_encrypted:{v:1},last_verified_at:'2026-09-01T00:00:00Z'
    }],
    openReceiver:row=>row.id==='dest-1'?{
      recipientName:'쿠팡 로켓그로스',contact:'0321234567',postCode:'22382',
      address:'인천광역시 중구 물류로 1',addressDetail:'A동 입고장'
    }:{}
  });
  assert.deepEqual(directory.map(item=>({code:item.centerCode,source:item.source,ready:item.ready})),[
    {code:'INC30',source:'SAVED_AND_API',ready:true},
    {code:'SAN3',source:'COUPANG_API_HINT',ready:false}
  ]);
  assert.equal(directory[0].contact,'0321234567');
  assert.match(directory[1].statusLabel,/주소 등록 필요/);
});

test('선택한 로켓그로스 상품을 최대 50개 우체국 입고 송장 작업으로 검증한다',()=>{
  const inventory=[
    {vendor_item_id:'111',external_sku_id:'RG-A',productItem:{item_name:'작두콩차 30티백'}},
    {vendor_item_id:'222',external_sku_id:'RG-B',productItem:{item_name:'우엉차 40티백'}}
  ];
  const result=inbound.prepareShipmentDrafts({inventory,drafts:[
    {vendorItemId:'111',quantity:20,weight:3,volume:80},
    {vendorItemId:'222',quantity:0,weight:2,volume:60},
    {vendorItemId:'999',quantity:5,weight:2,volume:60}
  ]});
  assert.equal(result.valid.length,1);
  assert.deepEqual(result.valid[0],{
    vendorItemId:'111',externalSkuId:'RG-A',productName:'작두콩차 30티백',quantity:20,weight:3,volume:80
  });
  assert.deepEqual(result.invalid.map(item=>item.error),['발송 수량은 1개 이상이어야 합니다.','최신 로켓그로스 재고에서 상품을 찾지 못했습니다.']);
  const invalidPackage=inbound.prepareShipmentDrafts({inventory,drafts:[{vendorItemId:'111',quantity:1,weight:0,volume:60.5}]});
  assert.deepEqual(invalidPackage.invalid.map(item=>item.error),['포장 무게는 1~30kg 범위여야 합니다.']);
});

test('입고 송장 상품 목록은 품절 상품을 포함한 저장 로켓그로스 SKU 전체를 가나다순으로 만든다',()=>{
  const products=inbound.buildRocketGrowthProductDirectory({
    inventory:[
      {vendor_item_id:'222',external_sku_id:'RG-B',total_orderable_quantity:0,snapshot_at:'2026-09-01T00:00:00Z'},
      {vendor_item_id:'111',external_sku_id:'RG-A',total_orderable_quantity:12,snapshot_at:'2026-09-01T00:00:00Z'}
    ],
    productItems:[
      {vendor_item_id:'222',item_name:'우엉차 40티백'},
      {vendor_item_id:'111',item_name:'작두콩차 30티백'}
    ]
  });
  assert.deepEqual(products.map(item=>item.vendorItemId),['222','111']);
  assert.equal(products[0].name,'우엉차 40티백');
  assert.equal(products[0].orderableQuantity,0);
});

test('우체국 송장 payload는 로켓그로스 입고 출고번호를 주문 송장과 분리한다',()=>{
  const app=parcel.liveApplication({
    hubOrderId:'RGI-A1B2C3D4E5F6',platform:'COUPANG_RG_INBOUND',goodsName:'작두콩차 30티백',quantity:20,weight:3,volume:80,
    receiver:{name:'쿠팡 로켓그로스',contact:'0321234567',postCode:'22382',address:'인천광역시 중구 물류로 1',addressDetail:'A동 입고장'}
  },{customerNo:'123',approvalNo:'456',officeSerial:'01'});
  assert.equal(app.shipment.hubOrderId,'RGI-A1B2C3D4E5F6');
  assert.equal(app.shipment.platform,'COUPANG_RG_INBOUND');
  assert.match(app.plainText,/orderNo=RGI-A1B2C3D4E5F6/);
  assert.match(app.plainText,/ordCompNm=하린식품 로켓그로스 입고/);
});

test('로켓그로스 입고 송장 API는 센터 저장과 최대 50건 고정 IP 일괄 발급을 분리한다',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../app/api/inventory/rocket-growth/inbound/route.js'),'utf8');
  assert.match(source,/apiSafety\.isAuthorized/);
  assert.match(source,/SAVE_DESTINATION/);
  assert.match(source,/ISSUE_BATCH/);
  assert.match(source,/buildDestinationDirectory/);
  assert.match(source,/loadRocketGrowthProducts/);
  assert.match(source,/products/);
  assert.match(source,/prepareShipmentDrafts/);
  assert.match(source,/operationQueue\.seal/);
  assert.match(source,/operationType:'EPOST_LIVE_ISSUE'/);
  assert.match(source,/targetType:'CHANNEL'/);
  assert.match(source,/platform:'COUPANG_RG_INBOUND'/);
  assert.match(source,/mapLimit\([^,]+,4,/);
  assert.match(source,/slice\(0,50\)/);
});
