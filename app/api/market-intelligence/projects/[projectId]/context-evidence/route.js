import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import contextEvidence from '../../../../../../lib/market-intelligence/context-evidence.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const replyError=error=>error instanceof contextEvidence.MarketContextEvidenceError?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status}):apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'시장 근거 작업을 완료하지 못했습니다.'},{status:500});
export async function GET(request,{params}){if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();try{const {projectId}=await params;return apiSafety.json({ok:true,...await contextEvidence.loadWorkbench({db:supabaseModule.getSupabase(),projectId})});}catch(error){return replyError(error);}}
export async function POST(request,{params}){if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();try{const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:64*1024}),db=supabaseModule.getSupabase(),actor=authModule.requestActor(request);if(body.action==='COLLECT')return apiSafety.json({ok:true,...await contextEvidence.collectEvidence({db,projectId,input:body}),message:'시장·계절 자료 확인을 마쳤습니다. 저장 전에는 분석 근거로 사용하지 않습니다.'});if(body.action==='SAVE'){const result=await contextEvidence.saveCandidate({db,projectId,input:body.candidate||{},actor});return apiSafety.json({ok:true,...result,message:result.duplicate?'이미 이 상품 Evidence에 저장된 자료입니다.':'검토할 시장 근거 후보로 저장했습니다.'},{status:result.duplicate?200:201});}throw new contextEvidence.MarketContextEvidenceError('지원하지 않는 시장 근거 작업입니다.',400,'UNSUPPORTED_MARKET_CONTEXT_ACTION');}catch(error){return replyError(error);}}
