'use strict';
const diagnostics=require('./collection-diagnostics.js');
const TABLE='moaon_order_collection_receipts',FIELDS='id,status,started_at,finished_at,metadata';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const initial=()=>Object.fromEntries(['cafe24','naver','coupang'].map(key=>[key,{status:'PENDING',code:'PREPARING',observedAt:null}]));
function safeDiagnostic(value){if(!value||!diagnostics.valid(value.code)||!['PENDING','RUNNING','SUCCESS','PARTIAL','FAILED','CHECK_REQUIRED'].includes(value.status))return {status:'CHECK_REQUIRED',code:'RESULT_MISSING',observedAt:null};return {status:value.status,code:value.code,observedAt:value.observedAt||null,...(Number.isInteger(value.httpStatus)&&value.httpStatus>=400&&value.httpStatus<=599?{httpStatus:value.httpStatus}:{})};}
async function load(db,id){const result=await db.from(TABLE).select(FIELDS).eq('id',id).maybeSingle();if(result.error)throw result.error;return result.data;}
async function claim(db,id){const result=await db.from(TABLE).insert({id,status:'RUNNING',metadata:{version:1,channels:initial(),requests:{}}}).select(FIELDS).single();if(result.error?.code==='23505'){const record=await load(db,id);if(!record)throw Error('Collection receipt unavailable');return {created:false,record};}if(result.error)throw result.error;return {created:true,record:result.data};}
async function settle(db,id,channels,requests){const metadata={version:1,channels:Object.fromEntries(['cafe24','naver','coupang'].map(key=>[key,safeDiagnostic(channels[key])])),requests:{}};for(const key of ['naver','coupang'])if(UUID.test(requests[key]?.id||''))metadata.requests[key]=requests[key].id;const result=await db.from(TABLE).update({status:'SETTLED',finished_at:new Date().toISOString(),metadata}).eq('id',id).select(FIELDS).single();if(result.error)throw result.error;return result.data;}
async function response(db,record,worker){
 if(!record)return null;
 const channels=Object.fromEntries(['cafe24','naver','coupang'].map(key=>[key,safeDiagnostic(record.metadata?.channels?.[key])]));
 const requests={naver:null,coupang:null};
 if(record.status==='SETTLED')await Promise.all(['naver','coupang'].map(async key=>{const id=record.metadata?.requests?.[key];if(!UUID.test(id||'')){if(channels[key].status!=='FAILED')channels[key]={status:'CHECK_REQUIRED',code:'RESULT_MISSING',observedAt:null};return;}const result=await db.from(key==='naver'?'coupang_operation_requests':'coupang_sync_requests').select(key==='naver'?'id,status,created_at,started_at,executed_at,error_message':'id,status,requested_at,started_at,finished_at,error_message').eq('id',id).maybeSingle();if(result.error)throw result.error;if(!result.data){channels[key]={status:'CHECK_REQUIRED',code:'RESULT_MISSING',observedAt:null};return;}channels[key]=diagnostics.worker(result.data,worker.ready);const {error_message:ignored,...safe}=result.data;void ignored;requests[key]=safe;}));
 const pending=record.status==='RUNNING'||Object.values(channels).some(row=>['PENDING','RUNNING'].includes(row.status));
 return {ok:true,collection:{id:record.id,status:record.status,startedAt:record.started_at,finishedAt:record.finished_at},pending,requests,channelDiagnostics:channels,worker,partial:Object.values(channels).some(row=>['FAILED','PARTIAL','CHECK_REQUIRED'].includes(row.status))};
}
module.exports={UUID,TABLE,initial,load,claim,settle,response};
