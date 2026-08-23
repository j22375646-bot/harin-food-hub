import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import bidRules from '../../../../lib/naver/bid-rules.js';
import bidRuleStore from '../../../../lib/naver/bid-rule-store.js';

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
  if(error instanceof bidRules.NaverBidRuleError||error instanceof bidRuleStore.NaverBidRuleStoreError){
    return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
  }
  return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:fallback},{status:500});
}

export async function GET(request){
  const access=ownerSession(request);
  if(access.error)return access.error;
  try{
    const rules=await bidRuleStore.listNaverBidRules();
    return apiSafety.json({ok:true,platform:'NAVER',rules});
  }catch(error){return errorResponse(error,'네이버 입찰 안전설정을 불러오지 못했습니다.');}
}

export async function POST(request){
  const access=ownerSession(request);
  if(access.error)return access.error;
  try{
    const body=await apiSafety.readJson(request,{maxBytes:128*1024});
    const rules=bidRules.validateNaverBidRuleBatch(body);
    const saved=await bidRuleStore.saveNaverBidRules({rules,actor:authModule.actor(access.session)});
    return apiSafety.json({ok:true,platform:'NAVER',saved_count:saved.length,rules:saved});
  }catch(error){return errorResponse(error,'네이버 입찰 안전설정을 저장하지 못했습니다.');}
}
