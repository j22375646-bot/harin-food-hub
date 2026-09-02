'use strict';

const SALES_REPORT_SCOPE = 'mall.read_salesreport';
const DOCS_URL = 'https://developers.cafe24.com/docs/ko/api/admin/';
const APPROVAL_ACTION = 'Cafe24 개발자센터에서 매출통계 API 사용 승인을 받은 뒤 OAuth를 한 번 다시 연결하세요.';

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
    };
  }
  if (grantedScopes(token).includes(SALES_REPORT_SCOPE)) {
    return {
      status: 'READY',
      scope: SALES_REPORT_SCOPE,
      shouldCollect: true,
      action: null,
      docsUrl: DOCS_URL,
    };
  }
  return {
    status: 'APPROVAL_REQUIRED',
    scope: SALES_REPORT_SCOPE,
    shouldCollect: false,
    action: APPROVAL_ACTION,
    docsUrl: DOCS_URL,
  };
}

function callbackDestination(requestUrl, capability) {
  const destination = new URL('/settlement-costs', requestUrl);
  destination.searchParams.set(
    'cafe24',
    capability?.status === 'READY' ? 'finance-ready' : 'approval-required',
  );
  return destination;
}

module.exports = {
  SALES_REPORT_SCOPE,
  DOCS_URL,
  APPROVAL_ACTION,
  grantedScopes,
  assessFinanceCapability,
  callbackDestination,
};
