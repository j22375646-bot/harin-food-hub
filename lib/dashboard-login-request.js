'use strict';

function normalizedOrigin(value) {
  if (!value || value === 'null') return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function trustedRequestOrigins(request) {
  const origins = new Set();
  const requestOrigin = normalizedOrigin(request?.url);
  if (requestOrigin) origins.add(requestOrigin);

  const forwardedHost = request?.headers?.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request?.headers?.get('x-forwarded-proto')?.split(',')[0]?.trim()
    || (requestOrigin ? new URL(requestOrigin).protocol.replace(':', '') : 'https');
  if (forwardedHost && (forwardedProto === 'https' || forwardedProto === 'http')) {
    const forwardedOrigin = normalizedOrigin(`${forwardedProto}://${forwardedHost}`);
    if (forwardedOrigin) origins.add(forwardedOrigin);
  }
  return origins;
}

function isTrustedLoginRequest(request) {
  const origins = trustedRequestOrigins(request);
  const declaredOrigin = request?.headers?.get('origin');
  const fetchSite = request?.headers?.get('sec-fetch-site')?.toLowerCase();

  if (declaredOrigin && declaredOrigin !== 'null') {
    const origin = normalizedOrigin(declaredOrigin);
    return Boolean(origin && origins.has(origin));
  }

  if (fetchSite === 'cross-site') return false;
  if (fetchSite === 'same-origin') return true;

  const refererOrigin = normalizedOrigin(request?.headers?.get('referer'));
  return Boolean(refererOrigin && origins.has(refererOrigin));
}

module.exports = {
  isTrustedLoginRequest,
  trustedRequestOrigins
};

