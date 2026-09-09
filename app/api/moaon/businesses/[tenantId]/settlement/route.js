import workspace from '../../../../../../lib/tenancy/workspace-settlement-runtime.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import mainLoader from '../../../../../../lib/dashboard/phase28-main-loader.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=workspace.createWorkspaceSettlementRuntime({
 readSettlement:()=>mainLoader.loadPhase28MainDashboard({db:supabaseModule.getSupabase()})
});
export async function GET(request){return composition.handle(request);}
