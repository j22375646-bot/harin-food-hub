import authModule from '../../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../../lib/cafe24/supabase.js';
import dataRoom from '../../../../../../../lib/market-intelligence/data-room.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const replyError=error=>error instanceof dataRoom.MarketDataRoomError
  ?apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status})
  :apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'자료 검수를 완료하지 못했습니다.'},{status:500});

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId,sourceId}=await params;
    if(new URL(request.url).searchParams.get('mode')==='detail')return apiSafety.json({ok:true,source:await dataRoom.loadSourceDetail({db:supabaseModule.getSupabase(),projectId,sourceId})});
    return apiSafety.json({ok:true,...await dataRoom.createDownloadUrl({db:supabaseModule.getSupabase(),projectId,sourceId})});
  }
  catch(error){return replyError(error);}
}

export async function PATCH(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId,sourceId}=await params,body=await apiSafety.readJson(request,{maxBytes:220*1024});
    const source=body.action==='OCR_REVIEW'
      ?await dataRoom.saveOcrReview({db:supabaseModule.getSupabase(),projectId,sourceId,input:body,actor:authModule.requestActor(request)})
      :body.action==='COMPLETE'
        ?await dataRoom.completeUpload({db:supabaseModule.getSupabase(),projectId,sourceId,input:body,actor:authModule.requestActor(request)})
        :null;
    if(!source)throw new dataRoom.MarketDataRoomError('지원하지 않는 자료 작업입니다.',400,'UNSUPPORTED_SOURCE_ACTION');
    return apiSafety.json({ok:true,source,message:source.ingest_status==='VERIFIED'?'자료 검수를 완료했습니다.':'자료를 저장했습니다. 사장님 확인이 더 필요합니다.'});
  }catch(error){return replyError(error);}
}
