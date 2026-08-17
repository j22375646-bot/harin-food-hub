import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import apiHubProbe from '../../../../lib/naver-api-hub/probe.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const result = await apiHubProbe.probeReadAccess({ db:supabaseModule.getSupabase() });
    return Response.json({ ok:true, result }, { headers:{ 'Cache-Control':'no-store' } });
  } catch (error) {
    return Response.json({ ok:false, code:error.code || 'NAVER_API_HUB_PROBE_FAILED', error:error.message }, {
      status:error.status || 502, headers:{ 'Cache-Control':'no-store' }
    });
  }
}
