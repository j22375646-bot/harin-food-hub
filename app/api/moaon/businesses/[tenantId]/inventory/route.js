import workspace from '../../../../../../lib/tenancy/workspace-inventory-runtime.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import inventoryLoader from '../../../../../../lib/dashboard/workspace-inventory-loader.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=workspace.createWorkspaceInventoryRuntime({
 readInventory:()=>inventoryLoader.loadWorkspaceInventory({db:supabaseModule.getSupabase()})
});
export async function GET(request){return composition.handle(request);}
