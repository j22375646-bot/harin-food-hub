import authModule from '../../../lib/dashboard-auth.js';
import supabaseModule from '../../../lib/cafe24/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sessionCookie(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(sessionCookie(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const platforms = new Set(['ALL', 'NAVER', 'CAFE24', 'COUPANG']);
    const types = new Set(['PLATFORM_CHANGE', 'CAMPAIGN_CHANGE', 'BID_CHANGE', 'LANDING_CHANGE', 'PROMOTION', 'DATA_ISSUE', 'OTHER']);
    if (!platforms.has(body.platform) || !types.has(body.event_type) || !/^20\d{2}-\d{2}-\d{2}$/.test(body.effective_date || '') || !String(body.title || '').trim()) return Response.json({ ok: false, error: '플랫폼·날짜·제목을 확인해주세요.' }, { status: 400 });
    const values = { platform: body.platform, event_type: body.event_type, effective_date: body.effective_date, title: String(body.title).trim().slice(0, 200), description: String(body.description || '').trim().slice(0, 1000) || null, analysis_impact: String(body.analysis_impact || '').trim().slice(0, 1000) || null, affects_comparison: body.affects_comparison !== false, created_by: 'MANUAL' };
    const { data, error } = await supabaseModule.getSupabase().from('platform_events').insert(values).select('id,title,effective_date').single();
    if (error) throw error;
    return Response.json({ ok: true, event: data });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '이벤트 저장 실패' }, { status: 500 });
  }
}
