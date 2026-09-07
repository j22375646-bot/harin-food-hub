import auth from '../../../../../lib/dashboard-auth.js';
import safety from '../../../../../lib/api/safety.js';
import supabase from '../../../../../lib/cafe24/supabase.js';
import measurement from '../../../../../lib/measurement/ga4-service.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

async function owner(request){
  const session=await auth.validateSession(auth.cookieValue(request)).catch(()=>null);
  if(!session)return {response:safety.unauthorized()};
  if(session.role!=='OWNER')return {response:safety.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403})};
  return {session};
}

function failure(error){
  return safety.inputErrorResponse(error)||safety.json({
    ok:false,error:'GA4 측정 자료를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',code:'GA4_MEASUREMENT_UNAVAILABLE'
  },{status:500});
}

export async function GET(request){
  const access=await owner(request);if(access.response)return access.response;
  try{
    if([...new URL(request.url).searchParams.keys()].length)throw new safety.ApiInputError('조회 조건을 전송할 수 없습니다.',400,'INVALID_QUERY');
    const state=await measurement.getState({db:()=>supabase.getSupabase(),env:process.env,now:new Date()});
    return safety.json({ok:true,measurement:state});
  }catch(error){return failure(error);}
}

export async function POST(request){
  const access=await owner(request);if(access.response)return access.response;
  try{
    const origin=request.nextUrl?.origin||new URL(request.url).origin;
    if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site'){
      throw new safety.ApiInputError('동일 출처 요청만 허용됩니다.',403,'INVALID_ORIGIN');
    }
    const body=await safety.readJson(request,{maxBytes:1024});
    if(Object.keys(body).length!==1||body.action!=='REFRESH')throw new safety.ApiInputError('지원하지 않는 작업입니다.',400,'INVALID_ACTION');
    const state=await measurement.refresh({db:()=>supabase.getSupabase(),env:process.env,now:new Date()});
    return safety.json({ok:true,measurement:state});
  }catch(error){return failure(error);}
}
