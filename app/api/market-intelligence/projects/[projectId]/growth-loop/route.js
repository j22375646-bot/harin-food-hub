import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import growthLoopModule from '../../../../../../lib/market-intelligence/growth-loop.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof growthLoopModule.GrowthLoopError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'성장 흐름 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await growthLoopModule.loadGrowthLoop({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:128*1024});
    const actor=authModule.requestActor(request),action=String(body.action||'').toUpperCase();
    if(action==='SAVE_LEVER')return apiSafety.json({ok:true,...await growthLoopModule.saveLever({db:supabaseModule.getSupabase(),projectId,input:body.lever||{},actor}),message:'성장 가설과 확인 근거를 저장했습니다.'});
    throw new growthLoopModule.GrowthLoopError('성장 흐름 작업을 선택해주세요.');
  }catch(error){return replyError(error);}
}
