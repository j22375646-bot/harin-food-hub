import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import naverEvidence from '../../../../../../lib/market-intelligence/naver-evidence.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof naverEvidence.MarketNaverEvidenceError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'네이버 근거 후보 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await naverEvidence.loadWorkbench({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:64*1024}),db=supabaseModule.getSupabase(),actor=authModule.requestActor(request);
    if(body.action==='SEARCH'){
      const result=await naverEvidence.searchEvidence({db,projectId,input:body,actor});
      return apiSafety.json({ok:true,...result,message:result.errors.length?'일부 출처는 확인이 필요하지만 나머지 근거 후보를 가져왔습니다.':'네이버 근거 후보를 가져왔습니다.'});
    }
    if(body.action==='SAVE'){
      const result=await naverEvidence.saveCandidate({db,projectId,input:body.candidate||{},actor});
      return apiSafety.json({ok:true,...result,message:result.duplicate?'이미 이 상품 자료실에 저장된 원문입니다.':'근거 후보로 저장했습니다. 원문 확인 전에는 분석에 쓰지 않습니다.'},{status:result.duplicate?200:201});
    }
    throw new naverEvidence.MarketNaverEvidenceError('지원하지 않는 네이버 근거 후보 작업입니다.',400,'UNSUPPORTED_NAVER_EVIDENCE_ACTION');
  }catch(error){return replyError(error);}
}
