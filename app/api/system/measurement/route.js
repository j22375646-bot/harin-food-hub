import auth from '../../../../lib/dashboard-auth.js';
import safety from '../../../../lib/api/safety.js';
import supabase from '../../../../lib/cafe24/supabase.js';
import store from '../../../../lib/measurement/store.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

async function owner(request) {
  const session=await auth.validateSession(auth.cookieValue(request)).catch(()=>null);
  if(!session)return {response:safety.unauthorized()};
  if(session.role!=='OWNER')return {response:safety.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403})};
  return {session};
}
function failure(error) {
  return safety.inputErrorResponse(error)||safety.json({ok:false,error:'측정 설정을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',code:'MEASUREMENT_UNAVAILABLE'},{status:500});
}
export async function GET(request) {
  const access=await owner(request);if(access.response)return access.response;
  try{
    const params=new URL(request.url).searchParams;
    if([...params.keys()].some(key=>!['after','includeArchived'].includes(key))||params.getAll('after').length>1||params.getAll('includeArchived').length>1||params.has('includeArchived')&&!['true','false'].includes(params.get('includeArchived')))throw new safety.ApiInputError('조회 조건이 올바르지 않습니다.');
    const db=supabase.getSupabase();
    const page=await store.listLinks({db,after:params.get('after'),includeArchived:params.get('includeArchived')==='true'});
    const products=await store.loadProducts({db});
    return safety.json({ok:true,rule:store.UTM_RULE,...page,readiness:store.readiness(),products});
  }catch(error){return failure(error);}
}
export async function POST(request) {
  const access=await owner(request);if(access.response)return access.response;
  try{
    const origin=request.nextUrl?.origin||new URL(request.url).origin;
    if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')throw new safety.ApiInputError('동일 출처 요청만 허용됩니다.',403,'INVALID_ORIGIN');
    const body=await safety.readJson(request,{maxBytes:16*1024});
    if(body.action==='PREVIEW')return safety.json({ok:true,preview:store.previewLink(body.input)});
    if(body.action==='SAVE_LINK'){
      // Validate before acquiring storage; never trust submitted URL/hash/creator.
      store.previewLink(body.input);
      return safety.json({ok:true,...await store.saveLink({db:supabase.getSupabase(),input:body.input,createdBy:access.session.userId})});
    }
    if(body.action==='ARCHIVE_LINK'||body.action==='RESTORE_LINK'){
      if(typeof body.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id))throw new safety.ApiInputError('유효한 링크 ID가 필요합니다.',400,'INVALID_ID');
      return safety.json({ok:true,...await store.setArchived({db:supabase.getSupabase(),id:body.id,createdBy:access.session.userId,archived:body.action==='ARCHIVE_LINK'})});
    }
    throw new safety.ApiInputError('지원하지 않는 작업입니다.',400,'INVALID_ACTION');
  }catch(error){return failure(error);}
}
