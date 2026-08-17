'use strict';

const PROVIDERS = Object.freeze({
  SEARCH_CONSOLE:'SEARCH_CONSOLE',
  GA4:'GA4',
  PAGESPEED:'PAGESPEED',
  CRUX:'CRUX'
});

function value(env, key) { return String(env[key] || '').trim(); }
function enabled(env, key) { return value(env,key).toLowerCase() !== 'false'; }
function privateKey(env) { return value(env,'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g,'\n'); }
function siteUrl(env) { return value(env,'HUB_OWNED_SITE_URL') || value(env,'GOOGLE_SEARCH_CONSOLE_SITE_URL'); }
function origin(env) {
  try { return new URL(siteUrl(env)).origin; }
  catch { return ''; }
}

function providerConfig(provider, env=process.env) {
  const shared={ provider, siteUrl:siteUrl(env), origin:origin(env) };
  if(provider===PROVIDERS.SEARCH_CONSOLE) return {
    ...shared, enabled:enabled(env,'GOOGLE_SEARCH_CONSOLE_ENABLED'),
    siteUrl:value(env,'GOOGLE_SEARCH_CONSOLE_SITE_URL') || shared.siteUrl,
    clientEmail:value(env,'GOOGLE_SERVICE_ACCOUNT_EMAIL'), privateKey:privateKey(env)
  };
  if(provider===PROVIDERS.GA4) return {
    ...shared, enabled:enabled(env,'GOOGLE_GA4_ENABLED'), propertyId:value(env,'GOOGLE_GA4_PROPERTY_ID'),
    clientEmail:value(env,'GOOGLE_SERVICE_ACCOUNT_EMAIL'), privateKey:privateKey(env)
  };
  if(provider===PROVIDERS.PAGESPEED) return {
    ...shared, enabled:enabled(env,'GOOGLE_PAGESPEED_ENABLED'), apiKey:value(env,'GOOGLE_PAGESPEED_API_KEY')
  };
  if(provider===PROVIDERS.CRUX) return {
    ...shared, enabled:enabled(env,'GOOGLE_CRUX_ENABLED'), apiKey:value(env,'GOOGLE_CRUX_API_KEY')
  };
  throw new Error(`Unsupported Google owned-site provider: ${provider}`);
}

function missingFields(provider, config) {
  const required={
    SEARCH_CONSOLE:[['siteUrl','자사몰 주소'],['clientEmail','서비스 계정 이메일'],['privateKey','서비스 계정 비밀키']],
    GA4:[['siteUrl','자사몰 주소'],['propertyId','GA4 속성 ID'],['clientEmail','서비스 계정 이메일'],['privateKey','서비스 계정 비밀키']],
    // Google officially supports PageSpeed Insights reads without an API key.
    // Keep the key optional so the owner can verify a public store immediately;
    // a key is still recommended later for frequent automated collection.
    PAGESPEED:[['siteUrl','자사몰 주소']],
    CRUX:[['origin','자사몰 원본 주소'],['apiKey','CrUX API 키']]
  }[provider] || [];
  return required.filter(([key])=>!config[key]).map(([,label])=>label);
}

module.exports={ PROVIDERS, providerConfig, missingFields };
