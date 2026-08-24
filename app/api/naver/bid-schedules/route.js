import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import bidSchedules from '../../../../lib/naver/bid-schedules.js';
import bidScheduleStore from '../../../../lib/naver/bid-schedule-store.js';
import bidRuleStore from '../../../../lib/naver/bid-rule-store.js';
import bidOperationsOverview from '../../../../lib/naver/bid-operations-overview.js';
import bidKeywordHistory from '../../../../lib/naver/bid-keyword-history.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function ownerSession(request){
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return {error:apiSafety.unauthorized()};
  if(!authModule.roleAtLeast(session,'OWNER'))return {error:apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403})};
  return {session};
}

function errorResponse(error,fallback){
  if(error instanceof bidSchedules.NaverBidScheduleError||error instanceof bidScheduleStore.NaverBidScheduleStoreError||error instanceof bidRuleStore.NaverBidRuleStoreError){
    return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
  }
  return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:fallback},{status:500});
}

export async function GET(request){
  const access=ownerSession(request);if(access.error)return access.error;
  try{
    const searchParams=new URL(request.url).searchParams;
    const adgroupId=searchParams.get('ncc_adgroup_id')||'';
    const keywordId=searchParams.get('ncc_keyword_id')||'';
    const historyRequested=searchParams.get('history')==='1';
    const overviewRequested=searchParams.get('overview')==='1';
    if(historyRequested){
      if(!adgroupId||!keywordId)return apiSafety.json({ok:false,error:'네이버 광고그룹과 키워드를 다시 선택해주세요.',code:'KEYWORD_SCOPE_REQUIRED'},{status:400});
      const runs=await bidScheduleStore.listNaverBidRuns({adgroupId,limit:100});
      const history=bidKeywordHistory.buildNaverBidKeywordHistory({runs,adgroupId,keywordId});
      return apiSafety.json({ok:true,platform:'NAVER',history});
    }
    const [schedules,control,rules]=await Promise.all([
      bidScheduleStore.listNaverBidSchedules({adgroupId}),
      bidScheduleStore.getNaverBidAutomationControl(),
      overviewRequested?bidRuleStore.listNaverBidRules():Promise.resolve([])
    ]);
    const automationEnabled=String(process.env.NAVER_BID_AUTOMATION_ENABLED||'').toLowerCase()==='true';
    const overview=overviewRequested?bidOperationsOverview.buildNaverBidOperationsOverview({schedules,rules,control,automationEnabled}):undefined;
    return apiSafety.json({ok:true,platform:'NAVER',automation_enabled:automationEnabled,control,schedules,...(overviewRequested?{overview}:{})});
  }catch(error){return errorResponse(error,'네이버 자동입찰 스케줄을 불러오지 못했습니다.');}
}

export async function PATCH(request){
  const access=ownerSession(request);if(access.error)return access.error;
  try{
    const body=await apiSafety.readJson(request,{maxBytes:8*1024});
    const action=String(body?.action||'').toUpperCase();
    if(!['EMERGENCY_PAUSE','EMERGENCY_RESUME'].includes(action)){
      return apiSafety.json({ok:false,error:'긴급정지 작업을 다시 선택해주세요.',code:'CONTROL_ACTION_INVALID'},{status:400});
    }
    const control=await bidScheduleStore.setNaverBidAutomationPaused({
      paused:action==='EMERGENCY_PAUSE',reason:body?.reason||'',actor:authModule.actor(access.session)
    });
    return apiSafety.json({ok:true,platform:'NAVER',control});
  }catch(error){return errorResponse(error,'네이버 자동입찰 긴급정지 상태를 저장하지 못했습니다.');}
}

export async function POST(request){
  const access=ownerSession(request);if(access.error)return access.error;
  try{
    const body=await apiSafety.readJson(request,{maxBytes:32*1024});
    const schedule=bidSchedules.validateNaverBidSchedule(body);
    const saved=await bidScheduleStore.saveNaverBidSchedule({schedule,actor:authModule.actor(access.session)});
    return apiSafety.json({ok:true,platform:'NAVER',schedule:saved,automation_enabled:String(process.env.NAVER_BID_AUTOMATION_ENABLED||'').toLowerCase()==='true'});
  }catch(error){return errorResponse(error,'네이버 자동입찰 스케줄을 저장하지 못했습니다.');}
}
