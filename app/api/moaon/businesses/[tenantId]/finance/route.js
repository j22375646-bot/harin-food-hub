import workspace from '../../../../../../lib/tenancy/workspace-finance-runtime.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import mainLoaderModule from '../../../../../../lib/dashboard/phase28-main-loader.js';
import mainAdapter from '../../../../../../lib/ui/phase28-adapters/main.js';
import summaryModule from '../../../../../../lib/tenancy/workspace-finance-summary.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const composition=workspace.createWorkspaceFinanceRuntime({
  readFinance:async()=>{
    const data=await mainLoaderModule.loadPhase28MainDashboard({db:supabaseModule.getSupabase()});
    return summaryModule.buildWorkspaceFinanceSummary(data,mainAdapter.buildPhase28MainModel(data));
  }
});
export async function GET(request){return composition.handle(request);}
