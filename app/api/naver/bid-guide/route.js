import authModule from '../../../../lib/dashboard-auth.js';
import calculator from '../../../../lib/metrics/calculator.js';
import apiSafety from '../../../../lib/api/safety.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return apiSafety.unauthorized();
  try {
    const body = await apiSafety.readJson(request);
    const trust = authModule.verifyFinancialTrust(body.financialTrustToken);
    if (!trust?.allowed_cpc) {
      return Response.json({ ok:false, error:'원가 반영률 95%와 광고비 귀속을 완료한 뒤 다시 계산하세요.', code:'FINANCIAL_TRUST_BLOCKED' }, { status:409 });
    }
    const input = {
      averageOrderValue: positive(body.averageOrderValue),
      conversionRatePercent: positive(body.conversionRatePercent),
      targetRoasPercent: positive(body.targetRoasPercent),
      currentCpc: positive(body.currentCpc)
    };
    if (Object.values(input).some(value => value == null)) {
      return Response.json({ ok: false, error: '객단가, CVR, 목표 ROAS, 현재 CPC를 0보다 큰 숫자로 입력해주세요.' }, { status: 400 });
    }
    return apiSafety.json({ ok: true, guide: calculator.calculateBidGuide(input) });
  } catch (error) {
    return apiSafety.inputErrorResponse(error) || apiSafety.json({ ok: false, error: error.message || '입찰 가이드 계산 실패' }, { status: 500 });
  }
}
