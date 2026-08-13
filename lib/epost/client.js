'use strict';

const seed128 = require('./seed128.js');
const configModule = require('./config.js');
const parcel = require('./parcel.js');

const BASE_URL = 'https://ship.epost.go.kr';
const text = value => value == null ? '' : String(value).trim();

function decodeXml(value) {
  return text(value).replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

function tag(xml, ...names) {
  for (const name of names) {
    const match = String(xml || '').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decodeXml(match[1]);
  }
  return '';
}

function parseResponse(xml) {
  const errorCode = tag(xml, 'error_code', 'errorCode');
  const errorMessage = tag(xml, 'message', 'error_message', 'errorMessage');
  if (errorCode) {
    throw Object.assign(new Error(errorMessage || `우체국 오류 ${errorCode}`), { code:errorCode, status:/^ERR-(?:1|2)/.test(errorCode) ? 400 : 502 });
  }
  return {
    requestNo:tag(xml, 'reqNo'), reservationNo:tag(xml, 'resNo'), trackingNo:tag(xml, 'regiNo'),
    orderNo:tag(xml, 'orderNo'), postOffice:tag(xml, 'regipoNm', 'regiPoNm'),
    reservedAt:tag(xml, 'resDate'), estimatedPrice:tag(xml, 'price'),
    treatmentStatus:tag(xml, 'treatStusCd'), notice:tag(xml, 'notifyMsg')
  };
}

async function call(message, plainText, { env = process.env, fetchImpl = fetch } = {}) {
  const config = configModule.configured(env);
  const body = new URLSearchParams({ key:config.apiKey, regData:seed128.encryptRegData(config.securityKey, plainText), option:'001' });
  const response = await fetchImpl(`${BASE_URL}/${message}`, {
    method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8', Accept:'application/xml,text/xml' },
    body, redirect:'error', signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Object.assign(new Error(`우체국 OpenAPI 응답 오류(HTTP ${response.status})`), { code:'EPOST_HTTP_ERROR', status:502 });
  const xml = await response.text();
  if (!xml.trim().startsWith('<')) throw Object.assign(new Error('우체국 OpenAPI XML 응답을 확인할 수 없습니다.'), { code:'EPOST_INVALID_XML', status:502 });
  return parseResponse(xml);
}

async function findTestApplication(application, options = {}) {
  const config = configModule.configured(options.env);
  const plainText = `custNo=${config.customerNo}&reqType=1&orderNo=${application.shipment.orderNo}&reqYmd=${application.shipment.requestDate}`;
  return call('api.GetResInfo.jparcel', plainText, options);
}

async function issueTestShipment(input, options = {}) {
  const config = configModule.configured(options.env);
  if (!config.testWritesEnabled) throw Object.assign(new Error('우체국 테스트 접수 잠금이 켜져 있습니다.'), { code:'EPOST_TEST_WRITE_LOCKED', status:403 });
  if (config.liveWritesEnabled) throw Object.assign(new Error('테스트 단계에서는 실제 접수 잠금을 해제할 수 없습니다.'), { code:'EPOST_LIVE_WRITE_CONFLICT', status:409 });
  const application = parcel.testApplication(input, config);
  try {
    const existing = await findTestApplication(application, options);
    if (existing.requestNo || existing.trackingNo) return { ...existing, reused:true, testOnly:true, status:'TEST_ISSUED' };
  } catch (error) {
    if (error.code !== 'ERR-225') throw error;
  }
  let result = await call('api.InsertOrder.jparcel', application.plainText, options);
  if (!result.requestNo && !result.trackingNo) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    result = await findTestApplication(application, options);
  }
  if (result.trackingNo && result.trackingNo !== 'TESTREGINOAPI') {
    throw Object.assign(new Error('테스트 호출에서 실제 형식의 등기번호가 반환되어 저장을 중단했습니다.'), { code:'EPOST_UNEXPECTED_LIVE_TRACKING', status:409 });
  }
  return { ...result, reused:false, testOnly:true, status:'TEST_ISSUED' };
}

module.exports = { BASE_URL, call, findTestApplication, issueTestShipment, parseResponse };
