import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import openaiClient from '../../../../lib/ai/openai-client.js';
import pageAnalysis from '../../../../lib/ai/page-analysis.js';
import privacy from '../../../../lib/ai/privacy.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

function ownerSession(request){
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return {error:apiSafety.unauthorized()};
  if(!authModule.roleAtLeast(session,'OWNER'))return {error:apiSafety.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403})};
  return {session};
}

export async function POST(request){
  const access=ownerSession(request);
  if(access.error)return access.error;
  const config=openaiClient.configuration();
  if(!config.execution_enabled){
    return apiSafety.json({ok:false,error:'AI 자동분석은 아직 사용 전입니다. 크레딧 연결 후 운영 설정에서 켜주세요.',code:'AI_EXECUTION_DISABLED',openai_called:false,cost_krw:0},{status:503});
  }
  try{
    const body=await apiSafety.readJson(request,{maxBytes:24*1024});
    const snapshot=authModule.verifyAiSnapshot(body.snapshot_token);
    if(!snapshot)return apiSafety.json({ok:false,error:'분석 자료가 만료되었거나 변경되었습니다. 화면을 새로고침해주세요.',code:'INVALID_AI_SNAPSHOT'},{status:409});
    privacy.assertNoPii(snapshot);
    const analyzed=await pageAnalysis.analyzePageSnapshot({
      snapshot,db:supabaseModule.getSupabase(),actor:authModule.actor(access.session),force:body.force===true
    });
    return apiSafety.json({ok:true,...analyzed,cost_krw:analyzed.openai_called?null:0});
  }catch(error){
    console.error('[ai page analysis post]',error);
    const inputError=apiSafety.inputErrorResponse(error);
    if(inputError)return inputError;
    return apiSafety.json({ok:false,error:error.message||'페이지 자동분석을 만들지 못했습니다.',code:error.code||'AI_PAGE_ANALYSIS_FAILED'},{status:Number(error.status)||500});
  }
}
