import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import projectsModule from '../../../../../lib/market-intelligence/projects.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await projectsModule.loadProject({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){
    if(error instanceof projectsModule.MarketProjectError)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return apiSafety.json({ok:false,error:error.message||'프로젝트를 불러오지 못했습니다.'},{status:500});
  }
}
