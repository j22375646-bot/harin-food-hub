'use strict';

const text = value => value == null ? '' : String(value).trim();
const digits = value => text(value).replace(/\D/g, '');

function field(value, maxLength) {
  return [...text(value).replace(/[&=\u0000-\u001f]/g, ' ')].slice(0, maxLength).join('').trim();
}

function koreaDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date(value)).replaceAll('-', '');
}

function normalizeReceiver(receiver = {}) {
  return {
    name:field(receiver.name, 40),
    postCode:digits(receiver.postCode).slice(0, 5),
    address:field(receiver.address, 150),
    addressDetail:field(receiver.addressDetail, 300),
    contact:digits(receiver.contact || receiver.safeNumber).slice(0, 12),
    message:field(receiver.message, 200)
  };
}

function validateShipment(input = {}, { testOnly = false } = {}) {
  const receiver = normalizeReceiver(input.receiver);
  const errors = [];
  const platform=text(input.platform).toUpperCase();
  const reference=text(input.hubOrderId);
  const validReference=platform==='COUPANG_RG_INBOUND'
    ? /^RGI-[A-F0-9]{12}$/.test(reference)
    : /^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/.test(reference);
  if (!validReference) errors.push(platform==='COUPANG_RG_INBOUND'?'로켓그로스 입고 출고번호를 확인하세요.':'허브 주문번호를 확인하세요.');
  if (!['CAFE24','COUPANG','NAVER','COUPANG_RG_INBOUND'].includes(platform)) errors.push('지원하지 않는 판매 채널입니다.');
  if (!receiver.name) errors.push('받는 분 이름이 없습니다.');
  if (!/^\d{5}$/.test(receiver.postCode)) errors.push('우편번호는 숫자 5자리여야 합니다.');
  if (!receiver.address) errors.push('기본 주소가 없습니다.');
  if (!receiver.addressDetail) errors.push('상세 주소가 없습니다.');
  if (!/^\d{9,12}$/.test(receiver.contact)) errors.push('수취인 연락처는 숫자 9~12자리여야 합니다.');
  const goodsName = field(input.goodsName, 400);
  if (!goodsName) errors.push('상품명이 없습니다.');
  const quantity = Math.max(1, Math.min(99999, Number.parseInt(input.quantity, 10) || 1));
  const weight = Number.parseInt(input.weight, 10) || 2;
  const volume = Number.parseInt(input.volume, 10) || 60;
  if (weight < 1 || weight > 30) errors.push('포장 무게는 1~30kg 범위여야 합니다.');
  if (volume < 1 || volume > 160) errors.push('포장 크기는 1~160cm 범위여야 합니다.');
  return {
    ok:errors.length === 0, errors, receiver, goodsName, quantity, weight, volume,
    hubOrderId:reference, platform,
    orderNo:field(testOnly ? `TEST-${text(input.hubOrderId)}` : text(input.hubOrderId), 50),
    requestDate:koreaDate(input.asOf),
    deliveryMessage:receiver.message
  };
}

function application(input = {}, config = {}, { testOnly = false } = {}) {
  const shipment = validateShipment(input, { testOnly });
  if (!shipment.ok) throw Object.assign(new Error(shipment.errors.join(' ')), { code:'EPOST_VALIDATION_FAILED', status:400, validationErrors:shipment.errors });
  const fields = [
    ['custNo', field(config.customerNo, 10)],
    ['apprNo', field(config.approvalNo, 10)],
    ['payType', '1'],
    ['reqType', '1'],
    ['officeSer', field(config.officeSerial, 20)],
    ['weight', String(shipment.weight)],
    ['volume', String(shipment.volume)],
    ['microYn', 'N'],
    ['packngMtrCd', '01'],
    ['orderNo', shipment.orderNo],
    ['insuYn', 'N'],
    ['ordCompNm', field(`하린식품 ${{ COUPANG:'쿠팡', CAFE24:'Cafe24', NAVER:'네이버', COUPANG_RG_INBOUND:'로켓그로스 입고' }[shipment.platform]}`, 100)],
    ['recNm', shipment.receiver.name],
    ['recZip', shipment.receiver.postCode],
    ['recAddr1', shipment.receiver.address],
    ['recAddr2', shipment.receiver.addressDetail],
    ['recTel', shipment.receiver.contact],
    ['recMob', shipment.receiver.contact],
    ['contCd', '021'],
    ['goodsNm', shipment.goodsName],
    ['qty', String(shipment.quantity)],
    ['delivMsg', shipment.deliveryMessage],
    ['smsOrdCd', '1'],
    ['printYn', 'N'],
    ['printAreaCdYn', 'Y'],
    ['testYn', testOnly ? 'Y' : 'N']
  ].filter(([, value]) => value !== '');
  return { shipment, fields, plainText:fields.map(([key, value]) => `${key}=${value}`).join('&') };
}

function validateTestShipment(input = {}) {
  return validateShipment(input, { testOnly:true });
}

function testApplication(input = {}, config = {}) {
  return application(input, config, { testOnly:true });
}

function liveApplication(input = {}, config = {}) {
  return application(input, config, { testOnly:false });
}

module.exports = { application, field, koreaDate, liveApplication, normalizeReceiver, testApplication, validateShipment, validateTestShipment };
