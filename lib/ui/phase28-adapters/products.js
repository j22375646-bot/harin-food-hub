'use strict';

const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const numberOrNull=value=>hasNumber(value)?Number(value):null;
const text=value=>String(value==null?'':value).trim();
const frozenRows=items=>Object.freeze(items.map(item=>Object.freeze(item)));
const PLATFORMS=Object.freeze(['CAFE24','NAVER','COUPANG']);

function safeMapping(data={}){
  const mapping=data.productMapping||{};
  const masterSource=Array.isArray(mapping.masterProducts)&&mapping.masterProducts.length?mapping.masterProducts:(data.masterProducts||[]);
  const masterProducts=frozenRows(masterSource.filter(item=>item?.id&&item.is_active!==false).map(item=>({
    id:text(item.id),name:text(item.name)||'기준 상품 확인 필요',price:numberOrNull(item.selling_price)
  })));
  const candidates=frozenRows((mapping.candidates||[]).filter(item=>['NAVER','COUPANG'].includes(text(item.platform).toUpperCase())).map(item=>({
    platform:text(item.platform).toUpperCase(),
    externalProductId:text(item.external_product_id),
    name:text(item.external_product_name||item.name)||'채널 상품명 확인 필요',
    price:numberOrNull(item.selling_price),
    autoEligible:Boolean(item.auto_eligible),
    suggestions:frozenRows((item.candidates||[]).map(candidate=>({
      masterProductId:text(candidate.master_product_id),
      masterName:text(candidate.master_name)||'기준 상품 확인 필요',
      score:numberOrNull(candidate.score),
      confidence:numberOrNull(candidate.confidence),
      reasons:Object.freeze((candidate.reasons||[]).map(text).filter(Boolean))
    })))
  })));
  const links=frozenRows((mapping.links||[]).filter(item=>['NAVER','COUPANG'].includes(text(item.platform).toUpperCase())).map(item=>({
    platform:text(item.platform).toUpperCase(),
    externalProductId:text(item.external_product_id),
    name:text(item.external_product_name)||'채널 상품명 확인 필요',
    price:numberOrNull(item.selling_price),
    masterProductId:text(item.master_product_id),
    method:text(item.match_method||'MANUAL').toUpperCase(),
    confidence:numberOrNull(item.match_confidence)
  })));
  return Object.freeze({summary:Object.freeze({...mapping.summary}),masterProducts,candidates,links});
}

function safeChannel(channel={}){
  return Object.freeze({
    state:text(channel.state||'MISSING').toUpperCase(),
    label:text(channel.label)||'미연결',
    name:text(channel.name),
    price:numberOrNull(channel.price),
    inventory:numberOrNull(channel.inventory),
    detail:text(channel.detail)||'연결 상태 확인 필요'
  });
}

function safeCost(cost){
  if(!cost)return Object.freeze({status:'CHECK_REQUIRED',unit:null,packaging:null,other:null,total:null});
  const unit=numberOrNull(cost.unit_cost);
  const packaging=numberOrNull(cost.packaging_cost);
  const other=numberOrNull(cost.other_unit_cost);
  const total=(unit||0)+(packaging||0)+(other||0);
  if(total<=0)return Object.freeze({status:'CHECK_REQUIRED',unit,packaging,other,total:null});
  return Object.freeze({status:'READY',unit,packaging,other,total});
}

function buildPhase28ProductsModel(data={}){
  const center=data.productOperations||{};
  const source=Array.isArray(center.items)?center.items:[];
  const costs=new Map((data.productCosts||[]).map(item=>[String(item.master_product_id),item]));
  const masters=new Map((data.masterProducts||[]).map(item=>[String(item.id),item]));
  const performanceItems=data.unifiedProductPerformance?.items||[];
  const performance=new Map(performanceItems.map(item=>[String(item.master_product_id),item]));
  const rows=frozenRows(source.map(item=>{
    const id=text(item.master_product_id);
    const cost=safeCost(costs.get(id));
    const master=masters.get(id)||{};
    const channels=Object.freeze(Object.fromEntries(PLATFORMS.map(platform=>[platform,safeChannel(item.channels?.[platform])])));
    const connected=PLATFORMS.filter(platform=>['ACTIVE','STOPPED','OUT_OF_STOCK'].includes(channels[platform].state)).length;
    const rowPerformance=performance.get(id)||{};
    const ready=cost.status==='READY'&&connected===3&&!item.action_required;
    return {
      id,
      sku:text(master.sku||master.external_sku||id),
      name:text(item.name||master.name)||'기준 상품 확인 필요',
      basePrice:numberOrNull(item.base_price??master.selling_price),
      connectedChannels:connected,
      channels,
      cost,
      performance:Object.freeze({
        revenue:numberOrNull(rowPerformance.revenue),
        orders:numberOrNull(rowPerformance.orders),
        contributionProfit:numberOrNull(rowPerformance.contribution_profit),
        marginRate:numberOrNull(rowPerformance.contribution_margin_rate)
      }),
      issues:frozenRows((item.issues||[]).map(issue=>({code:text(issue.code),level:text(issue.level||'INFO').toUpperCase(),label:text(issue.label)||'확인 필요'}))),
      actionRequired:Boolean(item.action_required),
      priceGapRate:numberOrNull(item.price_gap_rate),
      judgment:Object.freeze({
        status:ready?'READY':'HOLD',
        label:ready?'판매 판단 준비':'판단 보류',
        reason:cost.status!=='READY'?'원가 근거 확인 필요':connected<3?'채널 연결 확인 필요':item.action_required?'상품 조치 확인 필요':'판매 판단 가능'
      })
    };
  }));
  const costReadyCount=rows.filter(row=>row.cost.status==='READY').length;
  const readyCount=rows.filter(row=>row.judgment.status==='READY').length;
  return Object.freeze({
    kind:'products',
    workspace:text(data.loadedWorkspace||'catalog'),
    hero:Object.freeze({
      asOf:data.generatedAt||null,
      itemCount:rows.length,
      actionCount:rows.filter(row=>row.actionRequired).length,
      allConnectedCount:rows.filter(row=>row.connectedChannels===3).length,
      channelLinkCount:rows.reduce((sum,row)=>sum+row.connectedChannels,0),
      costReadyCount,
      readyCount,
      headline:`확인할 상품 작업은 ${rows.filter(row=>row.judgment.status!=='READY').length.toLocaleString('ko-KR')}건이에요.`,
      summary:'기준 상품부터 채널 연결, 원가 신뢰, 판매 판단까지 한 흐름으로 확인합니다.'
    }),
    rows,
    mapping:safeMapping(data),
    summary:Object.freeze({...center.summary}),
    financialTrust:Object.freeze({status:text(data.financialTrust?.status||'CHECK_REQUIRED').toUpperCase(),reasons:Object.freeze([...(data.financialTrust?.reasons||[])].map(text))}),
    visibleLimit:50,
    platforms:PLATFORMS
  });
}

module.exports={buildPhase28ProductsModel};
