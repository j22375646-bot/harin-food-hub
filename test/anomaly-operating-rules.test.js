'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {detectAnomalies}=require('../lib/anomaly/detector.js');

test('이상징후 감지는 저장된 운영 임계값을 실제 판정에 사용한다',()=>{
  const comparison={cafe24_revenue:{previous:100000,current:79000,change_rate:-21}};
  const relaxed=detectAnomalies({comparison,platform:'CAFE24',thresholds:{anomaly_decrease_warning_percent:25,anomaly_decrease_critical_percent:40}});
  const sensitive=detectAnomalies({comparison,platform:'CAFE24',thresholds:{anomaly_decrease_warning_percent:18,anomaly_decrease_critical_percent:30}});
  assert.equal(relaxed.length,0);
  assert.equal(sensitive.length,1);
  assert.equal(sensitive[0].severity,'WARNING');
});

test('상승형 이상징후도 경고와 위험 기준을 분리한다',()=>{
  const comparison={naver_cpc:{previous:100,current:150,change_rate:50}};
  const found=detectAnomalies({comparison,coverage:{naver_ads:{status:'OK'}},platform:'NAVER',thresholds:{anomaly_increase_warning_percent:20,anomaly_increase_critical_percent:45}});
  assert.equal(found.length,1);
  assert.equal(found[0].severity,'ERROR');
});
