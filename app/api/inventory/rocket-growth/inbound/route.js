import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import operationQueue from '../../../../../lib/coupang/operation-queue.js';
import mapLimitModule from '../../../../../lib/async/map-limit.js';
import inboundModule from '../../../../../lib/inventory/rocket-growth-inbound.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=value=>String(value==null?'':value).trim();
const destinationFields='id,center_code,label,receiver_encrypted,source,is_active,last_verified_at,created_at,updated_at';
const shipmentFields='id,batch_id,shipment_reference,destination_id,destination_code,vendor_item_id,external_sku_id,product_name,quantity,weight,volume,status,operation_request_id,error_message,created_at,updated_at';
const operationFields='id,status,result_json,error_message,created_at,started_at,executed_at';

function publicHistory(shipment,operation){
  let trackingNo='';
  if(operation?.status==='SUCCESS'){
    try{trackingNo=text(operationQueue.open(operation.result_json).epostLive?.trackingNo);}catch{trackingNo='';}
  }
  const status=operation?.status==='SUCCESS'?'ISSUED':operation?.status==='FAILED'?'FAILED':operation?.status==='RUNNING'?'ISSUING':shipment.status||'QUEUED';
  return {
    id:shipment.id,batchId:shipment.batch_id,shipmentReference:shipment.shipment_reference,
    centerCode:shipment.destination_code,vendorItemId:shipment.vendor_item_id,externalSkuId:shipment.external_sku_id,
    productName:shipment.product_name,quantity:shipment.quantity,weight:shipment.weight,volume:shipment.volume,
    status,trackingNo,error:operation?.error_message||shipment.error_message||'',createdAt:shipment.created_at,
    updatedAt:operation?.executed_at||operation?.started_at||shipment.updated_at
  };
}

async function loadDirectory(db){
  const [saved,costs]=await Promise.all([
    db.from('rocket_growth_destinations').select(destinationFields).eq('is_active',true).order('center_code'),
    db.from('coupang_cost_transactions').select('raw_data').order('event_date',{ascending:false}).limit(2000)
  ]);
  if(saved.error)throw saved.error;
  if(costs.error)throw costs.error;
  return inboundModule.buildDestinationDirectory({
    savedDestinations:saved.data||[],costTransactions:costs.data||[],
    openReceiver:row=>operationQueue.open(row.receiver_encrypted)
  });
}

async function loadRocketGrowthProducts(db){
  const inventory=await db.from('coupang_rg_inventory')
    .select('vendor_item_id,external_sku_id,total_orderable_quantity,snapshot_at')
    .order('snapshot_at',{ascending:false}).limit(1000);
  if(inventory.error)throw inventory.error;
  const vendorIds=[...new Set((inventory.data||[]).map(row=>text(row.vendor_item_id)).filter(Boolean))];
  const productItems=vendorIds.length
    ?await db.from('coupang_product_items').select('vendor_item_id,item_name').in('vendor_item_id',vendorIds)
    :{data:[],error:null};
  if(productItems.error)throw productItems.error;
  return inboundModule.buildRocketGrowthProductDirectory({inventory:inventory.data||[],productItems:productItems.data||[]});
}

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const db=supabaseModule.getSupabase();
    const [destinations,products,shipments]=await Promise.all([
      loadDirectory(db),
      loadRocketGrowthProducts(db),
      db.from('rocket_growth_inbound_shipments').select(shipmentFields).order('created_at',{ascending:false}).limit(100)
    ]);
    if(shipments.error)throw shipments.error;
    const operationIds=(shipments.data||[]).map(row=>row.operation_request_id).filter(Boolean);
    const operations=operationIds.length
      ?await db.from('coupang_operation_requests').select(operationFields).in('id',operationIds)
      :{data:[],error:null};
    if(operations.error)throw operations.error;
    const operationById=new Map((operations.data||[]).map(row=>[row.id,row]));
    const history=(shipments.data||[]).map(row=>publicHistory(row,operationById.get(row.operation_request_id)));
    return apiSafety.json({ok:true,destinations,products,history},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('[rocket growth inbound get]',{message:error.message});
    return apiSafety.json({ok:false,error:'로켓그로스 입고 송장 자료를 불러오지 못했습니다.'},{status:500});
  }
}

