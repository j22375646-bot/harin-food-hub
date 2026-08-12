'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../lib/notifications/service.js');

test('notification settings validate and normalize email and severity', () => {
  const row = service.sanitizeSettings({
    recipient_email:' owner@example.com ', email_enabled:1, instant_alert_enabled:true,
    daily_report_enabled:true, weekly_report_enabled:false, monthly_report_enabled:true,
    minimum_severity:'warning'
  });
  assert.equal(row.recipient_email,'owner@example.com');
  assert.equal(row.minimum_severity,'WARNING');
  assert.equal(row.weekly_report_enabled,false);
  assert.throws(()=>service.sanitizeSettings({recipient_email:'wrong-address'}),/이메일/);
});

test('email delivery configuration never exposes or accepts missing server secrets', () => {
  const beforeKey=process.env.RESEND_API_KEY,beforeFrom=process.env.REPORT_FROM_EMAIL;
  delete process.env.RESEND_API_KEY;delete process.env.REPORT_FROM_EMAIL;
  assert.match(service.deliveryConfiguration({email_enabled:true,recipient_email:'owner@example.com'}).reason,/RESEND_API_KEY/);
  process.env.RESEND_API_KEY='server-secret';
  assert.match(service.deliveryConfiguration({email_enabled:true,recipient_email:'owner@example.com'}).reason,/REPORT_FROM_EMAIL/);
  if(beforeKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=beforeKey;
  if(beforeFrom===undefined)delete process.env.REPORT_FROM_EMAIL;else process.env.REPORT_FROM_EMAIL=beforeFrom;
});

test('report email contains computed summary and escaped content', () => {
  const html=service.reportEmail({title:'통합 <보고서>',period_start:'2026-08-01',period_end:'2026-08-07',summary_json:{cafe24:{revenue:120000},naver:{roas:321.4},insights:[{title:'매출 확인',body:'정상 & 성장'}],recommendations:[]}});
  assert.match(html,/120,000원/);
  assert.match(html,/321.4%/);
  assert.match(html,/통합 &lt;보고서&gt;/);
  assert.match(html,/정상 &amp; 성장/);
});

test('Resend request uses server key and expected payload', async () => {
  const beforeKey=process.env.RESEND_API_KEY,beforeFrom=process.env.REPORT_FROM_EMAIL;
  process.env.RESEND_API_KEY='test-key';process.env.REPORT_FROM_EMAIL='Hub <reports@example.com>';
  let captured;
  const response=await service.sendEmail({to:'owner@example.com',subject:'테스트',html:'<b>ok</b>',fetchImpl:async (url,options)=>{captured={url,options};return {ok:true,json:async()=>({id:'mail-1'})};}});
  assert.equal(response.id,'mail-1');
  assert.equal(captured.url,'https://api.resend.com/emails');
  assert.equal(captured.options.headers.authorization,'Bearer test-key');
  const body=JSON.parse(captured.options.body);
  assert.deepEqual(body.to,['owner@example.com']);
  assert.equal(body.from,'Hub <reports@example.com>');
  if(beforeKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=beforeKey;
  if(beforeFrom===undefined)delete process.env.REPORT_FROM_EMAIL;else process.env.REPORT_FROM_EMAIL=beforeFrom;
});
