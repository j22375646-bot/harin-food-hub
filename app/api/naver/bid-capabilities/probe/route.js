import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import capabilityProbe from '../../../../../lib/naver/bid-capability-probe.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const headers={'Cache-Control':'no-store'};

function cookieValue(request){
  return request.headers.get('cookie')?.split(';').map(value=>value.trim())
    .find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

function authorized(request){return authModule.verifySession(cookieValue(request));}

function failure(error){
  return Response.json({ok:false,code:error.code||'NAVER_BID_CAPABILITY_PROBE_FAILED',error:'네이버 자동입찰 지원 범위를 확인하지 못했습니다.'},{status:error.status||502,headers});
}

export async function GET(request){
  if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers});
  try{
    const result=await capabilityProbe.latestStoredProbe({db:supabaseModule.getSupabase()});
    return Response.json({ok:true,result},{headers});
  }catch(error){return failure(error);}
}

export async function POST(request){
  if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401,headers});
  try{
    const result=await capabilityProbe.probeBidCapabilities({db:supabaseModule.getSupabase()});
    return Response.json({ok:true,result},{headers});
  }catch(error){return failure(error);}
}
