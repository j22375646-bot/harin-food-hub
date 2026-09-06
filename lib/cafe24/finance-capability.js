'use strict';

const SALES_REPORT_SCOPE = 'mall.read_salesreport';
const DOCS_URL = 'https://developers.cafe24.com/docs/ko/api/admin/';
const RECONNECT_URL = '/oauth/cafe24/start';
const APPROVAL_ACTION = 'OAuth 권한 범위 연결은 완료됐지만 Cafe24 매출통계는 특정 클라이언트용 제한 API입니다. Cafe24 개발자센터에서 API 사용 승인을 받은 뒤 OAuth를 한 번 다시 연결하세요.';
const RECONNECT_ACTION = 'Cafe24 권한 설정 변경을 현재 토큰에 반영하려면 OAuth를 한 번 다시 연결하세요.';
const VERIFY_ACTION = 'Cafe24 매출통계 접근이 거부됐습니다. OAuth scope, 앱 설치 상태와 제한 API 승인을 함께 확인하세요.';

function payloadErrorFields(error={}) {
  const payload=error?.payload;
  if(!payload||typeof payload!=='object')return {code:null,message:null};
  const detail=payload.error&&typeof payload.error==='object'?payload.error:payload;
  return {
    code:detail.code||payload.code||null,
    message:detail.message||payload.message||(typeof payload.error==='string'?payload.error:null)
  };
}

function redactStructuredSecrets(value,seen=new WeakSet()) {
  if(!value||typeof value!=='object')return value;
  if(seen.has(value))return '[REDACTED_CIRCULAR]';
  seen.add(value);
  if(Array.isArray(value))return value.map(item=>redactStructuredSecrets(item,seen));
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[
    key,
    /^(?:access_token|refresh_token|client_secret|authorization)$/i.test(key)
      ? '[REDACTED]'
      : redactStructuredSecrets(item,seen)
  ]));
}

function sanitizedDiagnostic(value) {
  if(value==null)return '';
  let output;
  if(typeof value==='object')output=JSON.stringify(redactStructuredSecrets(value));
  else {
    output=String(value);
    try {
      const parsed=JSON.parse(output);
      if(parsed&&typeof parsed==='object')output=JSON.stringify(redactStructuredSecrets(parsed));
    } catch {}
  }
  return output
    .replace(/"(access_token|refresh_token|client_secret|authorization)"\s*:\s*"(?:\\.|[^"\\])*"/gi,'"$1":"[REDACTED]"')
    .replace(/authorization(\s*[:=]\s*)(?:Bearer\s+)?[^\s&,]+/gi,'authorization$1[REDACTED]')
    .replace(/(access_token|refresh_token|client_secret)(\s*[:=]\s*)[^\s&,]+/gi,'$1$2[REDACTED]')
    .replace(/Bearer\s+[^\s,]+/gi,'Bearer [REDACTED]')
    .slice(0,500);
}

function sanitizedErrorEvidence(error={}) {
  const payloadError=payloadErrorFields(error);
  const status=Number(error?.status);
  return {
    http_status:Number.isFinite(status)?status:null,
    error_code:sanitizedDiagnostic(payloadError.code||error?.code)||null,
    error_message:sanitizedDiagnostic(payloadError.message||error?.message)||null
  };
}