async function saveDestination(db,body){
  if(body.confirm!==true)return apiSafety.json({ok:false,error:'물류센터 주소 저장 확인이 필요합니다.'},{status:400});
  const destination=inboundModule.normalizeDestination(body.destination||{});
  const validation=inboundModule.validateDestination(destination);
  if(!validation.ok)return apiSafety.json({ok:false,error:validation.errors.join(' ')},{status:400});
  const saved=await db.from('rocket_growth_destinations').upsert({
    center_code:destination.centerCode,label:destination.label,
    receiver_encrypted:operationQueue.seal({
      recipientName:destination.recipientName,contact:destination.contact,postCode:destination.postCode,
      address:destination.address,addressDetail:destination.addressDetail
    }),
    source:'MANUAL',is_active:true,last_verified_at:new Date().toISOString()
  },{onConflict:'center_code'}).select('id,center_code,label,last_verified_at').single();
  if(saved.error)throw saved.error;
  return apiSafety.json({ok:true,destination:{id:saved.data.id,centerCode:saved.data.center_code,label:saved.data.label,lastVerifiedAt:saved.data.last_verified_at}},{headers:{'Cache-Control':'no-store'}});
}

function openDestination(row){
  const receiver=operationQueue.open(row.receiver_encrypted);
  const destination=inboundModule.normalizeDestination({centerCode:row.center_code,label:row.label,...receiver});
  const validation=inboundModule.validateDestination(destination);
  if(!validation.ok)throw Object.assign(new Error(`물류센터 주소 확인 필요 · ${validation.errors.join(' ')}`),{status:409});
  return destination;
}

async function resolveDestinationForIssue(db,body){
  const requestedId=text(body.destinationId);
  if(UUID.test(requestedId)){
    const found=await db.from('rocket_growth_destinations').select(destinationFields).eq('id',requestedId).eq('is_active',true).maybeSingle();
    if(found.error)throw found.error;
    if(!found.data)throw Object.assign(new Error('저장된 물류센터를 찾지 못했습니다.'),{status:404});
    return {id:found.data.id,destination:openDestination(found.data)};
  }

  const destinationCode=text(body.destinationCode).toUpperCase();
  const reference=inboundModule.getReferenceDestination(destinationCode);
  if(!reference)throw Object.assign(new Error('첨부 Wing 기준 주소록의 로켓그로스 물류센터를 선택하세요.'),{status:400});

  const existing=await db.from('rocket_growth_destinations').select(destinationFields).eq('center_code',destinationCode).eq('is_active',true).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data)return {id:existing.data.id,destination:openDestination(existing.data)};

  const normalized=inboundModule.normalizeDestination(reference);
  const validation=inboundModule.validateDestination(normalized);
  if(!validation.ok)throw Object.assign(new Error(`Wing 주소록 확인 필요 · ${validation.errors.join(' ')}`),{status:409});
  const saved=await db.from('rocket_growth_destinations').upsert({
    center_code:normalized.centerCode,label:normalized.label,
    receiver_encrypted:operationQueue.seal({
      recipientName:normalized.recipientName,contact:normalized.contact,postCode:normalized.postCode,
      address:normalized.address,addressDetail:normalized.addressDetail
    }),
    source:'MANUAL',is_active:true,last_verified_at:`${reference.referenceUpdatedOn}T00:00:00.000Z`
  },{onConflict:'center_code'}).select(destinationFields).single();
  if(saved.error)throw saved.error;
  return {id:saved.data.id,destination:openDestination(saved.data)};
}

