import authModule from '../../../lib/dashboard-auth.js';
import apiSafety from '../../../lib/api/safety.js';
import supabaseModule from '../../../lib/cafe24/supabase.js';
import ownerWorkspace from '../../../lib/owner-workspace.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{return apiSafety.json({ok:true,...await ownerWorkspace.queryWorkspace(supabaseModule.getSupabase())});}
  catch(error){console.error('[owner workspace read]',error);return apiSafety.json({ok:false,error:'저장된 업무를 불러오지 못했습니다.'},{status:500});}
}

export async function POST(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request,{maxBytes:16*1024});
    return apiSafety.json({ok:true,...await ownerWorkspace.mutateWorkspace(supabaseModule.getSupabase(),body)});
  }catch(error){
    const input=apiSafety.inputErrorResponse(error);if(input)return input;
    const status=error instanceof ownerWorkspace.OwnerWorkspaceInputError?error.status:500;
    if(status===500)console.error('[owner workspace write]',error);
    return apiSafety.json({ok:false,error:status===500?'업무를 저장하지 못했습니다.':error.message},{status});
  }
}
