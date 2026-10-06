import runtime from '../../../../../../../lib/tenancy/workspace-ai-insights-runtime.js';
import supabase from '../../../../../../../lib/cafe24/supabase.js';
const composition=runtime.createWorkspaceAiInsightsRuntime({getDb:()=>supabase.getSupabase()});
export const dynamic='force-dynamic';
export async function GET(request){return composition.handle(request);}
export async function POST(request){return composition.handle(request);}
export async function DELETE(request){return composition.handle(request);}
