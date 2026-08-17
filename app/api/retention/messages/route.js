import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Client from '../../../../lib/cafe24/client.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import repurchase from '../../../../lib/customers/repurchase-messaging.js';
import solapi from '../../../../lib/messaging/solapi.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeSecret=()=>process.env.DASHBOARD_SESSION_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;
const sessionFor=request=>authModule.parseSession(apiSafety.cookieValue(request,authModule.COOKIE_NAME));
const receiverFrom=payload=>{const row=Array.isArray(payload?.receivers)?payload.receivers[0]:payload?.receiver||payload?.receivers||{};return {name:String(row.name||''),phone:String(row.virtual_phone_no||row.cellphone||row.phone||'')};};

function publicCampaign(row={}){return {id:row.id,status:row.status,audienceType:row.audience_type,messageType:row.message_type,messageBody:row.message_body,targetCount:row.target_count,unitPrice:Number(row.unit_price||0),estimatedCost:Number(row.estimated_cost||0),sourceCheckedAt:row.source_checked_at,consentConfirmedAt:row.consent_confirmed_at,complianceConfirmedAt:row.compliance_confirmed_at,approvedAt:row.approved_at,sentAt:row.sent_at,errorMessage:row.error_message,createdAt:row.created_at,recipients:Array.isArray(row.recipient_summary)?row.recipient_summary:[]};}

async function baseCandidates(db){
  const [ordersResult,itemsResult]=await Promise.all([
    db.from('cafe24_orders').select('order_id,order_date,customer_id,payment_status,cancel_amount,refund_amount,raw_data').order('order_date',{ascending:true}).limit(10000),
    db.from('cafe24_order_items').select('order_id,product_name,quantity').limit(20000)
  ]);
  if(ordersResult.error)throw ordersResult.error;if(itemsResult.error)throw itemsResult.error;
  const dates=(ordersResult.data||[]).map(row=>new Date(row.order_date)).filter(row=>Number.isFinite(row.getTime())).sort((a,b)=>a-b);
  const historyDays=dates.length?Math.max(1,Math.round((dates.at(-1)-dates[0])/86400000)+1):0;
  return repurchase.buildCandidates({orders:ordersResult.data||[],items:itemsResult.data||[],historyDays,asOf:new Date(),secret:safeSecret()});
}

async function enrichCandidates(rows){
  const config=cafe24Config.getConfig(), output=[];
  for(const candidate of rows.slice(0,30)){
    try{const response=await cafe24Client.adminGet(config,`/orders/${encodeURIComponent(candidate.orderRef)}/receivers`);const receiver=receiverFrom(response.payload);output.push({public:repurchase.publicCandidate(candidate,receiver),phone:receiver.phone});}
    catch{output.push({public:repurchase.publicCandidate(candidate,{}),phone:''});}
  }
  return output;
}

async function workbench(db){
  const campaigns=await db.from('repurchase_message_campaigns').select('*').order('created_at',{ascending:false}).limit(10);
  if(campaigns.error)throw campaigns.error;
  return {configuration:solapi.configuration(),campaigns:(campaigns.data||[]).map(publicCampaign)};
}

export async function GET(request){
  const session=sessionFor(request);if(!session)return apiSafety.unauthorized();if(!authModule.roleAtLeast(session,'OWNER'))return apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403});
  try{return apiSafety.json({ok:true,...await workbench(supabaseModule.getSupabase())});}
  catch(error){console.error('[repurchase messages read]',{message:error.message});return apiSafety.json({ok:false,error:'재구매 메시지 운영상태를 불러오지 못했습니다.'},{status:500});}
}

