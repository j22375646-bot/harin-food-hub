import authModule from '../../../lib/dashboard-auth.js';
import pacingService from '../../../lib/analytics/pacing-service.js';
import apiSafety from '../../../lib/api/safety.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return apiSafety.unauthorized();
  try {
    const result = await pacingService.saveTarget(await apiSafety.readJson(request));
    return apiSafety.json({ ok:true, ...result });
  } catch (error) {
    return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:error.message || '목표·예산 저장 실패' }, { status:400 });
  }
}
