'use strict';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function getConfig() {
  const requiredScopes = [
    'mall.read_product', 'mall.write_product',
    'mall.read_order', 'mall.write_order',
    'mall.read_community', 'mall.write_community',
    'mall.read_analytics'
  ];
  const scopes = new Set(
    (process.env.CAFE24_SCOPES || requiredScopes.join(','))
      .split(/[\s,]+/).filter(Boolean)
  );
  requiredScopes.forEach(scope => scopes.add(scope));
  const configuredReferrerPath = process.env.CAFE24_ANALYTICS_REFERRERS_PATH;
  const referrerPath = !configuredReferrerPath || configuredReferrerPath === '/visitors/referrer'
    ? '/visitpaths/domains'
    : configuredReferrerPath;

  return {
    mallId: required('CAFE24_MALL_ID'),
    clientId: required('CAFE24_CLIENT_ID'),
    clientSecret: required('CAFE24_CLIENT_SECRET'),
    redirectUri: required('CAFE24_REDIRECT_URI'),
    scopes: [...scopes],
    requiredScopes,
    shopNo: Number(process.env.CAFE24_SHOP_NO || 1),
    syncDays: Math.max(1, Math.min(Number(process.env.CAFE24_SYNC_DAYS || 7), 31)),
    orderHistoryDays: Math.max(90, Math.min(Number(process.env.CAFE24_ORDER_HISTORY_DAYS || 90), 365)),
    analyticsPaths: {
      visitors: process.env.CAFE24_ANALYTICS_VISITORS_PATH || '/visitors/view',
      pageviews: process.env.CAFE24_ANALYTICS_PAGEVIEWS_PATH || '/visitors/pageview',
      referrers: referrerPath
    }
  };
}

module.exports = { getConfig };
