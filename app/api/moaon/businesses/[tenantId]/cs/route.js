import workspace from '../../../../../../lib/tenancy/workspace-cs-runtime.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import csLoader from '../../../../../../lib/dashboard/workspace-cs-loader.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=workspace.createWorkspaceCsRuntime({
 readCs:()=>csLoader.loadWorkspaceCs({db:supabaseModule.getSupabase()})
});
export async function GET(request){return composition.handle(request);}
