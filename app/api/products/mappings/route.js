import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import mappingService from '../../../../lib/products/mapping-service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

function authorized(request) { return authModule.verifySession(cookieValue(request)); }

export async function GET(request) {
  if (!authorized(request)) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const dashboard = await mappingService.loadMappingDashboard({ db:supabaseModule.getSupabase() });
    return Response.json({ ok:true, ...dashboard });
  } catch (error) {
    return Response.json({ ok:false, error:error.message || '상품 매핑 조회 실패' }, { status:500 });
  }
}

export async function POST(request) {
  if (!authorized(request)) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const result = await mappingService.mutateMapping({ db:supabaseModule.getSupabase(), body:await request.json(), actor:authModule.requestActor(request) });
    return Response.json({ ok:true, result });
  } catch (error) {
    const validation = /확인|선택|찾지 못|지원하지/.test(error.message || '');
    return Response.json({ ok:false, error:error.message || '상품 매핑 변경 실패' }, { status:validation ? 400 : 500 });
  }
}
