import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import rawMarketEvidence from '../../../../../../lib/market-intelligence/raw-market-evidence.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof rawMarketEvidence.RawMarketEvidenceError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'원재료·시장환경 자료 확인을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await rawMarketEvidence.loadWorkbench({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:64*1024}),db=supabaseModule.getSupabase(),actor=authModule.requestActor(request);
    if(body.action==='COLLECT')return apiSafety.json({ok:true,...await rawMarketEvidence.collectEvidence({db,projectId,input:body}),message:'원재료·시장환경 자료를 확인했습니다. 자사 수요·원가의 원인으로 자동 확정하지 않습니다.'});
    if(body.action==='SAVE'){
      const result=await rawMarketEvidence.saveCandidate({db,projectId,input:body.candidate||{},actor});
      return apiSafety.json({ok:true,...result,message:result.duplicate?'이미 이 상품 자료실에 저장된 시장환경 근거입니다.':'원재료·시장환경 근거 후보로 저장했습니다. 사장님 확인 전에는 확정하지 않습니다.'},{status:result.duplicate?200:201});
    }
    throw new rawMarketEvidence.RawMarketEvidenceError('지원하지 않는 원재료·시장환경 작업입니다.',400,'UNSUPPORTED_RAW_MARKET_ACTION');
  }catch(error){return replyError(error);}
}
