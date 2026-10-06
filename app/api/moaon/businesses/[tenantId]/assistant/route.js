import workspace from '../../../../../../lib/tenancy/workspace-assistant-runtime.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import assistantLoader from '../../../../../../lib/dashboard/workspace-assistant-loader.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=workspace.createWorkspaceAssistantRuntime({
 readAssistant:context=>assistantLoader.loadWorkspaceAssistant({db:supabaseModule.getSupabase(),context})
});
export async function GET(request){return composition.handle(request);}
