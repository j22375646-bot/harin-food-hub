'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUnifiedCollectionCenter } = require('../lib/collection/unified-center.js');

const connections = { channels:[
  {platform:'NAVER',status:'READ_READY',summary:'읽기 연결'},
  {platform:'CAFE24',status:'WRITE_READY',summary:'연결됨'},
  {platform:'COUPANG',status:'READ_READY',summary:'고정 IP 연결'}
]};

test('세 채널의 연결·수집·다음 예약 시각을 한 상태로 합친다', () => {
  const center=buildUnifiedCollectionCenter({channelConnections:connections,dataHealth:{nextScheduledAt:'2026-08-15T20:30:00Z',channels:[
    {platform:'NAVER',status:'READY',dataMode:'LIVE',calculationStatus:'READY',storedSummary:'100개 키워드',lastSuccessAt:'2026-08-14T01:00:00Z'},
    {platform:'CAFE24',status:'READY',dataMode:'LIVE',calculationStatus:'READY',storedSummary:'10건 주문'},
    {platform:'COUPANG',status:'READY',dataMode:'LIVE',calculationStatus:'READY',storedSummary:'20건 주문'}
  ]}});
  assert.equal(center.phase,'11-8');
  assert.equal(center.overall_status,'READY');
  assert.equal(center.summary.ready_channels,3);
  assert.equal(center.next_scheduled_at,'2026-08-15T20:30:00Z');
});

test('한 채널 실패를 다른 채널과 격리하고 해당 채널 재수집을 권한다', () => {
  const center=buildUnifiedCollectionCenter({channelConnections:connections,dataHealth:{channels:[
    {platform:'NAVER',status:'READY',dataMode:'LIVE'},
    {platform:'CAFE24',status:'FAILED',dataMode:'PREVIOUS',failedDatasets:['orders']},
    {platform:'COUPANG',status:'READY',dataMode:'LIVE'}
  ]}});
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.action.code,'RETRY');
  assert.equal(center.summary.ready_channels,2);
  assert.equal(center.summary.previous_data_channels,1);
  assert.match(center.recommendations[0].title,/Cafe24/);
});

test('권한 연결이 안 된 채널은 빈 0건 대신 연결부터 안내한다', () => {
  const center=buildUnifiedCollectionCenter({channelConnections:{channels:[{platform:'NAVER',status:'SETUP_REQUIRED'}]},dataHealth:{channels:[{platform:'NAVER',status:'WAITING'}]}});
  const naver=center.channels.find(item=>item.platform==='NAVER');
  assert.equal(naver.action.code,'CONNECT');
  assert.equal(naver.stored_summary,'저장량 확인 필요');
});

test('수집 화면에서 제외된 대용량 표의 0건 대신 최근 성공 수집 행수를 사용한다', () => {
  const center=buildUnifiedCollectionCenter({channelConnections:connections,syncs:[
    {platform:'CAFE24',status:'SUCCESS',rows_received:184,finished_at:'2026-08-14T01:00:00Z'}
  ],dataHealth:{channels:[{platform:'CAFE24',status:'READY',storedSummary:'0건 주문'}]}});
  assert.equal(center.channels.find(item=>item.platform==='CAFE24').stored_summary,'최근 수집 184행');
});

test('품질 문제와 쿠팡 장기 실패를 운영 우선순위에 포함한다', () => {
  const center=buildUnifiedCollectionCenter({channelConnections:connections,dataHealth:{channels:[]},qualityChecks:[
    {platform:'CAFE24',dataset:'orders',status_code:'MISSING'},
    {platform:'CAFE24',dataset:'orders',status_code:'OK'},
    {platform:'NAVER',dataset:'stats',status_code:'OK'}
  ],queueHealth:{pending:1,running:1,retryWaiting:2,longFailures:[{id:'x'}]}});
  assert.equal(center.summary.quality_problems,1);
  assert.equal(center.summary.active_queue,4);
  assert.equal(center.summary.long_failures,1);
  assert.ok(center.recommendations.some(item=>/장기 실패/.test(item.title)));
});