export async function POST(request){
  const session=sessionFor(request);if(!session)return apiSafety.unauthorized();if(!authModule.roleAtLeast(session,'OWNER'))return apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403});
  try{
    const body=await apiSafety.readJson(request,{maxBytes:64*1024}),action=String(body.action||'').toUpperCase(),db=supabaseModule.getSupabase();
    if(action==='PREVIEW'){
      const result=await baseCandidates(db);if(!result.ready)return apiSafety.json({ok:true,ready:false,reason:result.reason,candidates:[],...await workbench(db)});
      const enriched=await enrichCandidates(result.candidates);
      return apiSafety.json({ok:true,ready:true,candidates:enriched.map(row=>row.public),...await workbench(db)});
    }
    if(action==='CREATE_DRAFT'){
      const messageBody=String(body.messageBody||'').trim();if(!messageBody||messageBody.length>1800)return apiSafety.json({ok:false,error:'메시지 본문은 1~1,800자로 입력하세요.'},{status:400});
      const selected=[...new Set((Array.isArray(body.recipientRefs)?body.recipientRefs:[]).map(String))].slice(0,50);if(!selected.length)return apiSafety.json({ok:false,error:'발송 후보를 선택하세요.'},{status:400});
      const fresh=await baseCandidates(db);const matched=fresh.candidates.filter(row=>selected.includes(row.recipientRef));if(matched.length!==selected.length)return apiSafety.json({ok:false,error:'후보 자료가 변경되었습니다. 대상을 다시 확인하세요.'},{status:409});
      const enriched=await enrichCandidates(matched);const config=solapi.configuration(),messageText=repurchase.messageText(messageBody,process.env.SOLAPI_OPTOUT_NUMBER),cost=solapi.estimateCost(messageText,matched.length,config.prices);
      const inserted=await db.from('repurchase_message_campaigns').insert({status:'DRAFT',audience_type:new Set(matched.map(row=>row.audience)).size===1?matched[0].audience:'MIXED',message_type:cost.type,message_body:messageBody,message_text:messageText,recipient_refs:matched.map(row=>row.recipientRef),recipient_summary:enriched.map(row=>row.public),target_count:matched.length,unit_price:cost.unitPrice,estimated_cost:cost.total,source_checked_at:new Date().toISOString()}).select('*').single();
      if(inserted.error)throw inserted.error;return apiSafety.json({ok:true,campaign:publicCampaign(inserted.data),...await workbench(db)},{status:201});
    }
    if(!UUID.test(String(body.campaignId||'')))return apiSafety.json({ok:false,error:'캠페인 번호를 확인하세요.'},{status:400});
    const current=await db.from('repurchase_message_campaigns').select('*').eq('id',body.campaignId).maybeSingle();if(current.error)throw current.error;if(!current.data)return apiSafety.json({ok:false,error:'캠페인을 찾지 못했습니다.'},{status:404});
    if(action==='APPROVE'){
      if(current.data.status!=='DRAFT')return apiSafety.json({ok:false,error:'작성 중 캠페인만 승인할 수 있습니다.'},{status:409});
      if(body.consentConfirmed!==true||body.complianceConfirmed!==true)return apiSafety.json({ok:false,error:'광고성 정보 수신동의 원본과 광고 표기·무료수신거부를 모두 확인해야 합니다.'},{status:400});
      if(!process.env.SOLAPI_OPTOUT_NUMBER)return apiSafety.json({ok:false,error:'무료수신거부 번호 설정 후 승인할 수 있습니다.'},{status:409});
      const now=new Date().toISOString(),updated=await db.from('repurchase_message_campaigns').update({status:'APPROVED',consent_confirmed_at:now,compliance_confirmed_at:now,approved_by:session.username||'owner',approved_at:now}).eq('id',current.data.id).eq('status','DRAFT').select('*').single();if(updated.error)throw updated.error;
      return apiSafety.json({ok:true,campaign:publicCampaign(updated.data),...await workbench(db)});
    }
    if(action==='SEND'){
      if(current.data.status!=='APPROVED')return apiSafety.json({ok:false,error:'사장님 승인 완료 캠페인만 발송할 수 있습니다.'},{status:409});
      const fresh=await baseCandidates(db),refs=current.data.recipient_refs||[],matched=fresh.candidates.filter(row=>refs.includes(row.recipientRef));if(matched.length!==refs.length)return apiSafety.json({ok:false,error:'재구매 대상이 변경되었습니다. 새 캠페인으로 다시 확인하세요.'},{status:409});
      const enriched=await enrichCandidates(matched),recipients=enriched.filter(row=>row.phone).map(row=>({phone:row.phone}));if(recipients.length!==matched.length)return apiSafety.json({ok:false,error:'연락처를 다시 확인하지 못한 고객이 있어 발송하지 않았습니다.'},{status:409});
      await db.from('repurchase_message_campaigns').update({status:'SENDING',error_code:null,error_message:null}).eq('id',current.data.id).eq('status','APPROVED');
      try{const result=await solapi.sendBatch({recipients,body:current.data.message_text});const status=result.count.failed>0?'PARTIAL':'SENT',updated=await db.from('repurchase_message_campaigns').update({status,provider_group_id:result.groupId,provider_result:result,sent_at:new Date().toISOString()}).eq('id',current.data.id).select('*').single();if(updated.error)throw updated.error;return apiSafety.json({ok:true,campaign:publicCampaign(updated.data),...await workbench(db)});}
      catch(error){await db.from('repurchase_message_campaigns').update({status:'FAILED',error_code:error.code||'SEND_FAILED',error_message:String(error.message||'발송 실패').slice(0,500)}).eq('id',current.data.id);throw error;}
    }
    return apiSafety.json({ok:false,error:'지원하지 않는 작업입니다.'},{status:400});
  }catch(error){console.error('[repurchase messages write]',{code:error.code||'ERROR',message:error.message});return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'재구매 메시지 작업에 실패했습니다.'},{status:error.status||500});}
}
