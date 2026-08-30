'use strict';

const crypto = require('node:crypto');
const text = value => value == null ? '' : String(value).trim();

function packagingInstructions(order = {}) {
  const items = order.items || [];
  const names = items.map(item => text(item.name)).filter(Boolean);
  const joined = names.join(' ');
  const instructions = [];
  if (items.length > 1) instructions.push(`상품 ${items.length}종을 각각 수량 확인`);
  if (/세트|묶음|구성|\d+개입/.test(joined)) instructions.push('세트 구성품 누락 확인');
  if (/사은품|증정|덤/.test(joined)) instructions.push('사은품 동봉 여부 확인');
  if (/티백|차|환|분말/.test(joined)) instructions.push('식품 포장 밀봉과 유통기한 확인');
  if (!instructions.length) instructions.push('상품명과 수량 확인 후 안전 포장');
  return instructions;
}

function shippingCandidateKey(raw = {}) {
  const receiver = raw.receivers?.[0] || raw.receiver || raw.shipping_address || raw.shipping || raw;
  const name = text(receiver.name || receiver.receiver_name || receiver.recipient_name);
  const postcode = text(receiver.zipcode || receiver.zip_code || receiver.post_code || receiver.postcode);
  const address = text(receiver.address1 || receiver.address || receiver.address_full || receiver.base_address);
  const detail = text(receiver.address2 || receiver.address_detail || receiver.detail_address);
  if (!name || !postcode || !address) return '';
  return crypto.createHash('sha256').update([name, postcode, address, detail].map(value => value.replace(/\s+/g, '').toLowerCase()).join('|')).digest('hex');
}

function canShip(order = {}) {
  if (order.cancellationRequested) return { ok:false, reason:'취소·반품 요청을 먼저 확인하세요.' };
  if (order.fulfillment === 'ROCKET_GROWTH') return { ok:false, reason:'로켓그로스 주문은 쿠팡이 출고합니다.' };
  if (!['PAID','PREPARING','READY_TO_SHIP'].includes(order.stage)) return { ok:false, reason:'현재 단계에서는 출고 작업을 할 수 없습니다.' };
  if (order.platform === 'NAVER') return { ok:false, reason:'네이버에서 송장을 발급하므로 허브 출고 선택에서 제외합니다.' };
  return { ok:true, reason:'' };
}

function enrichOrder(order = {}, raw = {}) {
  const eligibility = canShip(order);
  return {
    ...order,
    shippingCandidateKey:shippingCandidateKey(raw),
    packagingInstructions:packagingInstructions(order),
    shippingEligible:eligibility.ok,
    shippingBlockedReason:eligibility.reason
  };
}

function groupCandidates(orders = []) {
  const groups = new Map();
  for (const order of orders) {
    if (!order.shippingCandidateKey || !order.shippingEligible) continue;
    if (!groups.has(order.shippingCandidateKey)) groups.set(order.shippingCandidateKey, []);
    groups.get(order.shippingCandidateKey).push(order);
  }
  return [...groups.values()].filter(group => group.length > 1).map(group => ({
    candidateOnly:true,
    count:group.length,
    orderIds:group.map(order => order.hubOrderId),
    message:'동일 수령인·주소·우편번호로 보이는 주문입니다. 쇼핑몰 제약을 확인한 뒤 따로 합배송을 결정하세요.'
  }));
}

module.exports = { packagingInstructions, shippingCandidateKey, canShip, enrichOrder, groupCandidates };
