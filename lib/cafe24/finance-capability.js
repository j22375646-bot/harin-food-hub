'use strict';

const SALES_REPORT_SCOPE = 'mall.read_salesreport';
const DOCS_URL = 'https://developers.cafe24.com/docs/ko/api/admin/';
const RECONNECT_URL = '/oauth/cafe24/start';
const APPROVAL_ACTION = 'OAuth 권한 범위 연결은 완료됐지만 Cafe24 매출통계는 특정 클라이언트용 제한 API입니다. Cafe24 개발자센터에서 API 사용 승인을 받은 뒤 OAuth를 한 번 다시 연결하세요.';
const RECONNECT_ACTION = 'Cafe24 권한 설정 변경을 현재 토큰에 반영하려면 OAuth를 한 번 다시 연결하세요.';

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
    if (error?.status === 403) return {
      status:'APPROVAL_REQUIRED',
      scope:SALES_REPORT_SCOPE,
      shouldCollect:false,
      action:APPROVAL_ACTION,
      docsUrl:DOCS_URL,
      reconnectUrl:RECONNECT_URL,
      verified:false,
    };
    return {
      ...capability,
      status:'VERIFY_REQUIRED',
      shouldCollect:true,
      action:`Cafe24 매출통계 권한 확인 요청이 실패했습니다. 자동 수집에서 다시 확인합니다. (${error?.message || 'unknown error'})`,
      verified:false,
    };
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
  grantedScopes,
  assessFinanceCapability,
  verifyFinanceCapability,
  callbackDestination,
};
