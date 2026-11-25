'use strict';

const normalize = value => String(value ?? '').trim().toUpperCase();
const unpaid = new Set(['F','UNPAID','BEFORE_PAYMENT','PAYMENT_WAITING','N00']);
const paid = new Set(['T','PAID','PAYMENT_COMPLETE']);

function cafe24Payment(order = {}, itemStatuses = []) {
  const raw = order.raw_data || order;
  const methods = [raw.payment_method, raw.payment_method_code, order.payment_method]
    .flat().map(normalize);
  const paymentMethod = methods.includes('CASH') ? 'BANK_DEPOSIT' : null;
  const statuses = [raw.paid, raw.payment_status, raw.order_status, order.payment_status, ...itemStatuses].map(normalize);
  const paymentState = statuses.some(status => unpaid.has(status)) ? 'UNPAID'
    : statuses.some(status => paid.has(status)) ? 'PAID' : 'UNKNOWN';
  return { paymentMethod, paymentState };
}

function paymentShippingBlock(order = {}) {
  if (order.paymentState === 'UNPAID' || order.stage === 'PAYMENT_PENDING') {
    return '입금 전 주문입니다. 카페24에서 결제를 확인한 뒤 송장을 발급하세요.';
  }
  if (order.stage === 'PAYMENT_CHECK_REQUIRED' || (order.paymentMethod === 'BANK_DEPOSIT' && order.paymentState !== 'PAID')) {
    return '무통장입금 주문의 입금 상태를 확인하지 못했습니다. 카페24 주문을 다시 확인하세요.';
  }
  return '';
}

async function verifyCafe24Payment(order, read) {
  const { payload } = await read(`/orders/${encodeURIComponent(order.externalOrderId)}`, { fields:'order_id,paid,payment_method' })
    .catch(() => { throw Object.assign(new Error('카페24에서 최신 입금 상태를 조회하지 못했습니다. 잠시 후 다시 시도하세요.'), {status:503}); });
  if (payload?.order?.order_id !== order.externalOrderId) {
    throw Object.assign(new Error('카페24에서 주문의 입금 상태를 확인하지 못했습니다.'), {status:409});
  }
  const payment = cafe24Payment(payload.order);
  const reason = paymentShippingBlock({...payment, paymentMethod:payment.paymentMethod || order.paymentMethod});
  if (reason) throw Object.assign(new Error(reason), {status:409});
  if (payment.paymentState !== 'PAID') {
    throw Object.assign(new Error('카페24에서 결제완료를 확인한 뒤 송장을 처리할 수 있습니다.'), {status:409});
  }
}

module.exports = { cafe24Payment, paymentShippingBlock, verifyCafe24Payment };
