import authModule from '../../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../../lib/api/safety.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import cafe24Config from '../../../../../lib/cafe24/config.js';
import cafe24Sync from '../../../../../lib/cafe24/sync.js';
import policy from '../../../../../lib/cafe24/order-refresh-policy.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

export async function POST(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const db=supabaseModule.getSupabase();
    const latest=await db.from('sync_logs')
      .select('status,started_at,finished_at')
      .eq('platform','CAFE24')
      .in('job_type',['ORDERS_FAST','ORDERS_REALTIME'])
      .order('started_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if(latest.error)throw latest.error;
    const decision=policy.refreshDecision({latest:latest.data,now:Date.now()});
    if(!decision.refresh){
      return apiSafety.json({ok:true,refreshed:false,reason:decision.reason,lastCheckedAt:decision.lastCheckedAt});
    }
    const result=await cafe24Sync.syncOrdersRealtime(cafe24Config.getConfig(),policy.FAST_SYNC_OPTIONS);
    return apiSafety.json({
      ok:true,
      refreshed:true,
      status:result.status,
      refreshedAt:result.finishedAt,
      counts:{orders:result.counts.orders,orderItems:result.counts.orderItems}
    });
  }catch(error){
    console.error('[Cafe24 fast order refresh]',{message:error.message});
    return apiSafety.json({ok:false,error:'Cafe24 최신 주문을 확인하지 못했습니다.'},{status:502});
  }
}
