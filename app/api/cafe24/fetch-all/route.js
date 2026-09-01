import syncModule from '../../../../lib/automation/sync-all.js';
import advertisingCenterModule from '../../../../lib/advertising/channel-center.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const result=await syncModule.syncCafe24('MANUAL');
    const db=supabaseModule.getSupabase();
    const [attribution,syncs]=await Promise.all([
      db.from('cafe24_ad_attribution').select('period_start,period_end,shop_no,dimension_type,ad,keyword,visit_count,order_count,revenue,join_count,purchase_rate,ad_spend,source_status,updated_at').order('period_end',{ascending:false}).limit(1000),
      db.from('sync_logs').select('platform,job_type,status,started_at,finished_at,metadata').eq('platform','CAFE24').eq('job_type','FETCH_ALL').order('started_at',{ascending:false}).limit(20)
    ]);
    if(attribution.error)throw attribution.error;
    if(syncs.error)throw syncs.error;
    const center=advertisingCenterModule.buildAdvertisingChannelCenter({
      cafe24:{attribution:attribution.data||[],syncs:syncs.data||[]},env:process.env,now:new Date()
    });
    const cafe24Channel=center.channels.find(item=>item.platform==='CAFE24')||null;
    return apiSafety.json({ok:true,...result,channel:cafe24Channel});
  }
  catch (error) { return apiSafety.json({ ok: false, error: error.message, ...(error.syncResult || {}) }, { status: 502 }); }
}
