import configModule from '../../../../lib/cafe24/config.js';
import clientModule from '../../../../lib/cafe24/client.js';
import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  if (process.env.NODE_ENV === 'production') return apiSafety.json({ok:false,error:'운영 환경에서는 Cafe24 연결 테스트 API를 사용하지 않습니다.'},{status:404});
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const result = await clientModule.adminGet(configModule.getConfig(), '/products', { limit: 1 });
    return apiSafety.json({ ok: true, httpStatus: result.status, productCount: result.payload?.products?.length || 0 });
  } catch (error) { return apiSafety.json({ ok: false, error: error.message }, { status: 502 }); }
}
