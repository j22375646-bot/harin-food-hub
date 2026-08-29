'use strict';

const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const numberOrNull=value=>hasNumber(value)?Number(value):null;
const text=value=>String(value==null?'':value).trim();
const frozenRows=items=>Object.freeze(items.map(item=>Object.freeze(item)));

function compactLot(lot={}){
  return Object.freeze({
    id:text(lot.id),
    lotCode:text(lot.lot_code),
    receivedOn:lot.received_on||null,
    manufacturedOn:lot.manufactured_on||null,
    expiresOn:lot.expires_on||null,
    quantity:numberOrNull(lot.quantity),
    status:text(lot.status||'ACTIVE').toUpperCase(),
    notes:text(lot.notes)
  });
}

function holdingState(days){
  if(days==null)return Object.freeze({status:'CHECK_REQUIRED',tone:'muted',label:'확인 필요'});
  if(days<7)return Object.freeze({status:'URGENT',tone:'danger',label:`${Math.max(0,days).toFixed(days%1?1:0)}일`});
  if(days<14)return Object.freeze({status:'WATCH',tone:'warning',label:`${days.toFixed(days%1?1:0)}일`});
  if(days>60)return Object.freeze({status:'LONG',tone:'purple',label:`${days.toFixed(days%1?1:0)}일`});
  return Object.freeze({status:'STABLE',tone:'good',label:`${days.toFixed(days%1?1:0)}일`});
}

function buildPhase28InventoryModel(data={}){
  const coupang=data.coupang||{};
  const source=Array.isArray(coupang.rgInventory)?coupang.rgInventory:[];
  const lots=Array.isArray(coupang.inventoryLots)?coupang.inventoryLots:[];
  const lotsByVendor=new Map();
  for(const lot of lots){
    const key=text(lot.vendor_item_id);
    const current=lotsByVendor.get(key)||[];
    current.push(compactLot(lot));
    lotsByVendor.set(key,current);
  }
  const rows=frozenRows(source.map(item=>{
    const days=numberOrNull(item.days_of_stock);
    const holding=holdingState(days);
    const marketing=item.inventoryMarketing||{};
    return {
      id:text(item.vendor_item_id||item.external_sku_id),
      vendorItemId:text(item.vendor_item_id),
      sku:text(item.external_sku_id||item.vendor_item_id),
      name:text(item.productItem?.item_name||item.external_sku_id)||'상품 정보 확인 필요',
      price:numberOrNull(item.productItem?.sale_price),
      orderableQuantity:numberOrNull(item.total_orderable_quantity),
      salesLast30Days:numberOrNull(item.sales_last_30_days),
      averageDailySales:numberOrNull(item.average_daily_sales),
      daysOfStock:days,
      holdingStatus:holding.status,
      holdingTone:holding.tone,
      holdingLabel:holding.label,
      stockStatus:text(item.stock_status||'CHECK_REQUIRED').toUpperCase(),
      snapshotAt:item.snapshot_at||null,
      actionCode:text(marketing.code||item.stock_status||'CHECK_REQUIRED').toUpperCase(),
      actionLabel:text(marketing.label)||'재고 상태 확인',
      nextAction:text(marketing.action)||'수집 상태 확인',
      actionTone:text(marketing.tone||holding.tone),
      lots:Object.freeze((lotsByVendor.get(text(item.vendor_item_id))||[]).sort((a,b)=>String(a.expiresOn||'9999').localeCompare(String(b.expiresOn||'9999'))))
    };
  }));
  const priority=[...rows]
    .sort((a,b)=>{
      const aUrgent=['OUT_OF_STOCK','CRITICAL','LOW','URGENT'].includes(a.stockStatus)||a.holdingStatus==='URGENT';
      const bUrgent=['OUT_OF_STOCK','CRITICAL','LOW','URGENT'].includes(b.stockStatus)||b.holdingStatus==='URGENT';
      return Number(bUrgent)-Number(aUrgent)||(a.daysOfStock??Number.POSITIVE_INFINITY)-(b.daysOfStock??Number.POSITIVE_INFINITY);
    })[0]||null;
  const knownDays=rows.map(row=>row.daysOfStock).filter(value=>value!=null);
  const collection=coupang.latestSync||{};
  return Object.freeze({
    kind:'inventory',
    hero:Object.freeze({
      asOf:data.generatedAt||priority?.snapshotAt||null,
      itemCount:rows.length,
      urgentCount:rows.filter(row=>['URGENT','OUT_OF_STOCK','CRITICAL','LOW'].includes(row.holdingStatus)||['OUT_OF_STOCK','CRITICAL','LOW'].includes(row.stockStatus)).length,
      within14Count:rows.filter(row=>row.daysOfStock!=null&&row.daysOfStock<14).length,
      stableCount:rows.filter(row=>row.daysOfStock!=null&&row.daysOfStock>=14&&row.daysOfStock<=60).length,
      longCount:rows.filter(row=>row.daysOfStock!=null&&row.daysOfStock>60).length,
      minDays:knownDays.length?Math.min(...knownDays):null,
      priorityId:priority?.id||null,
      headline:rows.length?`오늘 살펴볼 재고 항목은 ${rows.length.toLocaleString('ko-KR')}건이에요.`:'수집된 판매 가능 재고가 없어요.',
      summary:'판매 흐름과 주문 가능 재고를 함께 보고, 입고가 필요한 순서만 빠르게 정리합니다.'
    }),
    rows,
    lots:frozenRows(lots.map(compactLot)),
    collection:Object.freeze({
      status:text(collection.status||collection.run_status||'CHECK_REQUIRED').toUpperCase(),
      at:collection.finished_at||collection.completed_at||collection.updated_at||collection.created_at||priority?.snapshotAt||null,
      message:text(collection.error_message||collection.message)
    }),
    visibleLimit:50,
    ai:Object.freeze({status:'DISABLED',label:'비활성',cost:0})
  });
}

module.exports={buildPhase28InventoryModel};
