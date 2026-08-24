import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import bidListSignals from '../../../../lib/naver/bid-list-signals.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const headers={'Cache-Control':'no-store'};

function ownerSession(request){
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return {error:apiSafety.json({ok:false,error:'Unauthorized'},{status:401,headers})};
  if(!authModule.roleAtLeast(session,'OWNER'))return {error:apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403,headers})};
  return {session};
}

export async function GET(request){
  const access=ownerSession(request);
  if(access.error)return access.error;
  try{
    const keywordIds=new URL(request.url).searchParams.get('keywordIds');
    const result=await bidListSignals.loadBidListSignals({db:supabaseModule.getSupabase(),keywordIds});
    return apiSafety.json({ok:true,...result},{headers});
  }catch(error){
    const status=Number(error.status)||500;
    return apiSafety.json({
      ok:false,
      code:error.code||'NAVER_BID_LIST_SIGNALS_FAILED',
      error:status<500?error.message:'네이버 키워드 순위 신호를 불러오지 못했습니다.'
    },{status,headers});
  }
}
