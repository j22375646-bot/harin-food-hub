import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import financialChanges from '../../../../lib/changes/financial-change.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ownerSession(request) {
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return { error:apiSafety.unauthorized() };
  if(!authModule.roleAtLeast(session,'OWNER'))return { error:apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403}) };
  return { session };
}

export async function POST(request) {
  const access=ownerSession(request);
  if(access.error)return access.error;
  try {
    const body=await apiSafety.readJson(request,{maxBytes:20*1024});
    const snapshot=authModule.verifyBidProposalSnapshot(body.snapshot_token);
    if(!snapshot)return apiSafety.json({ok:false,error:'입찰 미리보기가 만료되었거나 변경되었습니다. 화면을 새로고침해주세요.',code:'INVALID_BID_SNAPSHOT'},{status:409});
    const result=await financialChanges.createNaverBidPreview(snapshot,body.owner_desired_bid,{
      idempotencyKey:request.headers.get('idempotency-key')||body.idempotency_key,
      actor:authModule.actor(access.session)
    });
    return apiSafety.json({ok:true,preview:true,external_execution_locked:true,...result},{status:result.reused?200:202});
  } catch(error) {
    if(error instanceof financialChanges.FinancialChangeError)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'네이버 입찰 승인 요청을 만들지 못했습니다.'},{status:500});
  }
}
