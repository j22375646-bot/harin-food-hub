'use strict';

const BASE_URL = 'https://naverapihub.apigw.ntruss.com';
const SEARCH_TREND_PATH = '/search-trend/v1/search';
const SHOPPING_KEYWORD_PATH = '/shopping/v1/category/keywords';
const SEARCH_PATHS = Object.freeze({
  BLOG:'/search/v1/blog',
  CAFE:'/search/v1/cafearticle',
  KIN:'/search/v1/kin',
  NEWS:'/search/v1/news'
});

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
    const error = new Error(payload?.errorMessage || payload?.errMsg || payload?.error?.message || payload?.message || `NAVER API HUB 요청 실패 (${response.status})`);
    error.code = payload?.errorCode || payload?.errId || payload?.error?.errorCode || 'NAVER_API_HUB_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return { status:response.status, data:payload };
}

async function fetchSearch({ type, query, display = 5, start = 1, sort = 'sim', config = getConfig(), fetchImpl = globalThis.fetch }) {
  const normalizedType = text(type).toUpperCase();
  const pathname = SEARCH_PATHS[normalizedType];
  if (!pathname) {
    const error = new Error('지원하지 않는 네이버 검색 자료 유형입니다.');
    error.code = 'NAVER_API_HUB_SEARCH_TYPE_INVALID';
    error.status = 400;
    throw error;
  }
  const safeQuery = text(query);
  if (!safeQuery || safeQuery.length > 100) {
    const error = new Error('검색어는 1~100자로 입력해주세요.');
    error.code = 'NAVER_API_HUB_SEARCH_QUERY_INVALID';
    error.status = 400;
    throw error;
  }
  const safeDisplay = Math.min(10, Math.max(1, Number.parseInt(display, 10) || 5));
  const safeStart = Math.min(1000, Math.max(1, Number.parseInt(start, 10) || 1));
  const allowedSort = normalizedType === 'KIN' ? new Set(['sim','date','point']) : new Set(['sim','date']);
  const safeSort = allowedSort.has(sort) ? sort : 'sim';
  const params = new URLSearchParams({ query:safeQuery, display:String(safeDisplay), start:String(safeStart), sort:safeSort, format:'json' });
  const response = await fetchImpl(`${BASE_URL}${pathname}?${params}`, {
    method:'GET',
    headers:{
      'X-NCP-APIGW-API-KEY-ID':config.clientId,
      'X-NCP-APIGW-API-KEY':config.clientSecret,
      Accept:'application/json'
    },
    cache:'no-store',
    signal:AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.errorMessage || payload?.errMsg || payload?.error?.message || payload?.message || `NAVER API HUB 검색 요청 실패 (${response.status})`);
    error.code = payload?.errorCode || payload?.errId || payload?.error?.errorCode || 'NAVER_API_HUB_SEARCH_FAILED';
    error.status = response.status;
    throw error;
  }
  return { status:response.status, data:payload, pathname, query:safeQuery };
}

async function fetchSearchTrend({ startDate, endDate, timeUnit, keywordGroups, config = getConfig() }) {
  return request(SEARCH_TREND_PATH, { config, body:{ startDate, endDate, timeUnit, keywordGroups } });
}

async function fetchShoppingKeywordTrend({ startDate, endDate, timeUnit, category, keywords, config = getConfig() }) {
  return request(SHOPPING_KEYWORD_PATH, { config, body:{ startDate, endDate, timeUnit, category, keyword:keywords.map(name => ({ name, param:[name] })) } });
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

module.exports = {
  BASE_URL, SEARCH_TREND_PATH, SHOPPING_KEYWORD_PATH, SEARCH_PATHS, getConfig, request,
  fetchSearchTrend, fetchShoppingKeywordTrend, fetchSearch, probeSearchTrend
};
