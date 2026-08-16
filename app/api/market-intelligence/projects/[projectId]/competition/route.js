import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import competitionModule from '../../../../../../lib/market-intelligence/competition.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof competitionModule.CompetitionError||error?.name==='MarketProfileError'
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'경쟁 분석 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await competitionModule.loadCompetition({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:128*1024});
    const actor=authModule.requestActor(request),db=supabaseModule.getSupabase(),action=String(body.action||'').toUpperCase();
    if(action==='SAVE_COMPETITOR')return apiSafety.json({ok:true,...await competitionModule.saveCompetitor({db,projectId,input:body.competitor||{},actor}),message:'경쟁상품과 확인 근거를 저장했습니다.'});
    if(action==='SAVE_COMPETITOR_REVIEW')return apiSafety.json({ok:true,...await competitionModule.saveReview({db,projectId,input:body.review||{},actor}),message:'개인정보 없는 경쟁 리뷰 집계를 저장했습니다.'});
    if(action==='SAVE_APPEAL')return apiSafety.json({ok:true,...await competitionModule.saveAppeal({db,projectId,input:body.appeal||{},actor}),message:'경쟁 불편과 우리 해결 근거를 연결했습니다.'});
    throw new competitionModule.CompetitionError('경쟁 분석 작업을 선택해주세요.');
  }catch(error){return replyError(error);}
}
