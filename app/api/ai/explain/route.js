import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import aiFoundation from '../../../../lib/ai/foundation.js';
import privacy from '../../../../lib/ai/privacy.js';
import openaiClient from '../../../../lib/ai/openai-client.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return apiSafety.unauthorized();
  if(!authModule.roleAtLeast(session,'OWNER'))return apiSafety.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403});
  try {
    const body=await apiSafety.readJson(request,{maxBytes:48*1024});
    const snapshot=authModule.verifyAiSnapshot(body.snapshot_token);
    if(!snapshot)return apiSafety.json({ok:false,error:'AI 분석 자료가 만료되었거나 변경되었습니다. 화면을 새로고침해주세요.',code:'INVALID_AI_SNAPSHOT'},{status:409});
    privacy.assertNoPii(snapshot);
    const explained=await aiFoundation.explainSnapshot({
      snapshot,
      db:supabaseModule.getSupabase(),
      actor:authModule.actor(session),
      force:body.force===true
    });
    return apiSafety.json({ok:true,reused:explained.reused,result:explained.result,record:{id:explained.record?.id||null,status:explained.record?.status||snapshot.data_status,model:explained.record?.model||openaiClient.configuration().model,created_at:explained.record?.created_at||new Date().toISOString()}});
  } catch(error) {
    console.error('[ai explain]',error);
    const inputError=apiSafety.inputErrorResponse(error);
    if(inputError)return inputError;
    const status=Number(error.status||500);
    return apiSafety.json({ok:false,error:error.message||'AI 설명 생성 실패',code:error.code||'AI_EXPLANATION_FAILED'},{status:status>=400&&status<600?status:500});
  }
}
