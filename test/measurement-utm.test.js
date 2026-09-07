'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { UTM_RULE, buildUtmLink } = require('../lib/measurement/utm');

const VALID_INPUT = Object.freeze({
  landingUrl: 'https://shop.example/products/item',
  source: 'naver',
  medium: 'cpc',
  campaign: 'autumn-sale',
  campaignId: 'autumn-2026',
});

function assertInputError(input, code) {
  assert.throws(
    () => buildUtmLink(input),
    error => error?.name === 'ApiInputError'
      && error?.status === 400
      && error?.code === code,
  );
}

test('builds the same exact URL twice while preserving Unicode, encoded query, and fragment', () => {
  const input = {
    landingUrl: 'https://shop.example/products/차?option=한글%20값#details',
    source: ' NAVER ',
    medium: ' CPC ',
    campaign: '가을 행사',
    campaignId: 'autumn-2026',
    creativeId: 'image-01',
  };
  const expected = 'https://shop.example/products/차?option=한글%20값&utm_source=naver&utm_medium=cpc&utm_campaign=%EA%B0%80%EC%9D%84+%ED%96%89%EC%82%AC&utm_id=autumn-2026&utm_content=image-01#details';

  const first = buildUtmLink(input);
  const second = buildUtmLink(input);

  assert.equal(first.url, expected);
  assert.equal(second.url, expected);
  assert.deepEqual(first.normalized, {
    landingUrl: input.landingUrl,
    source: 'naver',
    medium: 'cpc',
    campaign: '가을 행사',
    campaignId: 'autumn-2026',
    creativeId: 'image-01',
    term: null,
    productId: null,
  });
  assert.equal(first.ruleVersion, 'utm-v1');
  assert.deepEqual(first.warnings, [UTM_RULE.personalDataNotice]);
});

test('preserves valid percent-encoded Korean in path, query value, and fragment', () => {
  const result = buildUtmLink({
    ...VALID_INPUT,
    landingUrl: 'https://shop.example/%EC%95%88?label=%ED%95%9C%EA%B8%80#%EC%83%81%EC%84%B8',
  });

  assert.equal(result.url, 'https://shop.example/%EC%95%88?label=%ED%95%9C%EA%B8%80&utm_source=naver&utm_medium=cpc&utm_campaign=autumn-sale&utm_id=autumn-2026#%EC%83%81%EC%84%B8');
});

test('reparses a generated Korean campaign URL without changing it', () => {
  const input = {
    ...VALID_INPUT,
    campaign: '가을 행사',
  };
  const first = buildUtmLink(input);
  const second = buildUtmLink({ ...input, landingUrl: first.url });

  assert.equal(second.url, first.url);
});

test('normalizes NFC text and appends optional UTM fields in deterministic order', () => {
  const productId = '550e8400-e29b-41d4-a716-446655440000';
  const result = buildUtmLink({
    ...VALID_INPUT,
    campaign: ' 가을 ',
    term: ' 간식 추천 ',
    productId: ` ${productId.toUpperCase()} `,
  });

  assert.equal(result.url, 'https://shop.example/products/item?utm_source=naver&utm_medium=cpc&utm_campaign=%EA%B0%80%EC%9D%84&utm_id=autumn-2026&utm_term=%EA%B0%84%EC%8B%9D+%EC%B6%94%EC%B2%9C');
  assert.equal(result.normalized.campaign, '가을');
  assert.equal(result.normalized.term, '간식 추천');
  assert.equal(result.normalized.productId, productId);
});

