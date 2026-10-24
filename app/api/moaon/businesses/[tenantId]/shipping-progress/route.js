import progressRuntime from '../../../../../../lib/tenancy/workspace-shipping-progress-runtime.js';
import database from '../../../../../../lib/cafe24/supabase.js';
export const runtime='nodejs';
const composition=progressRuntime.createWorkspaceShippingProgressRuntime({getDb:()=>database.getSupabase()});
export async function GET(request){return composition.handle(request);}
