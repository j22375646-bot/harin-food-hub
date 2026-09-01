'use strict';

const map = require('./mappers.js');

const text = value => String(value == null ? '' : value).trim();
const dateOnly = value => text(value).slice(0,10);
const numberOrNull = value => map.number(value);

function mapDailySales(payload, { shopNo = 1 } = {}) {
  return map.rows(payload).map(row => {
    const paymentAmount=numberOrNull(row.payment_amount);
    const refundAmount=numberOrNull(row.refund_amount);
    const salesCount=numberOrNull(row.sales_count);
    return {
      date:dateOnly(row.date || row.collection_date),
      shop_no:Number(shopNo)||1,
      payment_amount:paymentAmount,
      refund_amount:refundAmount,
      sales_count:salesCount,
      source_status:dateOnly(row.date || row.collection_date) && paymentAmount!=null && refundAmount!=null && salesCount!=null ? 'OK' : 'PARTIAL',
      raw_data:row
    };
  }).filter(row=>row.date);
}

function baseAttribution(row, { shopNo, period, dimensionType }) {
  const ad=text(row.ad || row.media || row.source || '알 수 없는 광고매체');
  const keyword=dimensionType==='KEYWORD' ? text(row.keyword) : '';
  const metrics={
    visit_count:numberOrNull(row.visit_count),
    order_count:numberOrNull(row.order_count ?? row.purchase_count),
    revenue:numberOrNull(row.order_amount ?? row.revenue),
    join_count:numberOrNull(row.join_count),
    purchase_rate:numberOrNull(row.purchase_rate)
  };
  return {
    period_start:dateOnly(period?.start_date),
    period_end:dateOnly(period?.end_date),
    shop_no:Number(shopNo)||1,
    dimension_type:dimensionType,
    ad,
    keyword:keyword || null,
    keyword_key:keyword,
    ...metrics,
    ad_spend:null,
    source_status:Object.values(metrics).some(value=>value!=null)?'OK':'PARTIAL',
    raw_data:row
  };
}

function mapAdAttribution({ adDetails, adKeywordSales, adSales, adVisits } = {}, { shopNo = 1, period = {} } = {}) {
  const mediaVisits=new Map(map.rows(adVisits).map(row=>[text(row.ad || row.media || row.source),row]));
  const media=map.rows(adSales).map(row=>{
    const visitRow=mediaVisits.get(text(row.ad || row.media || row.source)) || {};
    return baseAttribution({...visitRow,...row,visit_count:visitRow.visit_count ?? row.visit_count},{shopNo,period,dimensionType:'MEDIA'});
  });
  const mediaKeys=new Set(media.map(row=>row.ad));
  for(const row of map.rows(adVisits)){
    const ad=text(row.ad || row.media || row.source);
    if(!mediaKeys.has(ad))media.push(baseAttribution(row,{shopNo,period,dimensionType:'MEDIA'}));
  }

  const keywordByKey=new Map();
  for(const row of [...map.rows(adKeywordSales),...map.rows(adDetails)]){
    const mapped=baseAttribution(row,{shopNo,period,dimensionType:'KEYWORD'});
    const key=`${mapped.ad}\u0000${mapped.keyword_key}`;
    const previous=keywordByKey.get(key);
    keywordByKey.set(key,previous?{
      ...previous,...mapped,
      visit_count:mapped.visit_count ?? previous.visit_count,
      order_count:mapped.order_count ?? previous.order_count,
      revenue:mapped.revenue ?? previous.revenue,
      purchase_rate:mapped.purchase_rate ?? previous.purchase_rate,
      raw_data:{adKeywordSales:previous.raw_data,adDetails:mapped.raw_data}
    }:mapped);
  }
  return [...media,...keywordByKey.values()].filter(row=>row.period_start&&row.period_end&&row.ad);
}

module.exports={mapDailySales,mapAdAttribution};
