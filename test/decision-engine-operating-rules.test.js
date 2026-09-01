'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const engine=require('../lib/analytics/decision-engine.js');

test('기간 데이터 충족률은 저장된 운영 기준으로 정상 여부를 판정한다',()=>{
  const dates=['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09'];
  const relaxed=engine.dataCoverage({start:'2026-08-01',end:'2026-08-10',trafficDates:dates,minimumRate:90});
  const strict=engine.dataCoverage({start:'2026-08-01',end:'2026-08-10',trafficDates:dates,minimumRate:95});
  assert.equal(relaxed.cafe24_traffic.status,'OK');
  assert.equal(strict.cafe24_traffic.status,'PARTIAL');
  assert.equal(strict.cafe24_traffic.required_rate,95);
});
