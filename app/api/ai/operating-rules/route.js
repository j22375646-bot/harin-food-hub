import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import operatingRules from '../../../../lib/ai/operating-rules.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function owner(request){
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token)||authModule.developmentOwnerSession();
  return session&&authModule.roleAtLeast(session,'OWNER')?session:null;
}

function failure(error){
  const input=apiSafety.inputErrorResponse(error);
  if(input)return input;
  const message=String(error?.message||'운영 규칙 저장 실패');
  const missing=/ai_operating_rule_versions|relation .* does not exist/i.test(message);
  return apiSafety.json({ok:false,error:missing?'운영 규칙 저장소를 준비하고 있습니다. 잠시 후 다시 시도해주세요.':'운영 규칙을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',code:missing?'OPERATING_RULE_STORAGE_NOT_READY':'OPERATING_RULE_REQUEST_FAILED'},{status:missing?503:500});
}

export async function GET(request){
  if(!owner(request))return apiSafety.unauthorized();
  try{
    const rules=await operatingRules.loadOperatingRuleSet(supabaseModule.getSupabase(),{historyLimit:40});
    return apiSafety.json({ok:true,rules,thresholds:operatingRules.effectiveReportThresholds(rules)});
  }catch(error){console.error('[ai operating rules GET]',error);return failure(error);}
}

export async function PATCH(request){
  const session=owner(request);
  if(!session)return apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request,{maxBytes:16*1024});
    const item=await operatingRules.saveRuleVersion({db:supabaseModule.getSupabase(),input:body,actor:authModule.actor(session),now:new Date()});
    return apiSafety.json({ok:true,item,applied_at:item.createdAt,automation:'연결된 다음 계산·진단부터 즉시 적용'});
  }catch(error){console.error('[ai operating rules PATCH]',error);return failure(error);}
}
