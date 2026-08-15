import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request){
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);const session=authModule.parseSession(token);if(!session)return apiSafety.unauthorized();if(!authModule.roleAtLeast(session,'OWNER'))return apiSafety.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403});
  try{const body=await apiSafety.readJson(request,{maxBytes:24*1024});const items=Array.isArray(body.items)?body.items.slice(0,20):[];if(!items.length||items.some(item=>!['OPERATION','SYNC'].includes(item?.kind)||!UUID.test(String(item?.id||''))))return apiSafety.json({ok:false,error:'다시 처리할 실패 작업을 선택해 주세요.',code:'INVALID_RETRY_ITEMS'},{status:400});
    const db=supabaseModule.getSupabase();const actor=authModule.actor(session);const results=[];
    for(const item of items){const table=item.kind==='OPERATION'?'coupang_operation_requests':'coupang_sync_requests';const found=await db.from(table).select('id,status,manual_retry_count').eq('id',item.id).maybeSingle();if(found.error)throw found.error;if(!found.data||found.data.status!=='FAILED'){results.push({kind:item.kind,id:item.id,requeued:false,reason:'NOT_FAILED'});continue;}
      const now=new Date().toISOString();const updates={status:'PENDING',started_at:null,finished_at:null,collector:null,error_message:null,next_attempt_at:now,dead_lettered_at:null,retry_requested_by:actor,manual_retry_count:Number(found.data.manual_retry_count||0)+1};if(item.kind==='OPERATION'){delete updates.finished_at;updates.executed_at=null;updates.expires_at=new Date(Date.now()+30*60*1000).toISOString();}
      const changed=await db.from(table).update(updates).eq('id',item.id).eq('status','FAILED').select('id,status').maybeSingle();if(changed.error)throw changed.error;results.push({kind:item.kind,id:item.id,requeued:Boolean(changed.data),reason:changed.data?'QUEUED':'ALREADY_CHANGED'});}
    return apiSafety.json({ok:true,requeued:results.filter(item=>item.requeued).length,results});
  }catch(error){console.error('[operations retry]',error);const input=apiSafety.inputErrorResponse(error);return input||apiSafety.json({ok:false,error:error.message||'재시도 요청 실패'},{status:500});}}
