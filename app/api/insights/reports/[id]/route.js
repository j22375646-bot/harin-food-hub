import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import apiSafety from '../../../../../lib/api/safety.js';
import insightsAdapter from '../../../../../lib/ui/phase28-adapters/insights.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request,{params}){
  const session=await authModule.validateSession(authModule.cookieValue(request)).catch(()=>null);
  if(!session)return apiSafety.unauthorized();
  const {id:rawId}=await params;
  const id=String(rawId||'').trim();
  if(!/^[A-Za-z0-9-]{1,100}$/.test(id))return apiSafety.json({ok:false,error:'저장 인사이트 식별자를 확인해주세요.'},{status:400});
  try{
    const result=await supabaseModule.getSupabase().from('reports')
      .select('id,platform,report_type,period_start,period_end,title,status,summary_json,created_at')
      .eq('id',id).in('report_type',['WEEKLY','ADHOC','MONTHLY','PRODUCT_ANALYSIS']).maybeSingle();
    if(result.error)throw result.error;
    if(!result.data)return apiSafety.json({ok:false,error:'저장 인사이트를 찾지 못했습니다.'},{status:404});
    const detail=insightsAdapter.normalizeInsightReportDetail(result.data);
    if(!['ALL','NAVER','COUPANG','CAFE24'].includes(detail.platform))return apiSafety.json({ok:false,error:'지원하는 채널 진단만 열 수 있습니다.'},{status:404});
    return apiSafety.json({ok:true,detail});
  }catch(error){
    console.error('[insights report detail]',error);
    return apiSafety.json({ok:false,error:'저장 인사이트 상세를 불러오지 못했습니다.'},{status:500});
  }
}
