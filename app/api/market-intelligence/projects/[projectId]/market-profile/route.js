import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import marketProfileModule from '../../../../../../lib/market-intelligence/market-profile.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof marketProfileModule.MarketProfileError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'시장범위 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await marketProfileModule.loadMarketProfile({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:128*1024});
    const actor=authModule.requestActor(request),db=supabaseModule.getSupabase(),action=String(body.action||'').toUpperCase();
    if(action==='SAVE_SCOPE')return apiSafety.json({ok:true,...await marketProfileModule.saveScope({db,projectId,input:body.scope||{},actor}),message:'시장범위와 연결 근거를 저장했습니다.'});
    if(action==='SAVE_REVIEW')return apiSafety.json({ok:true,...await marketProfileModule.saveReview({db,projectId,input:body.review||{},actor}),message:'개인정보 없는 리뷰 집계를 저장했습니다.'});
    if(action==='DRAFT_PERSONA')return apiSafety.json({ok:true,...await marketProfileModule.draftPersona({db,projectId}),message:'검증된 리뷰 집계로 페르소나 초안을 만들었습니다.'});
    if(action==='SAVE_PERSONA')return apiSafety.json({ok:true,...await marketProfileModule.savePersona({db,projectId,input:body.persona||{},actor}),message:'리뷰 근거가 연결된 페르소나를 저장했습니다.'});
    throw new marketProfileModule.MarketProfileError('시장범위 작업을 선택해주세요.');
  }catch(error){return replyError(error);}
}