async function issueBatch(db,body){
  if(body.confirm!==true)return apiSafety.json({ok:false,error:'실제 우체국 송장 일괄 발급 확인이 필요합니다.'},{status:400});
  const drafts=(Array.isArray(body.shipments)?body.shipments:[]).slice(0,50);
  if(!drafts.length)return apiSafety.json({ok:false,error:'송장을 발급할 로켓그로스 상품을 선택하세요.'},{status:400});
  const resolvedDestination=await resolveDestinationForIssue(db,body);
  const destinationId=resolvedDestination.id;
  const destination=resolvedDestination.destination;

  const vendorIds=[...new Set(drafts.map(row=>text(row.vendorItemId)).filter(Boolean))];
  const [inventoryResult,productResult]=await Promise.all([
    db.from('coupang_rg_inventory').select('vendor_item_id,external_sku_id').in('vendor_item_id',vendorIds),
    db.from('coupang_product_items').select('vendor_item_id,item_name').in('vendor_item_id',vendorIds)
  ]);
  if(inventoryResult.error)throw inventoryResult.error;
  if(productResult.error)throw productResult.error;
  const products=new Map((productResult.data||[]).map(row=>[text(row.vendor_item_id),row]));
  const inventory=(inventoryResult.data||[]).map(row=>({...row,productItem:products.get(text(row.vendor_item_id))||null}));
  const prepared=inboundModule.prepareShipmentDrafts({inventory,drafts});
  if(!prepared.valid.length)return apiSafety.json({ok:false,error:prepared.invalid[0]?.error||'송장 발급 가능한 상품이 없습니다.',invalid:prepared.invalid},{status:409});

  const batchId=crypto.randomUUID();
  const results=await mapLimitModule.mapLimit(prepared.valid,4,async item=>{
    const shipmentId=crypto.randomUUID();
    const shipmentReference=`RGI-${shipmentId.replaceAll('-','').slice(0,12).toUpperCase()}`;
    const inserted=await db.from('rocket_growth_inbound_shipments').insert({
      id:shipmentId,batch_id:batchId,shipment_reference:shipmentReference,destination_id:destinationId,
      destination_code:destination.centerCode,vendor_item_id:item.vendorItemId,external_sku_id:item.externalSkuId,
      product_name:item.productName,quantity:item.quantity,weight:item.weight,volume:item.volume,status:'QUEUED'
    }).select(shipmentFields).single();
    if(inserted.error)return {vendorItemId:item.vendorItemId,ok:false,error:inserted.error.message};
    try{
      const queued=await operationQueue.queueOperation(db,{
        operationType:'EPOST_LIVE_ISSUE',targetType:'CHANNEL',targetId:shipmentReference,
        idempotencyKey:`epost-rg-inbound:${shipmentId}`,
        payload:{live:true,order:{
          hubOrderId:shipmentReference,platform:'COUPANG_RG_INBOUND',externalOrderId:batchId,shipmentId:'',
          goodsName:item.productName,quantity:item.quantity,weight:item.weight,volume:item.volume,
          receiver:{name:destination.recipientName,contact:destination.contact,postCode:destination.postCode,address:destination.address,addressDetail:destination.addressDetail,message:`로켓그로스 ${destination.centerCode} 입고`}
        }}
      });
      const updated=await db.from('rocket_growth_inbound_shipments').update({operation_request_id:queued.request.id,status:queued.completed?'ISSUED':'QUEUED'}).eq('id',shipmentId);
      if(updated.error)throw updated.error;
      return {shipmentId,shipmentReference,vendorItemId:item.vendorItemId,ok:true,pending:!queued.completed,requestId:queued.request.id};
    }catch(error){
      await db.from('rocket_growth_inbound_shipments').update({status:'FAILED',error_message:text(error.message).slice(0,500)}).eq('id',shipmentId);
      return {shipmentId,shipmentReference,vendorItemId:item.vendorItemId,ok:false,error:error.message};
    }
  });
  const succeeded=results.filter(row=>row.ok).length;
  return apiSafety.json({ok:succeeded>0,batchId,succeeded,failed:results.length-succeeded+prepared.invalid.length,results,invalid:prepared.invalid},{status:succeeded?202:409,headers:{'Cache-Control':'no-store'}});
}

export async function POST(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request,{maxBytes:64*1024});
    const action=text(body.action).toUpperCase();
    const db=supabaseModule.getSupabase();
    if(action==='SAVE_DESTINATION')return saveDestination(db,body);
    if(action==='ISSUE_BATCH')return issueBatch(db,body);
    return apiSafety.json({ok:false,error:'지원하지 않는 로켓그로스 입고 작업입니다.'},{status:400});
  }catch(error){
    console.error('[rocket growth inbound post]',{code:error.code||'ERROR',message:error.message});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:'로켓그로스 입고 송장 작업을 처리하지 못했습니다.'},{status:error.status||500});
  }
}
