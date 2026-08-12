import authModule from '../../../lib/dashboard-auth.js';
import pacingService from '../../../lib/analytics/pacing-service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const result = await pacingService.saveTarget(await request.json());
    return Response.json({ ok:true, ...result });
  } catch (error) {
    return Response.json({ ok:false, error:error.message || '목표·예산 저장 실패' }, { status:400 });
  }
}
