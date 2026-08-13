import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import operationQueue from '../../../../../lib/coupang/operation-queue.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const body = await request.json();
    const sellerProductId = String(body.sellerProductId || '').trim();
    if (!/^\d+$/.test(sellerProductId)) return Response.json({ ok:false, error:'쿠팡 등록상품 ID를 확인해주세요.' }, { status:400 });
    const queued = await operationQueue.queueOperation(supabaseModule.getSupabase(), {
      operationType:'PRODUCT_DETAIL', targetType:'PRODUCT', targetId:sellerProductId, payload:{}
    });
    return Response.json({ ok:true, ...queued }, { status:202, headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ ok:false, error:error.message }, { status:error.status || 502, headers:{ 'Cache-Control':'no-store' } });
  }
}
