import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import naverAdResearch from '../../../../../../lib/market-intelligence/naver-ad-research.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof naverAdResearch.MarketNaverAdResearchError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'네이버 광고 키워드 조사를 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params;
    return apiSafety.json({ok:true,...await naverAdResearch.loadWorkbench({db:supabaseModule.getSupabase(),projectId})});
  }catch(error){return replyError(error);}
}

export async function PUT(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:32*1024});
    const result=await naverAdResearch.saveProfile({db:supabaseModule.getSupabase(),projectId,input:body.profile||{},actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,profile:result.profile,message:'선택 상품의 네이버 광고 조사 조건을 저장했습니다.'});
  }catch(error){return replyError(error);}
}

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:48*1024});
    const common={db:supabaseModule.getSupabase(),projectId,input:body.profile||{},actor:authModule.requestActor(request)};
    if(body.action==='DISCOVER'){
      const result=await naverAdResearch.discoverKeywords(common);
      return apiSafety.json({ok:true,...result,message:'선택 상품의 네이버 연관 검색어를 새로 조사했습니다.'});
    }
    if(body.action==='ESTIMATE'){
      const result=await naverAdResearch.estimateBids(common);
      return apiSafety.json({ok:true,...result,message:result.errors.length?'일부 입찰 예상치는 확인이 필요합니다.':'선택 검색어의 PC·모바일 입찰 예상치를 불러왔습니다.'});
    }
    return apiSafety.json({ok:false,error:'실행할 네이버 광고 조사 작업을 다시 선택해주세요.'},{status:400});
  }catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:16*1024});
    const snapshot=await naverAdResearch.confirmSnapshot({db:supabaseModule.getSupabase(),projectId,snapshotId:body.snapshot_id,confirmed:body.confirmed!==false});
    return apiSafety.json({ok:true,snapshot,message:snapshot.owner_confirmed?'이 네이버 광고 조사 자료를 직접 확인했습니다.':'확인 표시를 해제했습니다.'});
  }catch(error){return replyError(error);}
}
