'use strict';

const ALERT_ACTIONS=new Set(['SNOOZE','ACKNOWLEDGE','RESOLVE','REOPEN']);

function alertSupportsAction(alert={},action='') {
  const normalized=String(action||'').toUpperCase();
  const status=String(alert.status||'OPEN').toUpperCase();
  if(!ALERT_ACTIONS.has(normalized))return false;
  if(normalized==='REOPEN')return status==='RESOLVED';
  if(normalized==='ACKNOWLEDGE'||normalized==='SNOOZE')return status==='OPEN';
  return status!=='RESOLVED';
}

function buildAlertBulkPlan(alerts=[],selectedIds=[],action='') {
  const selected=new Set((selectedIds||[]).map(String));
  const chosen=(Array.isArray(alerts)?alerts:[]).filter(alert=>selected.has(String(alert.id)));
  return {
    eligible:chosen.filter(alert=>alertSupportsAction(alert,action)),
    skipped:chosen.filter(alert=>!alertSupportsAction(alert,action))
  };
}

function replenishmentTarget(item={},targetDays=30) {
  const quantity=Math.max(0,Number(item.total_orderable_quantity)||0);
  const daily=Number(item.average_daily_sales)||(Number(item.sales_last_30_days)||0)/30;
  return daily>0?Math.max(0,Math.ceil(daily*Math.max(1,Number(targetDays)||30)-quantity)):null;
}

function replenishmentRows(items=[],targetDays=30) {
  return (Array.isArray(items)?items:[]).map(item=>({
    vendorItemId:String(item.vendor_item_id||''),
    sku:String(item.external_sku_id||item.vendor_item_id||''),
    productName:String(item?.productItem?.item_name||item.external_sku_id||`SKU ${item.vendor_item_id||'-'}`),
    orderableQuantity:Math.max(0,Number(item.total_orderable_quantity)||0),
    salesLast30Days:Math.max(0,Number(item.sales_last_30_days)||0),
    averageDailySales:Number(item.average_daily_sales)||(Number(item.sales_last_30_days)||0)/30,
    targetDays:Math.max(1,Number(targetDays)||30),
    recommendedQuantity:replenishmentTarget(item,targetDays),
    source:'쿠팡 로켓그로스'
  }));
}

function csvCell(value) {
  const text=String(value??'');
  return /[\",\r\n]/.test(text)?`\"${text.replaceAll('\"','\"\"')}\"`:text;
}

function replenishmentRowsToCsv(rows=[]) {
  const header=['상품명','SKU','쿠팡 상품번호','판매가능 재고','최근 30일 판매','하루 평균 판매','목표 보유일','추천 입고량','자료 출처'];
  const body=rows.map(row=>[
    row.productName,row.sku,row.vendorItemId,row.orderableQuantity,row.salesLast30Days,
    row.averageDailySales.toFixed(1),row.targetDays,row.recommendedQuantity==null?'판단 보류':row.recommendedQuantity,row.source
  ]);
  return [header,...body].map(columns=>columns.map(csvCell).join(',')).join('\r\n');
}

function replenishmentRowsToText(rows=[]) {
  return rows.map((row,index)=>`${index+1}. ${row.productName} · 현재 ${row.orderableQuantity}개 · ${row.targetDays}일 목표 ${row.recommendedQuantity==null?'판단 보류':`${row.recommendedQuantity}개 입고 검토`}`).join('\n');
}

module.exports={alertSupportsAction,buildAlertBulkPlan,replenishmentTarget,replenishmentRows,replenishmentRowsToCsv,replenishmentRowsToText};
