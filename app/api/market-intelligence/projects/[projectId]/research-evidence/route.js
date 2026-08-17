import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import researchEvidence from '../../../../../../lib/market-intelligence/research-evidence.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof researchEvidence.MarketResearchEvidenceError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'연구 근거 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await researchEvidence.loadWorkbench({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:64*1024}),db=supabaseModule.getSupabase(),actor=authModule.requestActor(request);
    if(body.action==='COLLECT')return apiSafety.json({ok:true,...await researchEvidence.collectEvidence({db,projectId,input:body}),message:'연구자료 확인을 마쳤습니다. 저장 전에는 분석 근거나 판매문구로 사용하지 않습니다.'});
    if(body.action==='SAVE'){
      const result=await researchEvidence.saveCandidate({db,projectId,input:body.candidate||{},actor});
      return apiSafety.json({ok:true,...result,message:result.duplicate?'이미 이 상품 자료실에 저장된 연구 근거입니다.':'연구 근거 후보로 저장했습니다. 사장님 확인 전에는 확정하지 않습니다.'},{status:result.duplicate?200:201});
    }
    throw new researchEvidence.MarketResearchEvidenceError('지원하지 않는 연구 근거 작업입니다.',400,'UNSUPPORTED_RESEARCH_EVIDENCE_ACTION');
  }catch(error){return replyError(error);}
}
