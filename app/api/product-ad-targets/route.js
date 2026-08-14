import authModule from '../../../lib/dashboard-auth.js';
import apiSafety from '../../../lib/api/safety.js';
import supabaseModule from '../../../lib/cafe24/supabase.js';
import targetModule from '../../../lib/marketing/product-ad-targets.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const body = await apiSafety.readJson(request);
    const masterProductId = String(body.master_product_id || '').trim();
    const margin = Number(body.target_profit_margin_rate);
    if (!/^[0-9a-f-]{36}$/i.test(masterProductId)) return apiSafety.json({ ok:false, error:'기준상품을 다시 선택해주세요.' }, { status:400 });
    if (!Number.isFinite(margin) || margin < 0 || margin >= 100) return apiSafety.json({ ok:false, error:'목표 이익률은 0% 이상 100% 미만으로 입력해주세요.' }, { status:400 });
    const db = supabaseModule.getSupabase();
    const { data:product, error:productError } = await db.from('master_products').select('id').eq('id',masterProductId).maybeSingle();
    if (productError) throw productError;
    if (!product) return apiSafety.json({ ok:false, error:'기준상품을 찾을 수 없습니다.' }, { status:404 });
    const payload = {
      master_product_id:masterProductId,
      target_profit_margin_rate:Math.round(margin * 100) / 100,
      notes:String(body.notes || '').trim().slice(0,500) || null,
      formula_version:targetModule.FORMULA_VERSION
    };
    const { data, error } = await db.from('product_ad_targets').upsert(payload,{ onConflict:'master_product_id' }).select().single();
    if (error) throw error;
    return apiSafety.json({ ok:true, target:data });
  } catch (error) {
    return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:error.message || '상품별 광고 목표 저장 실패' }, { status:500 });
  }
}
