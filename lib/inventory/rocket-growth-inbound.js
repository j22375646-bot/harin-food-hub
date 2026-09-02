'use strict';

const wingDestinations=require('./coupang-wing-destinations.js');

const text=value=>String(value==null?'':value).trim();
const digits=value=>text(value).replace(/\D/g,'');

function normalizeDestination(input={}){
  return {
    centerCode:text(input.centerCode||input.center_code).toUpperCase(),
    label:text(input.label),
    recipientName:text(input.recipientName||input.recipient_name),
    contact:digits(input.contact),
    postCode:digits(input.postCode||input.post_code).slice(0,5),
    address:text(input.address),
    addressDetail:text(input.addressDetail||input.address_detail)
  };
}

function validateDestination(input={}){
  const destination=normalizeDestination(input);
  const errors=[];
  if(!/^[A-Z0-9_-]{2,30}$/.test(destination.centerCode))errors.push('물류센터 코드를 확인하세요.');
  if(!destination.label)errors.push('물류센터 표시 이름을 입력하세요.');
  if(!destination.recipientName)errors.push('받는 분 이름을 입력하세요.');
  if(!/^\d{9,12}$/.test(destination.contact))errors.push('연락처를 확인하세요.');
  if(!/^\d{5}$/.test(destination.postCode))errors.push('우편번호는 숫자 5자리여야 합니다.');
  if(!destination.address)errors.push('기본 주소를 입력하세요.');
  if(!destination.addressDetail)errors.push('상세 주소를 입력하세요.');
  return {ok:errors.length===0,errors};
}

function centerCodeFromCost(row={}){
  return text(row.raw_data?.fulfillment_center||row.raw_data?.fulfillmentCenter).toUpperCase();
}

function buildDestinationDirectory({
  costTransactions=[],savedDestinations=[],openReceiver=()=>({}),
  referenceDestinations=wingDestinations.DOMESTIC_DESTINATIONS
}={}){
  const hints=new Set(costTransactions.map(centerCodeFromCost).filter(code=>/^[A-Z0-9_-]{2,30}$/.test(code)));
  const savedByCode=new Map((savedDestinations||[]).filter(row=>row?.is_active!==false).map(row=>[text(row.center_code).toUpperCase(),row]));
  const referenceByCode=new Map((referenceDestinations||[]).map(row=>[text(row.centerCode||row.center_code).toUpperCase(),row]));
  const codes=new Set([...referenceByCode.keys(),...hints,...savedByCode.keys()]);
  return [...codes].sort((a,b)=>a.localeCompare(b,'ko')).map(centerCode=>{
    const saved=savedByCode.get(centerCode)||null;
    const reference=referenceByCode.get(centerCode)||null;
    let receiver={};
    if(saved){try{receiver=openReceiver(saved)||{};}catch{receiver={};}}
    const normalized=normalizeDestination({
      ...(saved?{}:reference),centerCode,label:saved?.label||reference?.label||centerCode,...receiver
    });
    const validation=validateDestination(normalized);
    const source=saved&&reference?'SAVED_AND_REFERENCE':saved&&hints.has(centerCode)?'SAVED_AND_API':saved?'SAVED':reference?wingDestinations.REFERENCE_SOURCE:'COUPANG_API_HINT';
    return Object.freeze({
      id:text(saved?.id),...normalized,source,ready:validation.ok,
      statusLabel:validation.ok?'송장 발급 가능':'주소 등록 필요',
      lastVerifiedAt:saved?.last_verified_at||null,
      supportedSizes:Object.freeze([...(reference?.supportedSizes||[])]),
      referenceUpdatedOn:reference?.referenceUpdatedOn||null
    });
  });
}

function getReferenceDestination(centerCode){
  return wingDestinations.getReferenceDestination(centerCode);
}

function prepareShipmentDrafts({inventory=[],drafts=[]}={}){
  const byVendor=new Map((inventory||[]).map(item=>[text(item.vendor_item_id),item]));
  const valid=[];
  const invalid=[];
  for(const raw of (drafts||[]).slice(0,50)){
    const vendorItemId=text(raw.vendorItemId||raw.vendor_item_id);
    const packageKey=text(raw.packageKey||raw.package_key).slice(0,80);
    const item=byVendor.get(vendorItemId);
    if(!item){invalid.push({vendorItemId,...(packageKey?{packageKey}:{}),error:'최신 로켓그로스 재고에서 상품을 찾지 못했습니다.'});continue;}
    const quantity=Number(raw.quantity);
    const weight=raw.weight==null||text(raw.weight)===''?2:Number(raw.weight);
    const volume=raw.volume==null||text(raw.volume)===''?60:Number(raw.volume);
    if(!Number.isInteger(quantity)||quantity<1||quantity>99999){invalid.push({vendorItemId,error:'발송 수량은 1개 이상이어야 합니다.'});continue;}
    if(!Number.isInteger(weight)||weight<1||weight>30){invalid.push({vendorItemId,error:'포장 무게는 1~30kg 범위여야 합니다.'});continue;}
    if(!Number.isInteger(volume)||volume<1||volume>160){invalid.push({vendorItemId,error:'포장 크기는 1~160cm 범위여야 합니다.'});continue;}
    valid.push({
      vendorItemId,
      ...(packageKey?{packageKey}:{}),
      externalSkuId:text(item.external_sku_id||item.vendor_item_id),
      productName:text(item.productItem?.item_name||item.product_name||item.external_sku_id)||'상품 정보 확인 필요',
      quantity,weight,volume
    });
  }
  return {valid,invalid,truncated:(drafts||[]).length>50};
}

function buildRocketGrowthProductDirectory({inventory=[],productItems=[]}={}){
  const itemByVendor=new Map((productItems||[]).map(item=>[text(item.vendor_item_id),item]));
  const products=new Map();
  for(const row of inventory||[]){
    const vendorItemId=text(row.vendor_item_id);
    if(!vendorItemId||products.has(vendorItemId))continue;
    const productItem=itemByVendor.get(vendorItemId)||{};
    const externalSkuId=text(row.external_sku_id)||vendorItemId;
    products.set(vendorItemId,{
      id:vendorItemId,vendorItemId,externalSkuId,sku:externalSkuId,
      name:text(productItem.item_name||row.product_name||externalSkuId)||'상품 정보 확인 필요',
      orderableQuantity:row.total_orderable_quantity==null?null:Number(row.total_orderable_quantity),
      snapshotAt:row.snapshot_at||null
    });
  }
  return [...products.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.vendorItemId.localeCompare(b.vendorItemId));
}

module.exports={buildDestinationDirectory,buildRocketGrowthProductDirectory,getReferenceDestination,normalizeDestination,prepareShipmentDrafts,validateDestination};
