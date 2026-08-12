import authModule from '../../../lib/dashboard-auth.js';
import apiSafety from '../../../lib/api/safety.js';
import financialChanges from '../../../lib/changes/financial-change.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error) {
  if (error instanceof financialChanges.FinancialChangeError) return apiSafety.json({ ok:false, error:error.message, code:error.code }, { status:error.status });
  return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:error.message || '금액 변경 처리 실패' }, { status:500 });
}

export async function GET(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try { return apiSafety.json({ ok:true, ...(await financialChanges.listRequests()) }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const body = await apiSafety.readJson(request);
    const result = await financialChanges.createPreview(body, { idempotencyKey:request.headers.get('idempotency-key') || body.idempotency_key, actor:'dashboard-session' });
    return apiSafety.json({ ok:true, preview:true, ...result }, { status:result.reused ? 200 : 202 });
  } catch (error) { return errorResponse(error); }
}
