'use strict';

const monthlyRevenue=require('./monthly-revenue.js');
const shippingRules=require('./shipping-rules.js');

const PLATFORMS=Object.freeze(['CAFE24','NAVER','COUPANG']);
const number=value=>Number(value||0);
const round=value=>Math.round(number(value));
const upper=value=>String(value||'').toUpperCase();

function sum(rows,key){
  return (rows||[]).reduce((total,row)=>total+number(row?.[key]),0);
}

function hasMeasuredAmount(rows,key){
  return (rows||[]).some(row=>row?.[key]!==null&&row?.[key]!==undefined&&row?.[key]!==''&&Number.isFinite(Number(row[key])));
}

function eligibleOrderIds(ordersBySource={}){
  const rocketGrowthIds=new Set((ordersBySource.COUPANG_RG||[])
    .filter(order=>!monthlyRevenue.isCancelledStatus(order.status))
    .map(order=>String(order.order_id)));
  return {
    CAFE24:new Set((ordersBySource.CAFE24||[])
      .filter(order=>monthlyRevenue.cafe24Revenue(order)>0)
      .map(order=>String(order.order_id))),
    NAVER:new Set((ordersBySource.NAVER||[])
      .filter(order=>!monthlyRevenue.isCancelledStatus(order.status))
      .map(order=>String(order.order_id))),
    COUPANG:new Set((ordersBySource.COUPANG||[])
      .filter(order=>!rocketGrowthIds.has(String(order.order_id))&&!monthlyRevenue.isCancelledStatus(order.status))
      .map(order=>String(order.order_id))),
    COUPANG_RG:rocketGrowthIds
  };
}

