'use strict';

class ApiInputError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') {
    super(message);
    this.name = 'ApiInputError';
    this.status = status;
    this.code = code;
  }
}

const REQUIRED_FIELDS = Object.freeze(['source', 'medium', 'campaign', 'campaignId']);
const PARAMETER_ORDER = Object.freeze([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_id',
  'utm_content',
  'utm_term',
]);

const UTM_RULE = Object.freeze({
  version: 'utm-v1',
  requiredFields: REQUIRED_FIELDS,
  parameterOrder: PARAMETER_ORDER,
  normalization: Object.freeze({ unicode: 'NFC', trim: true, lowercaseFields: Object.freeze(['source', 'medium']) }),
  maxLandingUrlLength: 4096,
  maxValueLength: 200,
  maxIdLength: 128,
  personalDataNotice: '캠페인명·검색어 등 임의 입력란에 개인정보를 입력하지 마세요.',
});

const FIELD_TO_PARAMETER = Object.freeze({
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  campaignId: 'utm_id',
  creativeId: 'utm_content',
  term: 'utm_term',
});
const PARAMETER_TO_FIELD = Object.freeze(Object.fromEntries(
  Object.entries(FIELD_TO_PARAMETER).map(([field, parameter]) => [parameter, field]),
));
const SENSITIVE_QUERY_KEYS = new Set(['password', 'token', 'access_token', 'api_key', 'email', 'phone']);
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message, code) {
  throw new ApiInputError(message, 400, code);
}

function normalizeText(value, field, { required = false, lowercase = false, maxLength = UTM_RULE.maxValueLength } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(`${field} 필드는 필수입니다.`, 'MISSING_REQUIRED_FIELD');
    return null;
  }
  if (typeof value !== 'string') fail(`${field} 필드는 문자열이어야 합니다.`, 'INVALID_FIELD_TYPE');
  if (CONTROL_CHARACTER.test(value)) fail(`${field} 필드에 제어 문자를 사용할 수 없습니다.`, 'CONTROL_CHARACTER');
  let normalized = value.normalize('NFC').trim();
  if (!normalized) {
    if (required) fail(`${field} 필드는 필수입니다.`, 'MISSING_REQUIRED_FIELD');
    return null;
  }
  if (normalized.length > maxLength) fail(`${field} 필드가 허용 길이를 초과했습니다.`, 'VALUE_TOO_LONG');
  if (lowercase) normalized = normalized.toLowerCase();
  return normalized;
}

function normalizeLandingUrl(value) {
  const landingUrl = normalizeText(value, 'landingUrl', {
    required: true,
    maxLength: UTM_RULE.maxLandingUrlLength,
  });
  let parsed;
  try {
    parsed = new URL(landingUrl);
  } catch {
    fail('유효한 랜딩 URL을 입력해주세요.', 'INVALID_LANDING_URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fail('HTTPS이며 인증정보가 없는 랜딩 URL만 사용할 수 있습니다.', 'INVALID_LANDING_URL');
  }
  return { landingUrl, parsed };
}

function normalizeInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('입력값은 객체여야 합니다.', 'INVALID_INPUT');
  }
  const { landingUrl, parsed } = normalizeLandingUrl(input.landingUrl);
  const normalized = {
    landingUrl,
    source: normalizeText(input.source, 'source', { required: true, lowercase: true }),
    medium: normalizeText(input.medium, 'medium', { required: true, lowercase: true }),
    campaign: normalizeText(input.campaign, 'campaign', { required: true }),
    campaignId: normalizeText(input.campaignId, 'campaignId', { required: true, maxLength: UTM_RULE.maxIdLength }),
    creativeId: normalizeText(input.creativeId, 'creativeId', { maxLength: UTM_RULE.maxIdLength }),
    term: normalizeText(input.term, 'term'),
    productId: normalizeText(input.productId, 'productId', { maxLength: UTM_RULE.maxIdLength }),
  };
  if (normalized.productId && !UUID.test(normalized.productId)) {
    fail('productId는 UUID 형식이어야 합니다.', 'INVALID_PRODUCT_ID');
  }
  if (normalized.productId) normalized.productId = normalized.productId.toLowerCase();
  return { normalized, parsed };
}

function comparableValue(field, value) {
  const normalized = String(value).normalize('NFC').trim();
  return field === 'source' || field === 'medium' ? normalized.toLowerCase() : normalized;
}

function inspectExistingQuery(parsed, normalized) {
  const found = new Map();
  for (const [rawKey, value] of parsed.searchParams) {
    const key = rawKey.toLowerCase();
    if (SENSITIVE_QUERY_KEYS.has(key)) {
      fail(`민감한 쿼리 키(${rawKey})는 랜딩 URL에 포함할 수 없습니다.`, 'SENSITIVE_QUERY_PARAMETER');
    }
    if (!(key in PARAMETER_TO_FIELD)) continue;
    if (found.has(key)) fail(`중복 UTM 파라미터(${rawKey})가 있습니다.`, 'DUPLICATE_UTM_PARAMETER');
    found.set(key, value);
  }

  for (const [parameter, existingValue] of found) {
    const field = PARAMETER_TO_FIELD[parameter];
    const suppliedValue = normalized[field];
    if (suppliedValue !== null && comparableValue(field, existingValue) !== suppliedValue) {
      fail(`기존 ${parameter} 값과 입력값이 충돌합니다.`, 'CONFLICTING_UTM_PARAMETER');
    }
  }
  return found;
}

function appendMissingParameters(landingUrl, normalized, existing) {
  const hashIndex = landingUrl.indexOf('#');
  const beforeHash = hashIndex === -1 ? landingUrl : landingUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : landingUrl.slice(hashIndex);
  const additions = [];

  for (const parameter of PARAMETER_ORDER) {
    if (existing.has(parameter)) continue;
    const value = normalized[PARAMETER_TO_FIELD[parameter]];
    if (value === null) continue;
    const encoded = new URLSearchParams();
    encoded.append(parameter, value);
    additions.push(encoded.toString());
  }
  if (additions.length === 0) return landingUrl;
  const separator = beforeHash.includes('?')
    ? (beforeHash.endsWith('?') || beforeHash.endsWith('&') ? '' : '&')
    : '?';
  return `${beforeHash}${separator}${additions.join('&')}${hash}`;
}

function buildUtmLink(input) {
  const { normalized, parsed } = normalizeInput(input);
  const existing = inspectExistingQuery(parsed, normalized);
  return {
    url: appendMissingParameters(normalized.landingUrl, normalized, existing),
    normalized,
    ruleVersion: UTM_RULE.version,
    warnings: [UTM_RULE.personalDataNotice],
  };
}

module.exports = {
  UTM_RULE,
  buildUtmLink,
};
