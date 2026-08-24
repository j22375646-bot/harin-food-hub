'use strict';

const WIDE_VIEWS=new Set([
  'orders',
  'cs',
  'inventory',
  'settlement',
  'collection',
  'keyword',
  'product',
  'market',
  'changes',
  'notifications'
]);

function resolveCanvasProfile(input={}){
  const view=String(input?.view||'').trim().toLowerCase();
  return WIDE_VIEWS.has(view)?'wide':'balanced';
}

module.exports={ resolveCanvasProfile };