function buildMainCashflow({
  revenueTotals={},ordersBySource={},cafe24Items=[],naverItems=[],coupangItems=[],coupangRgItems=[],
  coupangProductItems=[],channelProducts=[],productCosts=[],channelCostSettings=[],channelShippingRules=[],
  naverAdRows=[],coupangAdRows=[],availability={}
}={}){
  const sales=Number.isFinite(Number(revenueTotals.ALL))?round(revenueTotals.ALL):null;
  const available={orders:true,items:true,mappings:true,costs:true,settings:true,shipping:true,ads:true,...availability};
  const ids=eligibleOrderIds(ordersBySource);
  const links=new Map((channelProducts||[])
    .filter(row=>row?.master_product_id&&row?.external_product_id)
    .map(row=>[`${upper(row.platform)}:${String(row.external_product_id)}`,row.master_product_id]));
  const costs=new Map((productCosts||[])
    .filter(row=>number(row?.unit_cost)+number(row?.packaging_cost)+number(row?.other_unit_cost)>0)
    .map(row=>[row.master_product_id,row]));
  const vendorToSeller=new Map((coupangProductItems||[])
    .filter(row=>row?.vendor_item_id)
    .map(row=>[String(row.vendor_item_id),String(row.seller_product_id||'')]));
  let itemRevenue=0;
  let coveredRevenue=0;
  let productCost=0;

  const addItem=(platform,orderSet,item,externalIds,revenueValue)=>{
    if(!orderSet.has(String(item.order_id)))return;
    const quantity=Math.max(0,number(item.quantity));
    const revenue=Math.max(0,number(revenueValue));
    itemRevenue+=revenue;
    const masterId=externalIds.map(value=>links.get(`${platform}:${String(value||'')}`)).find(Boolean);
    const cost=masterId?costs.get(masterId):null;
    if(!cost)return;
    coveredRevenue+=revenue;
    productCost+=(number(cost.unit_cost)+number(cost.packaging_cost)+number(cost.other_unit_cost))*quantity;
  };

  for(const item of cafe24Items||[])addItem('CAFE24',ids.CAFE24,item,[item.external_product_no],item.paid_amount??number(item.unit_price)*number(item.quantity));
  for(const item of naverItems||[])addItem('NAVER',ids.NAVER,item,[item.product_id,item.original_product_id],item.paid_amount??number(item.unit_price)*number(item.quantity));
  for(const item of coupangItems||[])addItem('COUPANG',ids.COUPANG,item,[item.seller_product_id],item.paid_amount??number(item.unit_price)*number(item.quantity));
  for(const item of coupangRgItems||[])addItem('COUPANG',ids.COUPANG_RG,item,[vendorToSeller.get(String(item.vendor_item_id||''))],item.amount);

  const itemEvidenceRate=sales>0?Math.min(100,itemRevenue/sales*100):null;
  const costCoverageRate=itemRevenue>0?Math.min(100,coveredRevenue/itemRevenue*100):null;
  const settings=new Map((channelCostSettings||[]).map(row=>[upper(row.platform),row]));
  const rules=new Map((channelShippingRules||[]).map(row=>[upper(row.platform),row]));
  const configuredPlatforms=PLATFORMS.filter(platform=>number(revenueTotals[platform])>0);
  const feeSettingsReady=available.settings&&configuredPlatforms.every(platform=>{
    const setting=settings.get(platform);
    return Boolean(setting)&&number(setting.commission_rate)+number(setting.payment_fee_rate)>0;
  });
  const shippingSettingsReady=available.settings&&available.shipping&&configuredPlatforms.every(platform=>{
    const setting=settings.get(platform);
    return Boolean(setting)&&number(setting.default_shipping_cost)>0;
  });
  let platformFees=null;
  let shippingCost=null;
  if(feeSettingsReady){
    platformFees=0;
    for(const platform of configuredPlatforms){
      const setting=settings.get(platform)||{};
      platformFees+=number(revenueTotals[platform])*(number(setting.commission_rate)+number(setting.payment_fee_rate));
    }
    platformFees=round(platformFees);
  }
  if(shippingSettingsReady){
    shippingCost=0;
    for(const platform of configuredPlatforms){
      const setting=settings.get(platform)||{};
      const orderCount=platform==='COUPANG'?ids.COUPANG.size+ids.COUPANG_RG.size:ids[platform].size;
      const reserve=shippingRules.calculateShippingReserve({orders:orderCount,rule:rules.get(platform)||{}});
      shippingCost+=orderCount*number(setting.default_shipping_cost)+number(reserve.total_reserve);
    }
    shippingCost=round(shippingCost);
  }

  const naverAdsReady=available.ads&&hasMeasuredAmount(naverAdRows,'cost');
  const coupangAdsReady=available.ads&&hasMeasuredAmount(coupangAdRows,'ad_spend');
  const naverAdSpend=naverAdsReady?round(sum(naverAdRows,'cost')):null;
  const coupangAdSpend=coupangAdsReady?round(sum(coupangAdRows,'ad_spend')):null;
  const adSpend=naverAdsReady&&coupangAdsReady?round(naverAdSpend+coupangAdSpend):null;
  const costReady=available.orders&&available.items&&available.mappings&&available.costs
    &&costCoverageRate!=null&&costCoverageRate>=95&&itemEvidenceRate!=null&&itemEvidenceRate>=95;
  const operatingCost=costReady&&shippingCost!=null?round(productCost+shippingCost):null;
  const feesReady=platformFees!=null;
  const adsReady=adSpend!=null;
  const feesAndAds=feesReady&&adsReady
    ?round(platformFees+adSpend)
    :adsReady?adSpend
    :feesReady?platformFees
    :null;
  const feesAndAdsStatus=feesReady&&adsReady?'READY':feesAndAds!=null?'PARTIAL':'CHECK_REQUIRED';
  const feesAndAdsLabel=feesReady&&adsReady?'수수료·광고':adsReady?'확인된 광고비':feesReady?'확인된 수수료':'수수료·광고';
  const profit=sales!=null&&operatingCost!=null&&feesReady&&adsReady?round(sales-operatingCost-platformFees-adSpend):null;
  const status=profit==null?'CHECK_REQUIRED':'READY';
  const coverageLabel=costCoverageRate==null?'확인 필요':`${costCoverageRate.toFixed(1)}%`;
  const missingEvidence=[
    !costReady?`원가 반영률 ${coverageLabel}`:null,
    !shippingSettingsReady?'배송비 설정':null,
    !feeSettingsReady?'수수료 설정':null,
    !adsReady?'광고비 수집':null
  ].filter(Boolean).join(' · ');
  const description=status==='READY'
    ?`이번 달 결제 주문과 원가·배송비·수수료·광고비를 자동 계산했어요. 원가 반영률 ${coverageLabel} 기준입니다.`
    :`결제 매출과 확인된 비용은 자동 집계했지만 ${missingEvidence}이 부족해 실제 이익은 “확인 필요”로 보호했어요.`;

  return Object.freeze({
    status,description,sales,
    productCost:costReady?round(productCost):null,
    shippingCost:shippingCost==null?null:round(shippingCost),
    platformFees,adSpend,
    adSpendByPlatform:Object.freeze({ALL:adSpend,NAVER:naverAdSpend,CAFE24:adSpend==null?null:0,COUPANG:coupangAdSpend}),
    operatingCost,feesAndAds,feesAndAdsStatus,feesAndAdsLabel,profit,
    costCoverageRate:costCoverageRate==null?null:Number(costCoverageRate.toFixed(1)),
    itemEvidenceRate:itemEvidenceRate==null?null:Number(itemEvidenceRate.toFixed(1))
  });
}

module.exports={buildMainCashflow};
