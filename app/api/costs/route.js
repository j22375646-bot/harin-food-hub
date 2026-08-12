import authModule from '../../../lib/dashboard-auth.js';
import supabaseModule from '../../../lib/cafe24/supabase.js';
import costCalibrationModule from '../../../lib/analytics/cost-calibration.js';
import apiSafety from '../../../lib/api/safety.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) { return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('='); }
const amount = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const rate = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100 ? Number(value) / 100 : null;

export async function PUT(request) {
  if (!authModule.verifySession(cookieValue(request))) return apiSafety.unauthorized();
  try {
    const body = await apiSafety.readJson(request), db = supabaseModule.getSupabase();
    if (body.type === 'PRODUCT') {
      const unitCost = amount(body.unit_cost), packagingCost = amount(body.packaging_cost), otherUnitCost = amount(body.other_unit_cost);
      if (!body.master_product_id || [unitCost, packagingCost, otherUnitCost].includes(null)) return Response.json({ ok:false, error:'원가 입력값을 확인해주세요.' }, { status:400 });
      const result = await db.from('product_costs').upsert({ master_product_id:body.master_product_id, unit_cost:unitCost, packaging_cost:packagingCost, other_unit_cost:otherUnitCost, notes:String(body.notes || '').slice(0,500) }, { onConflict:'master_product_id' }).select().single();
      if (result.error) throw result.error;
      return Response.json({ ok:true, cost:result.data });
    }
    if (body.type === 'CHANNEL') {
      const commissionRate = rate(body.commission_rate), paymentFeeRate = rate(body.payment_fee_rate), shippingCost = amount(body.default_shipping_cost);
      if (!['NAVER','CAFE24','COUPANG'].includes(body.platform) || [commissionRate, paymentFeeRate, shippingCost].includes(null)) return Response.json({ ok:false, error:'수수료·배송비 입력값을 확인해주세요.' }, { status:400 });
      const result = await db.from('channel_cost_settings').upsert({ platform:body.platform, commission_rate:commissionRate, payment_fee_rate:paymentFeeRate, default_shipping_cost:shippingCost, notes:String(body.notes || '').slice(0,500) }, { onConflict:'platform' }).select().single();
      if (result.error) throw result.error;
      return Response.json({ ok:true, setting:result.data });
    }
    if (body.type === 'SHIPPING_RULE') {
      const returnShippingCost = amount(body.return_shipping_cost), returnRate = rate(body.return_rate), remoteAreaSurcharge = amount(body.remote_area_surcharge), remoteAreaRate = rate(body.remote_area_rate);
      if (!['NAVER','CAFE24','COUPANG'].includes(body.platform) || [returnShippingCost, returnRate, remoteAreaSurcharge, remoteAreaRate].includes(null)) return Response.json({ ok:false, error:'반품·도서산간 규칙 입력값을 확인해주세요.' }, { status:400 });
      const result = await db.from('channel_shipping_rules').upsert({
        platform:body.platform,
        return_shipping_cost:returnShippingCost,
        return_rate:returnRate,
        remote_area_surcharge:remoteAreaSurcharge,
        remote_area_rate:remoteAreaRate,
        notes:String(body.notes || '').slice(0,500)
      }, { onConflict:'platform' }).select().single();
      if (result.error) throw result.error;
      return Response.json({ ok:true, rule:result.data });
    }
    if (body.type === 'COUPANG_CALIBRATION_APPLY') {
      const result = await costCalibrationModule.applyCoupangCostCalibration({ db });
      return Response.json({ ok:true, ...result });
    }
    return Response.json({ ok:false, error:'지원하지 않는 비용 설정입니다.' }, { status:400 });
  } catch (error) { return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:error.message || '비용 저장 실패' }, { status:500 }); }
}
