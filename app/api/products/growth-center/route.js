import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import growthCenter from '../../../../lib/products/growth-center.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const result = await growthCenter.loadGrowthCenter({ db:supabaseModule.getSupabase() });
    return apiSafety.json({ ok:true, ...result });
  } catch (error) {
    return apiSafety.json({ ok:false, error:error.message || '상품 성장센터를 불러오지 못했습니다.' }, { status:500 });
  }
}

export async function PUT(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const body = await apiSafety.readJson(request, { maxBytes:128 * 1024 });
    const saved = await growthCenter.mutateGrowthCenter({ db:supabaseModule.getSupabase(), body });
    const result = await growthCenter.loadGrowthCenter({ db:supabaseModule.getSupabase() });
    return apiSafety.json({ ok:true, saved, ...result });
  } catch (error) {
    if (error instanceof growthCenter.GrowthCenterError) {
      return apiSafety.json({ ok:false, error:error.message, code:error.code }, { status:error.status });
    }
    return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:error.message || '상품 성장센터 저장에 실패했습니다.' }, { status:500 });
  }
}
