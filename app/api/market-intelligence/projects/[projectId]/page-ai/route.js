import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import pageAiModule from '../../../../../../lib/market-intelligence/page-ai.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function replyError(error){
  if(error instanceof pageAiModule.MarketPageAiError)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
  const inputError=apiSafety.inputErrorResponse(error);
  return inputError||apiSafety.json({ok:false,error:error.message||'상품별 페이지 AI 자료를 만들지 못했습니다.'},{status:500});
}

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,workspace=new URL(request.url).searchParams.get('workspace');
    const data=await pageAiModule.loadPageAi({db:supabaseModule.getSupabase(),projectId,workspace});
    return apiSafety.json({ok:true,...data});
  }catch(error){console.error('[market page ai get]',error);return replyError(error);}
}

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:16*1024});
    const saved=await pageAiModule.savePreview({db:supabaseModule.getSupabase(),projectId,workspace:body.workspace,actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,reused:saved.reused,record:saved.record,preview:saved.preview,openai_called:false,cost_krw:0,message:saved.reused?'같은 상품·단계 자료의 미리보기를 불러왔습니다.':'현재 상품·단계의 비용 없는 미리보기를 저장했습니다.'});
  }catch(error){console.error('[market page ai post]',error);return replyError(error);}
}
