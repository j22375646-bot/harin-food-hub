'use strict';
const {buildCustomerServiceOperationSummary}=require('../customer-service/operation-summary.js');
const {csDetails}=require('./workspace-cs-details.js');
async function loadWorkspaceCs({db,now=()=>new Date(),secret,includeDetails=false}={}){
 const specs=[
  ['customerServiceRows','customer_service_items','source_key,platform,kind,completed,status,occurred_at,title_envelope,content_envelope,source_updated_at','occurred_at'],
  ['coupangInquiries','coupang_inquiries','inquiry_key,inquiry_id,answered,status,inquired_at,inquiry_type,question_text,thread_envelope:raw_data->cs_thread_encrypted,updated_at','inquired_at'],
  ['coupangReturns','coupang_returns','receipt_id,status,cancel_type,requested_at','requested_at'],
  ['coupangExchanges','coupang_exchanges','exchange_id,status,requested_at','requested_at']
 ];
 const results=await Promise.all(specs.map(async([key,table,columns,order])=>{
  const selected=includeDetails?columns:columns.split(',').filter(c=>!['title_envelope','content_envelope','source_updated_at','inquiry_type','question_text','thread_envelope:raw_data->cs_thread_encrypted','updated_at'].includes(c)).join(',');
  let query=db.from(table).select(selected);
  if(key==='customerServiceRows')query=query.or('completed.eq.false,completed.is.null');
  if(key==='coupangInquiries')query=query.or('answered.eq.false,answered.is.null');
  const result=await query.order(order,{ascending:false}).limit(201);
  if(result?.error||!Array.isArray(result?.data))throw Error('CS unavailable');
  return result.data;
 }));
 const items=[],seen=new Set();
 results.forEach((rows,index)=>rows.forEach(row=>{
  const active=buildCustomerServiceOperationSummary({[specs[index][0]]:[row]}).active[0];if(!active)return;
  if(!['NAVER','CAFE24','COUPANG'].includes(active.platform)||!['INQUIRY','CANCEL','RETURN','EXCHANGE'].includes(active.kind))throw Error('Unknown CS source');
  if(typeof active.id!=='string'||!active.id||active.id.length>240||seen.has(active.id))throw Error('Invalid CS identity');seen.add(active.id);
  const rawDate=row.occurred_at||row.requested_at||row.inquired_at;
  items.push({...active,status:typeof row.status==='string'?row.status.slice(0,80):'확인 필요',occurredAt:rawDate&&Number.isFinite(Date.parse(rawDate))?new Date(rawDate).toISOString():null,...(includeDetails?{details:csDetails(row,{secret})}:{})});
 }));
 items.sort((a,b)=>(b.occurredAt||'').localeCompare(a.occurredAt||'')||a.id.localeCompare(b.id));
 return {status:'READY',writePolicy:'READ_ONLY',generatedAt:now().toISOString(),truncated:results.some(rows=>rows.length>=201)||items.length>200,items:items.slice(0,200)};
}
module.exports={loadWorkspaceCs};
