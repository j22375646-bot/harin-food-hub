'use strict';

const INACTIVE_ITEM_STATUSES = new Set([
  'STOPPED',
  'SUSPENDED',
  'DELETED',
  'INACTIVE',
  'DISABLED',
  'ENDED',
  'SALE_STOPPED',
  '판매중지',
  '판매중단',
  '판매종료'
]);

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusOf(item = {}) {
  return String(item.productItem?.status || item.item_status || '').trim().toUpperCase();
}

function exclusionReason(item = {}) {
  if (number(item.sales_last_30_days) <= 0) return 'NO_RECENT_SALES';
  if (INACTIVE_ITEM_STATUSES.has(statusOf(item))) return 'INACTIVE_PRODUCT';
  return null;
}

function splitOperationalInventory(items = []) {
  const active = [];
  const excluded = [];
  for (const item of items || []) {
    const reason = exclusionReason(item);
    if (reason) excluded.push({ ...item, operational_exclusion_reason:reason });
    else active.push(item);
  }
  return { active, excluded };
}

function isRisk(item = {}) {
  return ['OUT_OF_STOCK', 'CRITICAL', 'LOW'].includes(String(item.stock_status || '').toUpperCase());
}

function buildOperationalInventoryCenter(items = []) {
  const { active, excluded } = splitOperationalInventory(items);
  const centerItems = active.map(item => {
    const stockStatus = String(item.stock_status || '').toUpperCase();
    const actionRequired = isRisk(item);
    const productName = item.productItem?.item_name || item.external_sku_id || `SKU ${item.vendor_item_id || '-'}`;
    return {
      master_product_id:`COUPANG_RG:${item.vendor_item_id || item.external_sku_id || productName}`,
      name:productName,
      action_required:actionRequired,
      priority:stockStatus === 'OUT_OF_STOCK' ? 0 : actionRequired ? 1 : 3,
      issues:actionRequired ? [{
        code:stockStatus,
        label:stockStatus === 'OUT_OF_STOCK' ? '판매가능 재고 없음' : '재입고 확인',
        platform:'COUPANG'
      }] : [],
      source:item
    };
  });
  return {
    scope:'COUPANG_ROCKET_GROWTH_ACTIVE',
    items:centerItems,
    excluded_count:excluded.length,
    summary:{
      products:active.length,
      action_required:centerItems.filter(item => item.action_required).length,
      out_of_stock:active.filter(item => String(item.stock_status || '').toUpperCase() === 'OUT_OF_STOCK').length,
      low_stock:active.filter(item => ['CRITICAL', 'LOW'].includes(String(item.stock_status || '').toUpperCase())).length
    }
  };
}

module.exports = {
  INACTIVE_ITEM_STATUSES,
  exclusionReason,
  splitOperationalInventory,
  buildOperationalInventoryCenter
};
