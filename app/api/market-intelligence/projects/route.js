import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import projectsModule from '../../../../lib/market-intelligence/projects.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{return apiSafety.json({ok:true,...await projectsModule.loadProjectHome({db:supabaseModule.getSupabase()})});}
  catch(error){return apiSafety.json({ok:false,error:error.message||'프로젝트 목록을 불러오지 못했습니다.'},{status:500});}
}

export async function POST(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request,{maxBytes:32*1024});
    const saved=await projectsModule.createOrOpenProject({db:supabaseModule.getSupabase(),masterProductId:body.master_product_id,name:body.project_name,actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,...saved},{status:saved.created?201:200});
  }catch(error){
    if(error instanceof projectsModule.MarketProjectError)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'프로젝트를 열지 못했습니다.'},{status:500});
  }
}
