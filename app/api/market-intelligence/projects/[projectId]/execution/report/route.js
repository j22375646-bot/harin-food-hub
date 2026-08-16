import authModule from '../../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../../lib/cafe24/supabase.js';
import executionModule from '../../../../../../../lib/market-intelligence/execution-bridge.js';
import projectsModule from '../../../../../../../lib/market-intelligence/projects.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,id=projectsModule.requiredUuid(projectId),planId=projectsModule.requiredUuid(new URL(request.url).searchParams.get('planId'),'실행계획');
    const result=await supabaseModule.getSupabase().from('market_execution_plans').select('title,report_snapshot').eq('project_id',id).eq('id',planId).maybeSingle();
    if(result.error)throw result.error;if(!result.data)throw new executionModule.ExecutionBridgeError('실행계획을 찾을 수 없습니다.',404,'PLAN_NOT_FOUND');
    const html=executionModule.reportHtml(result.data.report_snapshot),download=new URL(request.url).searchParams.get('download')==='1';
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':`${download?'attachment':'inline'}; filename="harin-market-report.html"`,'X-Content-Type-Options':'nosniff'}});
  }catch(error){return error instanceof executionModule.ExecutionBridgeError?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status}):apiSafety.json({ok:false,error:error.message||'보고서를 열지 못했습니다.'},{status:500});}
}
