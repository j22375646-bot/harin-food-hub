'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { qualityFingerprint, obsoleteQualityAlertIds } = require('../lib/qa/validator.js');

test('최신 QA가 정상으로 복구되면 과거 오류 알림을 해결 대상으로 고른다', () => {
  const checks = [{ platform:'COUPANG', dataset:'SYNC', status_code:'OK', severity:'INFO' }];
  const alerts = [
    { id:'old', fingerprint:'QA:COUPANG:SYNC:API_ERROR' },
    { id:'other', fingerprint:'ANOMALY:COUPANG:CPA' }
  ];
  assert.deepEqual(obsoleteQualityAlertIds(alerts, checks), ['old']);
});

test('같은 QA 오류가 계속되면 열린 알림을 유지한다', () => {
  const error = { platform:'COUPANG', dataset:'SYNC', status_code:'API_ERROR', severity:'ERROR' };
  assert.equal(qualityFingerprint(error), 'QA:COUPANG:SYNC:API_ERROR');
  assert.deepEqual(obsoleteQualityAlertIds([{ id:'active', fingerprint:qualityFingerprint(error) }], [error]), []);
});
