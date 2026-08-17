import authModule from '../../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../../lib/cafe24/supabase.js';
import commerceOrders from '../../../../../../lib/market-intelligence/naver-commerce-orders.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request,{params}){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const {projectId}=await params,days=commerceOrders.validPeriod(new URL(request.url).searchParams.get('days'));
    return apiSafety.json({ok:true,...await commerceOrders.loadWorkbench({db:supabaseModule.getSupabase(),projectId,periodDays:days})});
  }catch(error){
    if(error instanceof commerceOrders.MarketNaverCommerceOrderError)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'네이버 주문·정산 분석을 불러오지 못했습니다.'},{status:500});
  }
}
