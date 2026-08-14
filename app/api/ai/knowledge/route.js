import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import openaiClient from '../../../../lib/ai/openai-client.js';
import knowledgeCenter from '../../../../lib/ai/knowledge-center.js';
import analysisContracts from '../../../../lib/ai/analysis-contracts.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT_FIELDS='id,title,category,version_label,status,scope_pages,source_type,source_label,source_status,source_file_name,source_mime_type,source_size_bytes,source_sha256,source_uploaded_at,notes,privacy_status,vector_status,approved_by,approved_at,created_at,updated_at';

function owner(request) {
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  return session&&authModule.roleAtLeast(session,'OWNER')?session:null;
}
function fail(error) {
  const input=apiSafety.inputErrorResponse(error);
  if(input)return input;
  const message=String(error?.message||'AI 기준자료 처리 실패');
  const missing=/ai_knowledge_documents|relation .* does not exist/i.test(message);
  return apiSafety.json({ok:false,error:missing?'기준자료 저장소를 준비하고 있습니다. 잠시 후 다시 시도해주세요.':message,code:missing?'KNOWLEDGE_STORAGE_NOT_READY':'KNOWLEDGE_REQUEST_FAILED'},{status:missing?503:400});
}

export async function GET(request) {
  if(!owner(request))return apiSafety.unauthorized();
  try {
    const found=await supabaseModule.getSupabase().from('ai_knowledge_documents')
      .select(SELECT_FIELDS)
      .order('updated_at',{ascending:false}).limit(200);
    if(found.error)throw found.error;
    const config=openaiClient.configuration();
    return apiSafety.json({
      ok:true, items:found.data||[], summary:knowledgeCenter.summarize(found.data,config),
      categories:knowledgeCenter.CATEGORIES, page_labels:knowledgeCenter.PAGE_LABELS,
      recommended:knowledgeCenter.RECOMMENDED_DOCUMENTS,
      analysis_contracts:analysisContracts.listContracts(),
      guard:{ execution_enabled:config.execution_enabled, file_search_configured:config.file_search_configured, source_uploads_enabled:true, openai_uploads_enabled:false, reason:'원본은 비공개로 보관할 수 있지만, 크레딧 충전 전에는 OpenAI 업로드와 분석 호출을 실행하지 않습니다.' }
    });
  } catch(error){console.error('[ai knowledge GET]',error);return fail(error);}
}

export async function POST(request) {
  const session=owner(request);
  if(!session)return apiSafety.unauthorized();
  try {
    const body=await apiSafety.readJson(request,{maxBytes:24*1024});
    const payload=knowledgeCenter.validateCreate(body);
    payload.created_by=authModule.actor(session);
    const saved=await supabaseModule.getSupabase().from('ai_knowledge_documents').insert(payload)
      .select(SELECT_FIELDS).single();
    if(saved.error)throw saved.error;
    return apiSafety.json({ok:true,item:saved.data},{status:201});
  } catch(error){console.error('[ai knowledge POST]',error);return fail(error);}
}

export async function PATCH(request) {
  const session=owner(request);
  if(!session)return apiSafety.unauthorized();
  try {
    const body=await apiSafety.readJson(request,{maxBytes:16*1024});
    const id=String(body.id||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(id))return apiSafety.json({ok:false,error:'자료 식별자를 확인해주세요.'},{status:400});
    const db=supabaseModule.getSupabase();
    const found=await db.from('ai_knowledge_documents').select('id,status,privacy_status,vector_status,source_status').eq('id',id).maybeSingle();
    if(found.error)throw found.error;
    if(!found.data)return apiSafety.json({ok:false,error:'기준자료를 찾을 수 없습니다.'},{status:404});
    const patch=knowledgeCenter.validateUpdate(body,found.data);
    if(patch.approved_by==='owner')patch.approved_by=authModule.actor(session);
    const saved=await db.from('ai_knowledge_documents').update(patch).eq('id',id)
      .select(SELECT_FIELDS).single();
    if(saved.error)throw saved.error;
    return apiSafety.json({ok:true,item:saved.data});
  } catch(error){console.error('[ai knowledge PATCH]',error);return fail(error);}
}
