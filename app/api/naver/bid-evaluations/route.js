import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import bidPerformance from '../../../../lib/naver/bid-performance.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function ownerSession(request) {
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return {error:apiSafety.unauthorized()};
  if(!authModule.roleAtLeast(session,'OWNER'))return {error:apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403})};
  return {session};
}

export async function GET(request) {
  const access=ownerSession(request);
  if(access.error)return access.error;
  try{return apiSafety.json({ok:true,...await bidPerformance.listEvaluations()});}
  catch(error){return apiSafety.json({ok:false,error:error.message||'입찰 성과검증 기록 조회 실패'},{status:500});}
}

export async function POST(request) {
  const access=ownerSession(request);
  if(access.error)return access.error;
  try{
    const body=await apiSafety.readJson(request,{maxBytes:8*1024});
    if(body.confirm!==true)return apiSafety.json({ok:false,error:'명시적 확인이 필요합니다.',code:'CONFIRMATION_REQUIRED'},{status:400});
    const result=await bidPerformance.evaluateDueChanges();
    return apiSafety.json({ok:result.status!=='PARTIAL',...result},{status:result.status==='PARTIAL'?207:200});
  }catch(error){return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'입찰 성과검증 실행 실패'},{status:500});}
}
