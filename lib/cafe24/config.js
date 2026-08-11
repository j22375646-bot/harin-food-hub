'use strict';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function getConfig() {
  const scopes = new Set(
    (process.env.CAFE24_SCOPES || 'mall.read_product,mall.read_order,mall.read_analytics')
      .split(/[\s,]+/).filter(Boolean)
  );
  scopes.add('mall.read_product');
  scopes.add('mall.read_order');
  scopes.add('mall.read_analytics');
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
    shopNo: Number(process.env.CAFE24_SHOP_NO || 1),
    syncDays: Number(process.env.CAFE24_SYNC_DAYS || 7),
    analyticsPaths: {
      visitors: process.env.CAFE24_ANALYTICS_VISITORS_PATH || '/visitors/view',
      pageviews: process.env.CAFE24_ANALYTICS_PAGEVIEWS_PATH || '/visitors/pageview',
      referrers: referrerPath
    }
  };
}

module.exports = { getConfig };
