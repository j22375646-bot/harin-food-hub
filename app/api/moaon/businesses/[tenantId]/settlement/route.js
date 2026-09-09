import workspace from '../../../../../../lib/tenancy/workspace-settlement-runtime.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import settlementLoader from '../../../../../../lib/dashboard/workspace-settlement-loader.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=workspace.createWorkspaceSettlementRuntime({
 readSettlement:({days})=>settlementLoader.loadWorkspaceSettlement({db:supabaseModule.getSupabase(),days})
});
export async function GET(request){return composition.handle(request);}