function classifyFinanceError(error={}) {
  const evidence=sanitizedErrorEvidence(error);
  const diagnostic=`${evidence.error_code||''} ${evidence.error_message||''}`;
  const payloadEvidence=payloadErrorFields(error);
  const payloadDiagnostic=`${payloadEvidence.code||''} ${payloadEvidence.message||''}`;
  const explicitApproval=evidence.http_status===403&&(
    /(?:API_?NOT_?APPROVED|APPROVAL_?REQUIRED|RESTRICTED_?CLIENT|CLIENT_?NOT_?AUTHORIZED)/i.test(payloadDiagnostic)
    ||(/특정\s*클라이언트/.test(payloadDiagnostic)&&/(?:개발자?센터|문의|승인)/.test(payloadDiagnostic))
    ||(/authorized clients?/i.test(payloadDiagnostic)&&/(?:developer center|contact|approval)/i.test(payloadDiagnostic))
  );
  if(explicitApproval)return {
    status:'APPROVAL_REQUIRED',
    shouldCollect:false,
    action:APPROVAL_ACTION,
    docsUrl:DOCS_URL,
    reconnectUrl:RECONNECT_URL,
    verified:false,
    evidence
  };
  const explicitScope=/(?:INSUFFICIENT_?SCOPE|MISSING_?SCOPE|SCOPE_?REQUIRED|does not include scope|scope authority|권한\s*범위|scope.*(?:missing|required|denied))/i.test(diagnostic);
  if(explicitScope)return {
    status:'RECONNECT_REQUIRED',
    shouldCollect:false,
    action:RECONNECT_ACTION,
    docsUrl:DOCS_URL,
    reconnectUrl:RECONNECT_URL,
    verified:false,
    evidence
  };
  return {
    status:'VERIFY_REQUIRED',
    shouldCollect:evidence.http_status===403?false:true,
    action:VERIFY_ACTION,
    docsUrl:DOCS_URL,
    reconnectUrl:null,
    verified:false,
    evidence
  };
}

function grantedScopes(token) {
  if (Array.isArray(token?.scopes)) return token.scopes.map(String).filter(Boolean);
  return String(token?.scope || '').split(/[\s,]+/).filter(Boolean);
}

function assessFinanceCapability(token) {
  if (!token?.access_token) {
    return {
      status: 'DISCONNECTED',
      scope: SALES_REPORT_SCOPE,
      shouldCollect: false,
      action: 'Cafe24 OAuth를 연결하세요.',
      docsUrl: null,
      reconnectUrl: RECONNECT_URL,
    };
  }
  if (grantedScopes(token).includes(SALES_REPORT_SCOPE)) {
    return {
      status: 'READY',
      scope: SALES_REPORT_SCOPE,
      shouldCollect: true,
      action: null,
      docsUrl: DOCS_URL,
      reconnectUrl: null,
    };
  }
  return {
    status: 'RECONNECT_REQUIRED',
    scope: SALES_REPORT_SCOPE,
    shouldCollect: false,
    action: RECONNECT_ACTION,
    docsUrl: DOCS_URL,
    reconnectUrl: RECONNECT_URL,
  };
}

async function verifyFinanceCapability(config, token, { adminGet, now = new Date() } = {}) {
  const capability = assessFinanceCapability(token);
  if (!capability.shouldCollect || typeof adminGet !== 'function') return capability;
  const date = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  try {
    await adminGet(config, '/financials/dailysales', { start_date:date, end_date:date, limit:1 });
    return { ...capability, verified:true, verifiedAt:new Date().toISOString() };
  } catch (error) {
    return {...capability,...classifyFinanceError(error),scope:SALES_REPORT_SCOPE};
  }
}

function callbackDestination(requestUrl, capability) {
  const destination = new URL('/settlement-costs', requestUrl);
  const result = capability?.status === 'READY'
    ? 'finance-ready'
    : capability?.status === 'RECONNECT_REQUIRED'
      ? 'reconnect-required'
      : capability?.status === 'APPROVAL_REQUIRED'
        ? 'approval-required'
        : 'verify-required';
  destination.searchParams.set('cafe24', result);
  return destination;
}

module.exports = {
  SALES_REPORT_SCOPE,
  DOCS_URL,
  RECONNECT_URL,
  APPROVAL_ACTION,
  RECONNECT_ACTION,
  VERIFY_ACTION,
  classifyFinanceError,
  grantedScopes,
  assessFinanceCapability,
  verifyFinanceCapability,
  callbackDestination,
};
