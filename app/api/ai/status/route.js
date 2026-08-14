import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import openaiClient from '../../../../lib/ai/openai-client.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  const cfg = openaiClient.configuration();
  let latest=null, storageReady=true;
  try {
    const found=await supabaseModule.getSupabase().from('ai_analysis_results')
      .select('id,analysis_type,status,model,created_at').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(found.error)throw found.error;
    latest=found.data;
  } catch(error) {
    storageReady=false;
    console.error('[ai status] result storage unavailable',error);
  }
  return apiSafety.json({
    ok:true,
    configured:cfg.configured,
    model:cfg.model,
    structured_outputs:cfg.structured_outputs,
    pii_guard:cfg.pii_guard,
    file_search_configured:cfg.file_search_configured,
    write_actions_enabled:false,
    storage_ready:storageReady,
    latest
  });
}