test('publishes an immutable rule with limits, order, and a no-personal-data notice', () => {
  assert.deepEqual(UTM_RULE.requiredFields, ['source', 'medium', 'campaign', 'campaignId']);
  assert.deepEqual(UTM_RULE.parameterOrder, ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term']);
  assert.equal(UTM_RULE.version, 'utm-v1');
  assert.equal(UTM_RULE.maxLandingUrlLength, 4096);
  assert.equal(UTM_RULE.maxValueLength, 200);
  assert.equal(UTM_RULE.maxIdLength, 128);
  assert.match(UTM_RULE.personalDataNotice, /개인정보/);
  assert.equal(Object.isFrozen(UTM_RULE), true);
  assert.equal(Object.isFrozen(UTM_RULE.requiredFields), true);
  assert.throws(() => UTM_RULE.requiredFields.push('term'), TypeError);
});

for (const field of UTM_RULE.requiredFields) {
  test(`rejects missing required field: ${field}`, () => {
    const input = { ...VALID_INPUT };
    delete input[field];
    assertInputError(input, 'MISSING_REQUIRED_FIELD');
    assertInputError({ ...VALID_INPUT, [field]: '   ' }, 'MISSING_REQUIRED_FIELD');
  });
}

for (const landingUrl of [
  'not a URL',
  'http://shop.example/products/item',
  'https://user:password@shop.example/products/item',
]) {
  test(`rejects unsafe landing URL: ${landingUrl}`, () => {
    assertInputError({ ...VALID_INPUT, landingUrl }, 'INVALID_LANDING_URL');
  });
}

test('rejects duplicate UTM keys including case variants', () => {
  assertInputError({
    ...VALID_INPUT,
    landingUrl: 'https://shop.example/?utm_source=naver&UTM_SOURCE=naver',
  }, 'DUPLICATE_UTM_PARAMETER');
});

test('rejects conflicting existing UTM attribution', () => {
  assertInputError({
    ...VALID_INPUT,
    landingUrl: 'https://shop.example/?utm_campaign=another-campaign',
  }, 'CONFLICTING_UTM_PARAMETER');
  assertInputError({
    ...VALID_INPUT,
    landingUrl: 'https://shop.example/?utm_content=existing-creative',
    creativeId: 'new-creative',
  }, 'CONFLICTING_UTM_PARAMETER');
});

test('accepts one equal existing UTM value without duplicating it and is idempotent', () => {
  const input = {
    ...VALID_INPUT,
    landingUrl: 'https://shop.example/?keep=a%20b&utm_source=NAVER#result',
    creativeId: 'image-01',
  };
  const first = buildUtmLink(input);
  const second = buildUtmLink({ ...input, landingUrl: first.url });

  assert.equal(first.url, 'https://shop.example/?keep=a%20b&utm_source=NAVER&utm_medium=cpc&utm_campaign=autumn-sale&utm_id=autumn-2026&utm_content=image-01#result');
  assert.equal(second.url, first.url);
  assert.equal((first.url.match(/utm_source/gi) || []).length, 1);
});

test('preserves ordinary query keys that match inherited object property names', () => {
  const result = buildUtmLink({
    ...VALID_INPUT,
    landingUrl: 'https://shop.example/item?constructor=plain%20value&toString=kept#result',
  });

  assert.equal(result.url, 'https://shop.example/item?constructor=plain%20value&toString=kept&utm_source=naver&utm_medium=cpc&utm_campaign=autumn-sale&utm_id=autumn-2026#result');
});

test('rejects URL and field values above their maximum lengths', () => {
  assertInputError({ ...VALID_INPUT, landingUrl: `https://shop.example/${'a'.repeat(4076)}` }, 'VALUE_TOO_LONG');
  assertInputError({ ...VALID_INPUT, campaign: '가'.repeat(201) }, 'VALUE_TOO_LONG');
  assertInputError({ ...VALID_INPUT, campaignId: 'a'.repeat(129) }, 'VALUE_TOO_LONG');
  assertInputError({ ...VALID_INPUT, creativeId: 'a'.repeat(129) }, 'VALUE_TOO_LONG');
});

test('accepts values exactly at their maximum lengths', () => {
  const result = buildUtmLink({
    ...VALID_INPUT,
    campaign: '가'.repeat(200),
    campaignId: 'a'.repeat(128),
    creativeId: 'b'.repeat(128),
  });
  assert.equal(result.normalized.campaign.length, 200);
  assert.equal(result.normalized.campaignId.length, 128);
});

test('rejects control characters in any supplied field', () => {
  assertInputError({ ...VALID_INPUT, campaign: 'sale\nadmin' }, 'CONTROL_CHARACTER');
  assertInputError({ ...VALID_INPUT, landingUrl: 'https://shop.example/item\u0000' }, 'CONTROL_CHARACTER');
});

for (const [location, landingUrl] of [
  ['path', 'https://shop.example/item%0Aname'],
  ['query key', 'https://shop.example/item?note%0Akey=value'],
  ['query value', 'https://shop.example/item?note=value%C2%85next'],
  ['fragment', 'https://shop.example/item#details%0Aadmin'],
]) {
  test(`rejects percent-encoded control characters in the ${location}`, () => {
    assertInputError({ ...VALID_INPUT, landingUrl }, 'CONTROL_CHARACTER');
  });
}

test('rejects non-UUID productId and normalizes a valid UUID', () => {
  assertInputError({ ...VALID_INPUT, productId: 'product-01' }, 'INVALID_PRODUCT_ID');
  const result = buildUtmLink({ ...VALID_INPUT, productId: '550E8400-E29B-41D4-A716-446655440000' });
  assert.equal(result.normalized.productId, '550e8400-e29b-41d4-a716-446655440000');
});

for (const key of ['password', 'token', 'access_token', 'api_key', 'email', 'phone']) {
  test(`rejects sensitive query key: ${key}`, () => {
    assertInputError({
      ...VALID_INPUT,
      landingUrl: `https://shop.example/item?${key}=synthetic-value`,
    }, 'SENSITIVE_QUERY_PARAMETER');
    assertInputError({
      ...VALID_INPUT,
      landingUrl: `https://shop.example/item?${key.toUpperCase()}=synthetic-value`,
    }, 'SENSITIVE_QUERY_PARAMETER');
  });
}

test('rejects unsupported input types instead of coercing them', () => {
  assertInputError({ ...VALID_INPUT, source: 123 }, 'INVALID_FIELD_TYPE');
  assertInputError(null, 'INVALID_INPUT');
});
