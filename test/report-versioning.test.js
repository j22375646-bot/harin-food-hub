'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const versioning = require('../lib/reports/versioning.js');

test('groups versions by platform, type and exact period', () => {
  const rows = [
    {id:'a',platform:'CAFE24',report_type:'WEEKLY',period_start:'2026-08-01',period_end:'2026-08-07',version:1,is_latest:false,created_at:'2026-08-08'},
    {id:'b',platform:'CAFE24',report_type:'WEEKLY',period_start:'2026-08-01',period_end:'2026-08-07',version:2,is_latest:true,created_at:'2026-08-09'},
    {id:'c',platform:'NAVER',report_type:'WEEKLY',period_start:'2026-08-01',period_end:'2026-08-07',version:1,is_latest:true,created_at:'2026-08-08'}
  ];
  const groups = versioning.groupVersions(rows);
  assert.equal(groups.length, 2);
  const cafe = groups.find(item => item.latest.platform === 'CAFE24');
  assert.equal(cafe.latest.id, 'b');
  assert.equal(cafe.count, 2);
});

test('compares server-calculated version metrics', () => {
  const change = versioning.compareVersions({summary_json:{score:90,cafe24:{revenue:120}}},{summary_json:{score:80,cafe24:{revenue:100}}});
  assert.equal(change.score.delta, 10);
  assert.equal(change.cafe24Revenue.delta, 20);
  assert.equal(change.naverRoas.delta, null);
});
