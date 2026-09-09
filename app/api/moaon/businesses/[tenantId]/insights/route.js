import workspace from '../../../../../../lib/tenancy/workspace-insights-runtime.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import insightsLoader from '../../../../../../lib/dashboard/workspace-insights-loader.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=workspace.createWorkspaceInsightsRuntime({
 readInsights:()=>insightsLoader.loadWorkspaceInsights({db:supabaseModule.getSupabase()})
});
export async function GET(request){return composition.handle(request);}
