'use strict';

const seed128 = require('./seed128.js');

const text = value => value == null ? '' : String(value).trim();

function configured(env = process.env) {
  return {
    apiKey: text(env.EPOST_API_KEY || env.EPOST_OPEN_API_KEY),
    trackingApiKey: text(env.EPOST_TRACKING_API_KEY),
    securityKey: text(env.EPOST_SECURITY_KEY || env.EPOST_SEED_KEY),
    customerNo: text(env.EPOST_CUSTOMER_NO),
    approvalNo: text(env.EPOST_CONTRACT_APPROVAL_NO || env.EPOST_APPROVAL_NO),
    officeSerial: text(env.EPOST_OFFICE_SERIAL || env.EPOST_OFFICE_SER),
    expectedIp: text(env.EPOST_ALLOWED_SOURCE_IP || env.COUPANG_ALLOWED_SOURCE_IP || '13.124.12.17'),
    testWritesEnabled: text(env.EPOST_TEST_WRITES_ENABLED).toLowerCase() === 'true',
    liveWritesEnabled: text(env.EPOST_LIVE_WRITES_ENABLED).toLowerCase() === 'true'
  };
}

function readiness({ env = process.env, actualIp = '' } = {}) {
  const values = configured(env);
  const encryption = seed128.selfTest();
  const securityKeyBytes = Buffer.byteLength(values.securityKey, 'utf8');
  const checks = {
    fixedIp: {
      label: '서울 고정 IP',
      configured: Boolean(values.expectedIp),
      ok: Boolean(actualIp) && actualIp === values.expectedIp,
      detail: actualIp ? `${actualIp}에서 확인` : '워커 응답 대기'
    },
    apiKey: {
      label: '우체국 인증키',
      configured: Boolean(values.apiKey),
      ok: Boolean(values.apiKey),
      detail: values.apiKey ? '서버 전용 설정 완료' : '워커 환경변수 설정 필요'
    },
    securityKey: {
      label: 'SEED 보안키',
      configured: Boolean(values.securityKey),
      ok: Boolean(values.securityKey) && securityKeyBytes === 16,
      detail: !values.securityKey ? '워커 환경변수 설정 필요' : securityKeyBytes === 16 ? '16바이트 형식 확인' : 'UTF-8 기준 16바이트 확인 필요'
    },
    contract: {
      label: '계약 정보',
      configured: Boolean(values.customerNo && values.approvalNo && values.officeSerial),
      ok: Boolean(values.customerNo && values.approvalNo && values.officeSerial),
      detail: values.customerNo && values.approvalNo && values.officeSerial ? '고객번호·승인번호·접수국 일련번호 설정' : '계약 정보 3개 설정 필요'
    },
    encryption: {
      label: 'SEED-128 암호화',
      configured: true,
      ok: encryption.ok,
      detail: encryption.ok ? 'KISA 표준 벡터 통과' : '암호화 모듈 확인 필요'
    },
    testWrite: {
      label: '테스트 접수 잠금',
      configured: true,
      ok: values.testWritesEnabled,
      detail: values.testWritesEnabled ? '테스트 호출만 허용' : '워커에서 테스트 호출 잠금 해제 필요'
    },
    tracking: {
      label: '배송추적 인증키',
      configured: Boolean(values.trackingApiKey),
      ok: Boolean(values.trackingApiKey),
      detail: values.trackingApiKey ? '고정 IP 서버 전용 설정 완료' : '종추적 인증키 설정 필요'
    }
  };
  const readyForTest = ['fixedIp','apiKey','securityKey','contract','encryption','testWrite'].every(key=>checks[key].ok);
  const readyForTracking = checks.fixedIp.ok && checks.tracking.ok;
  return {
    status: readyForTest ? 'READY_FOR_TEST' : 'SETUP_REQUIRED',
    readyForTest,
    readyForTracking,
    testWritesEnabled: values.testWritesEnabled,
    liveWritesEnabled: values.liveWritesEnabled,
    expectedIp: values.expectedIp,
    checks,
    checkedAt: new Date().toISOString()
  };
}

module.exports = { configured, readiness };
