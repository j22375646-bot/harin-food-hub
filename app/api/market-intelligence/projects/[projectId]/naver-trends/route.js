import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import naverTrends from '../../../../../../lib/market-intelligence/naver-trends.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof naverTrends.MarketNaverTrendError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'네이버 수요 신호 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await naverTrends.loadWorkbench({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function PUT(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:32*1024});
    const result=await naverTrends.saveProfile({db:supabaseModule.getSupabase(),projectId,input:body.profile||{},actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,profile:result.profile,message:'선택 상품의 수요 신호 조건을 저장했습니다.'});
  }catch(error){return replyError(error);}
}

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:32*1024});
    const result=await naverTrends.collectTrends({db:supabaseModule.getSupabase(),projectId,input:body.profile||{},actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,...result,message:result.errors.length?'검색 트렌드는 수집했고 일부 자료는 확인이 필요합니다.':'선택 상품의 네이버 수요 신호를 새로 수집했습니다.'});
  }catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:16*1024});
    const snapshot=await naverTrends.confirmSnapshot({db:supabaseModule.getSupabase(),projectId,snapshotId:body.snapshot_id,confirmed:body.confirmed!==false});
    return apiSafety.json({ok:true,snapshot,message:snapshot.owner_confirmed?'이 수요 신호를 직접 확인했습니다.':'확인 표시를 해제했습니다.'});
  }catch(error){return replyError(error);}
}
