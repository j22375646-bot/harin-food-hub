'use strict';

const BASE_URL = 'https://naverapihub.apigw.ntruss.com';
const SEARCH_TREND_PATH = '/search-trend/v1/search';

const text = value => value == null ? '' : String(value).trim();

function getConfig(env = process.env) {
  const clientId = text(env.NAVER_API_HUB_CLIENT_ID);
  const clientSecret = text(env.NAVER_API_HUB_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    const error = new Error('NAVER API HUB Client ID와 Secret을 서버에 저장해주세요.');
    error.code = 'NAVER_API_HUB_CONFIG_REQUIRED';
    error.status = 503;
    throw error;
  }
  return { clientId, clientSecret };
}

async function request(pathname, { body, config = getConfig() } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method:'POST',
    headers:{
      'X-NCP-APIGW-API-KEY-ID':config.clientId,
      'X-NCP-APIGW-API-KEY':config.clientSecret,
      'Content-Type':'application/json',
      Accept:'application/json'
    },
    body:JSON.stringify(body || {}),
    cache:'no-store',
    signal:AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.errorMessage || payload?.message || `NAVER API HUB 요청 실패 (${response.status})`);
    error.code = payload?.errorCode || 'NAVER_API_HUB_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return { status:response.status, data:payload };
}

function dateKey(value) { return new Date(value).toISOString().slice(0, 10); }

async function probeSearchTrend({ now = new Date(), config = getConfig() } = {}) {
  const end = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  return request(SEARCH_TREND_PATH, {
    config,
    body:{
      startDate:dateKey(start), endDate:dateKey(end), timeUnit:'date',
      keywordGroups:[{ groupName:'하린식품', keywords:['하린식품'] }]
    }
  });
}

module.exports = { BASE_URL, SEARCH_TREND_PATH, getConfig, request, probeSearchTrend };
