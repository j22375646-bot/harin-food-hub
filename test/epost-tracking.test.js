'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const tracking=require('../lib/epost/tracking.js');
const label=require('../lib/shipping/label.js');

const xml=`<?xml version="1.0" encoding="UTF-8"?><response><regiNo>1234567890123</regiNo><item><eventhms>20260814101500</eventhms><eventnm>접수</eventnm><eventregiponm>승주우체국</eventregiponm></item><item><eventhms>20260815143000</eventhms><eventnm>배달완료</eventnm><eventregiponm>서울중앙우체국</eventregiponm><delivrsltNm>배달완료</delivrsltNm></item></response>`;

test('parses ePost trace events newest-first and recognizes final delivery',()=>{
  const result=tracking.parseTrackingResponse(xml,'1234567890123');
  assert.equal(result.trackingNo,'1234567890123');
  assert.equal(result.statusCode,'DELIVERED');
  assert.equal(result.statusLabel,'배달완료');
  assert.equal(result.latestEvent.name,'배달완료');
  assert.equal(result.events.length,2);
  assert.match(result.deliveredAt,/2026-08-15T14:30:00/);
});

test('recognizes the live ePost tracestatus field as an in-transit event',()=>{
  const result=tracking.parseTrackingResponse('<?xml version="1.0"?><trace><itemlist><item><eventhms><![CDATA[20260814153000]]></eventhms><eventregiponm><![CDATA[승주우체국]]></eventregiponm><tracestatus><![CDATA[발송]]></tracestatus></item></itemlist></trace>','1234567890123');
  assert.equal(result.statusCode,'IN_TRANSIT');
  assert.equal(result.latestEvent.name,'발송');
});

test('treats ePost ERR-001 no-result as waiting instead of a failed API job',()=>{
  const result=tracking.parseTrackingResponse('<?xml version="1.0"?><error><error_code>ERR-001</error_code><message>조회결과가 없습니다.</message></error>','1234567890123');
  assert.equal(result.statusCode,'NOT_FOUND');
  assert.equal(result.statusLabel,'우체국 접수 확인 전');
  assert.equal(result.events.length,0);
});

test('tracking client requires the dedicated server key and uses the official trace target',async()=>{
  await assert.rejects(()=>tracking.trace('1234567890123',{env:{},fetchImpl:async()=>{}}),error=>error.code==='EPOST_TRACKING_KEY_REQUIRED');
  let called='';
  const result=await tracking.trace('1234567890123',{env:{EPOST_TRACKING_API_KEY:'tracking-test-key'},fetchImpl:async url=>{called=String(url);return {ok:true,status:200,text:async()=>xml};}});
  assert.equal(result.statusCode,'DELIVERED');
  assert.match(called,/target=trace/);
  assert.match(called,/query=1234567890123/);
});

test('creates a scannable Code 128 label barcode for a 13 digit postal number',()=>{
  const values=label.code128Values('1234567890123');
  assert.equal(values[0],104);
  assert.equal(values.at(-1),106);
  const svg=label.barcodeSvg('1234567890123');
  assert.match(svg,/trackingBarcode/);
  assert.match(svg,/<rect /);
  assert.throws(()=>label.barcodeSvg('TESTREGINOAPI'));
});

test('phase 11-3E routes stay authenticated and queue read-only fixed-IP tracking',()=>{
  const root=path.resolve(__dirname,'..');
  const route=fs.readFileSync(path.join(root,'app/api/shipping/tracking/route.js'),'utf8');
  const print=fs.readFileSync(path.join(root,'app/api/shipping/print/route.js'),'utf8');
  const worker=fs.readFileSync(path.join(root,'scripts/coupang-local-worker.js'),'utf8');
  assert.match(route,/apiSafety\.isAuthorized/);
  assert.match(route,/queueTrackingForOrders/);
  assert.match(worker,/EPOST_TRACKING/);
  assert.match(print,/type==='label'/);
  assert.match(print,/barcodeSvg/);
  assert.match(print,/Cache-Control|cache-control/);
});
