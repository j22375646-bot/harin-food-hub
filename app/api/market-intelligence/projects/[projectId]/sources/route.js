import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import dataRoom from '../../../../../../lib/market-intelligence/data-room.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof dataRoom.MarketDataRoomError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'자료실 작업을 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{const {projectId}=await params;return apiSafety.json({ok:true,...await dataRoom.loadDataRoom({db:supabaseModule.getSupabase(),projectId})});}
  catch(error){return replyError(error);}
}

export async function POST(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,body=await apiSafety.readJson(request,{maxBytes:12*1024});
    const upload=await dataRoom.prepareUpload({db:supabaseModule.getSupabase(),projectId,input:body,actor:authModule.requestActor(request)});
    return apiSafety.json({ok:true,upload},{status:201});
  }catch(error){return replyError(error);}
}
