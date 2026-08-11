'use strict';

function getConfig() {
  const config = {
    vendorId: process.env.COUPANG_VENDOR_ID,
    accessKey: process.env.COUPANG_ACCESS_KEY,
    secretKey: process.env.COUPANG_SECRET_KEY,
    baseUrl: 'https://api-gateway.coupang.com',
    syncDays: Math.max(1, Math.min(Number(process.env.COUPANG_SYNC_DAYS || 30), 31))
  };
  const missing = Object.entries({
    COUPANG_VENDOR_ID: config.vendorId,
    COUPANG_ACCESS_KEY: config.accessKey,
    COUPANG_SECRET_KEY: config.secretKey
  }).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing server environment variables: ${missing.join(', ')}`);
  return config;
}

module.exports = { getConfig };
