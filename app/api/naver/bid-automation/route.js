import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import financialChanges from '../../../../lib/changes/financial-change.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function ownerSession(request) {
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return {error:apiSafety.unauthorized()};
  if(!authModule.roleAtLeast(session,'OWNER'))return {error:apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403})};
  return {session};
}

export async function POST(request) {
  const access=ownerSession(request);
  if(access.error)return access.error;
  try{
    const body=await apiSafety.readJson(request,{maxBytes:48*1024});
    if(body.confirm!==true)return apiSafety.json({ok:false,error:'명시적 확인이 필요합니다.',code:'CONFIRMATION_REQUIRED'},{status:400});
    const items=Array.isArray(body.items)?body.items.slice(0,3):[];
    if(!items.length)return apiSafety.json({ok:false,error:'안전 자동운영 후보가 없습니다.',code:'NO_AUTOMATION_CANDIDATES'},{status:409});
    const results=[];
    for(const item of items){
      try{
        const snapshot=authModule.verifyBidProposalSnapshot(item.snapshot_token);
        if(!snapshot||snapshot.execution_phase!=='12-7'||snapshot.automation?.eligible!==true)throw new financialChanges.FinancialChangeError('자동운영 안전 초안이 만료됐습니다. 화면을 새로고침해주세요.',409,'INVALID_AUTOMATION_SNAPSHOT');
        const bid=Number(snapshot.automation.proposed_bid);
        const safeId=String(snapshot.ncc_keyword_id).replace(/[^A-Za-z0-9._:-]/g,'').slice(0,64);
        const period=String(snapshot.period_end||'no-period').replace(/[^0-9-]/g,'').slice(0,10);
        const result=await financialChanges.createNaverBidPreview(snapshot,bid,{
          idempotencyKey:`naver-auto-draft:${safeId}:${period}:${bid}`.slice(0,128),
          actor:authModule.actor(access.session)
        });
        results.push({ok:true,ncc_keyword_id:snapshot.ncc_keyword_id,bid,reused:result.reused,request_id:result.request.id});
      }catch(error){results.push({ok:false,error:error.message||'초안 생성 실패',code:error.code||'DRAFT_FAILED'});}
    }
    const failed=results.filter(item=>!item.ok);
    return apiSafety.json({ok:failed.length===0,created:results.length-failed.length,failed:failed.length,results},{status:failed.length?207:202});
  }catch(error){return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'안전 자동운영 초안 생성 실패'},{status:500});}
}
