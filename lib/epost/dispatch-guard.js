'use strict';

// Recheck saved order state at dispatch time, not only when the job was queued.
// This does not replace the carrier's duplicate-request reconciliation.
function assertCurrentShippingOrder(center, queued, targetId) {
  const reject=()=>{throw Object.assign(new Error('발급 직전 주문 상태를 확인하지 못했거나 주문이 변경되었습니다. 주문과 송장 이력을 다시 확인하세요.'),{code:'EPOST_ORDER_RECHECK_REQUIRED',status:409});};
  if(typeof targetId!=='string'||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(targetId)||queued?.hubOrderId!==targetId) reject();
  const matches=Array.isArray(center?.orders)?center.orders.filter(order=>order.hubOrderId===targetId):[];
  if(matches.length!==1) reject();
  const current=matches[0];
  const channel=center?.channels?.find(channel=>channel.platform===current.platform);
  if(!['CAFE24','COUPANG'].includes(current.platform)||channel?.status!=='READY'
    ||current.platform!==queued.platform||!current.externalOrderId||current.externalOrderId!==queued.externalOrderId
    ||(current.shipmentId||'')!==(queued.shipmentId||'')
    ||current.fulfillment!=='SELLER'||current.cancelled!==false||current.cancellationRequested!==false
    ||!['PAID','PREPARING','READY_TO_SHIP'].includes(current.stage)||current.shippingEligible!==true
    ||current.shippingHistoryStatus!=='READY'||current.invoiceNumber!==''||current.issuedInvoiceNumber!=='') reject();
  return current;
}

module.exports={assertCurrentShippingOrder};
