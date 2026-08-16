import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import executionModule from '../../../../../../lib/market-intelligence/execution-bridge.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof executionModule.ExecutionBridgeError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'실행 연결 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await executionModule.loadExecutionBridge({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:128*1024}),actor=authModule.requestActor(request),db=supabaseModule.getSupabase();
    const action=String(body.action||'').toUpperCase();let result,message;
    if(action==='SAVE_PLAN'){result=await executionModule.savePlan({db,projectId,input:body.plan||{},actor});message='상품별 실행계획 초안을 저장했습니다.';}
    else if(['REQUEST_APPROVAL','APPROVE_PLAN','REJECT_PLAN'].includes(action)){result=await executionModule.transitionPlan({db,projectId,planId:body.plan_id,action,note:body.note,actor});message=action==='REQUEST_APPROVAL'?'사장님 승인 대기로 보냈습니다.':action==='APPROVE_PLAN'?'사장님 승인 기록을 남겼습니다.':'반려하고 수정 가능한 상태로 돌렸습니다.';}
    else if(action==='CREATE_DRAFT_EXPERIMENT'){result=await executionModule.createDraftExperiment({db,projectId,planId:body.plan_id,actor});message='기존 실험실에 초안을 만들었습니다. 아직 플랫폼은 변경되지 않았습니다.';}
    else if(action==='GENERATE_REPORT'){result=await executionModule.generateReport({db,projectId,planId:body.plan_id,actor});message='상품별 실행 보고서를 새로 만들었습니다.';}
    else throw new executionModule.ExecutionBridgeError('실행 연결 작업을 선택해주세요.');
    return apiSafety.json({ok:true,...result,message});
  }catch(error){return replyError(error);}
}
