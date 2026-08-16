import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import conversionModule from '../../../../../../lib/market-intelligence/conversion.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof conversionModule.ConversionError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'구매 전환 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await conversionModule.loadConversion({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:128*1024});
    const actor=authModule.requestActor(request),db=supabaseModule.getSupabase(),action=String(body.action||'').toUpperCase();
    if(action==='SAVE_BARRIER')return apiSafety.json({ok:true,...await conversionModule.saveBarrier({db,projectId,input:body.barrier||{},actor}),message:'구매 장벽과 확인 근거를 저장했습니다.'});
    if(action==='SAVE_FEEDBACK')return apiSafety.json({ok:true,...await conversionModule.saveFeedback({db,projectId,input:body.feedback||{},actor}),message:'상세페이지 수정안과 성공 확인 지표를 저장했습니다.'});
    throw new conversionModule.ConversionError('구매 전환 작업을 선택해주세요.');
  }catch(error){return replyError(error);}
}
