import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import baselineModule from '../../../../../../lib/market-intelligence/baseline.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof baselineModule.MarketBaselineError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'상품 기준선 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await baselineModule.loadBaseline({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:128*1024});
    const actor=authModule.requestActor(request),db=supabaseModule.getSupabase(),action=String(body.action||'').toUpperCase();
    if(action==='PREPARE'||action==='REFRESH_LEGACY')return apiSafety.json({ok:true,...await baselineModule.prepareBaseline({db,projectId,actor,refresh:action==='REFRESH_LEGACY'}),message:action==='REFRESH_LEGACY'?'기존 자료와 채널 옵션을 다시 비교했습니다.':'상품 기준선을 준비했습니다.'});
    if(action==='SAVE')return apiSafety.json({ok:true,...await baselineModule.saveBaseline({db,projectId,input:body.baseline||{},actor}),message:'상품·옵션·정책 기준선을 저장했습니다.'});
    throw new baselineModule.MarketBaselineError('상품 기준선 작업을 선택해주세요.');
  }catch(error){return replyError(error);}
}
