'use strict';

const CAFE24_STOREFRONT_ORDER_PLACES=new Set([
  '',
  'SELF',
  'MOBILE',
  'MOBILE_D',
  'CAFE24',
  'NCHECKOUT'
]);

const MARKETPLACE_LABELS=new Map([
  ['SK11ST','11번가'],
  ['GMARKET','G마켓'],
  ['AUCTION','옥션']
]);

const text=value=>String(value==null?'':value).trim();
const upper=value=>text(value).toUpperCase();

function rawOrder(order={}){
  return order?.raw_data&&typeof order.raw_data==='object'?order.raw_data:order;
}

function orderPlaceId(order={}){
  const raw=rawOrder(order);
  return upper(
    raw.order_place_id||order.order_place_id||
    raw.market_id||order.market_id||
    raw.market_code||order.market_code
  );
}

function isNaverPayCheckout(order={}){
  return orderPlaceId(order)==='NCHECKOUT';
}

function isCafe24StorefrontOrder(order={}){
  return CAFE24_STOREFRONT_ORDER_PLACES.has(orderPlaceId(order));
}

function cafe24OrderChannelLabel(order={}){
  return MARKETPLACE_LABELS.get(orderPlaceId(order))||(isNaverPayCheckout(order)?'Cafe24 · 네이버페이':'Cafe24');
}

function cafe24Marketplace(order={}){
  const origin=orderPlaceId(order);
  return MARKETPLACE_LABELS.has(origin)?origin:null;
}

module.exports={
  CAFE24_STOREFRONT_ORDER_PLACES,
  cafe24OrderChannelLabel,
  cafe24Marketplace,
  isCafe24StorefrontOrder,
  isNaverPayCheckout,
  orderPlaceId
};
