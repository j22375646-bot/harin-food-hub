function number(value) {
  return Number(value || 0);
}

function classifyInventory({ quantity, sales30, daysOfStock }) {
  if (quantity <= 0 && sales30 > 0) return { code: 'RESTOCK_URGENT', label: '재입고 최우선', action: '광고 일시 제한', tone: 'danger' };
  if (quantity <= 0) return { code: 'OUT_OF_STOCK', label: '판매 재개 검토', action: '수요 확인 후 재입고', tone: 'muted' };
  if (sales30 <= 0) return { code: 'DISCOVERY', label: '노출 개선 필요', action: '검색어·상세페이지 점검', tone: 'purple' };
  if (daysOfStock != null && daysOfStock < 14) return { code: 'RESTOCK', label: '재입고 우선', action: '광고 확대 보류', tone: 'danger' };
  if (daysOfStock != null && daysOfStock <= 30) return { code: 'MAINTAIN', label: '판매 유지', action: '리타겟팅·세트판매', tone: 'good' };
  if (daysOfStock != null && daysOfStock > 60) return { code: 'PROMOTION', label: '재고 소진 필요', action: '쿠폰·묶음판매 후보', tone: 'warning' };
  return { code: 'HEALTHY', label: '안정 운영', action: '광고 유지·리뷰 강화', tone: 'blue' };
}

function buildInventoryMarketing(items = []) {
  const enriched = items.map(item => {
    const quantity = number(item.total_orderable_quantity);
    const sales30 = number(item.sales_last_30_days);
    const price = number(item.productItem?.sale_price);
    const dailySales = sales30 / 30;
    const daysOfStock = item.days_of_stock == null
      ? (dailySales > 0 ? quantity / dailySales : null)
      : number(item.days_of_stock);
    const forecast7dUnits = Math.min(quantity, dailySales * 7);
    const status = classifyInventory({ quantity, sales30, daysOfStock });
    return {
      ...item,
      days_of_stock: daysOfStock,
      inventoryMarketing: {
        ...status,
        price,
        dailySales,
        salesValue30d: sales30 * price,
        inventoryRetailValue: quantity * price,
        forecast7dUnits,
        forecast7dRevenue: forecast7dUnits * price
      }
    };
  });

  const available = enriched.filter(item => number(item.total_orderable_quantity) > 0);
  const totalSalesValue30d = available.reduce((sum, item) => sum + item.inventoryMarketing.salesValue30d, 0);
  const totalInventoryRetailValue = available.reduce((sum, item) => sum + item.inventoryMarketing.inventoryRetailValue, 0);
  const forecast7dRevenue = available.reduce((sum, item) => sum + item.inventoryMarketing.forecast7dRevenue, 0);
  const bySalesValue = [...available].sort((a, b) => b.inventoryMarketing.salesValue30d - a.inventoryMarketing.salesValue30d);
  const heroSku = bySalesValue[0] || null;
  const restockSku = bySalesValue.find(item => ['RESTOCK', 'RESTOCK_URGENT'].includes(item.inventoryMarketing.code)) || null;
  const promotionSku = [...available]
    .filter(item => ['PROMOTION', 'DISCOVERY'].includes(item.inventoryMarketing.code))
    .sort((a, b) => b.inventoryMarketing.inventoryRetailValue - a.inventoryMarketing.inventoryRetailValue)[0] || null;
  const safeAdSku = bySalesValue.find(item => ['HEALTHY', 'MAINTAIN'].includes(item.inventoryMarketing.code)) || null;

  return {
    items: enriched,
    summary: {
      totalSalesValue30d,
      totalInventoryRetailValue,
      forecast7dRevenue,
      heroShare: totalSalesValue30d && heroSku ? heroSku.inventoryMarketing.salesValue30d / totalSalesValue30d * 100 : 0,
      actionCounts: enriched.reduce((result, item) => {
        const code = item.inventoryMarketing.code;
        result[code] = (result[code] || 0) + 1;
        return result;
      }, {}),
      heroSku,
      restockSku,
      promotionSku,
      safeAdSku
    }
  };
}

module.exports = { buildInventoryMarketing, classifyInventory };
