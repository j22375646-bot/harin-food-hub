import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import financialChanges from '../../../../lib/changes/financial-change.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set(['APPROVE', 'EXECUTE', 'VERIFY', 'ROLLBACK', 'REJECT']);

function errorResponse(error) {
  if (error instanceof financialChanges.FinancialChangeError) return apiSafety.json({ ok:false, error:error.message, code:error.code }, { status:error.status });
  return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok:false, error:error.message || '금액 변경 상태 처리 실패' }, { status:500 });
}

export async function POST(request, context) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return apiSafety.json({ ok:false, error:'변경 요청 ID가 올바르지 않습니다.' }, { status:400 });
    const body = await apiSafety.readJson(request, { maxBytes:16 * 1024 });
    const action = String(body.action || '').toUpperCase();
    if (!ACTIONS.has(action)) return apiSafety.json({ ok:false, error:'지원하지 않는 변경 작업입니다.' }, { status:400 });
    if (['APPROVE', 'EXECUTE', 'ROLLBACK', 'REJECT'].includes(action) && body.confirm !== true) return apiSafety.json({ ok:false, error:'명시적 확인이 필요합니다.', code:'CONFIRMATION_REQUIRED' }, { status:400 });
    const options = { actor:authModule.requestActor(request), note:body.note };
    const result = action === 'APPROVE' ? await financialChanges.approve(id, options)
      : action === 'EXECUTE' ? await financialChanges.execute(id, options)
      : action === 'VERIFY' ? await financialChanges.verify(id, options)
      : action === 'ROLLBACK' ? await financialChanges.rollback(id, options)
      : await financialChanges.reject(id, options);
    return apiSafety.json({ ok:true, action, ...result });
  } catch (error) { return errorResponse(error); }
}
