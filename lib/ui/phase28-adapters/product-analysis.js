'use strict';

const {productAnalysisSourceLinks}=require('../../analytics/product-analysis-report.js');

const numberOrNull=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const text=value=>String(value==null?'':value).trim();
const frozenRows=items=>Object.freeze(items.map(item=>Object.freeze(item)));
const ready=value=>value!=null?'READY':'NO_DATA';

function source(status,label,detail,asOf=null,href=null){
  return Object.freeze({status,label,detail,asOf,href});
}

function connectedSources(rows={},productId='',projectId=''){
  const links=productAnalysisSourceLinks(productId,projectId);
  const defaults={
    sales:{status:'NO_DATA',label:'판매 실적',detail:'채널 주문·상품 매칭 확인 필요'},
    profit:{status:'CHECK_REQUIRED',label:'원가·공헌이익',detail:'상품 원가 확인 필요'},
    search:{status:'NO_DATA',label:'네이버 검색광고',detail:'상품 연결 검색 근거 없음'},
    competition:{status:'SETUP_REQUIRED',label:'경쟁 상품',detail:'네이버 쇼핑 검색 표본 연결 필요'},
    audience:{status:'SETUP_REQUIRED',label:'고객 구성',detail:'상품별 채널 분석 자료 연결 필요'},
    reviews:{status:'SETUP_REQUIRED',label:'검증 리뷰',detail:'리뷰 Evidence 연결 필요'}
  };
  return Object.freeze(Object.fromEntries(Object.keys(defaults).map(key=>{
    const item=rows[key]||defaults[key];
    return [key,source(item.status||defaults[key].status,item.label||defaults[key].label,item.detail||defaults[key].detail,item.asOf||item.as_of||null,links[key])];
  })));
}

function normalizeSavedReport(report={}){
  const summary=report.summary_json||{};
  const product=summary.product||{};
  const sources=connectedSources(summary.sources||{},product.id,summary.market?.project_id);
  return Object.freeze({
    id:text(report.id),title:text(report.title)||`${text(product.name)||'상품'} 분석`,
    product:Object.freeze({id:text(product.id),name:text(product.name)||'상품 확인 필요',sku:text(product.sku)}),
    periodDays:numberOrNull(summary.period_days),periodStart:report.period_start||summary.period_start||null,
    periodEnd:report.period_end||summary.period_end||null,createdAt:report.created_at||summary.generated_at||null,
    status:text(report.status||'FINAL').toUpperCase(),metrics:Object.freeze(summary.metrics||{}),
    sources,channels:Object.freeze(summary.channels||{}),
    keywords:frozenRows(summary.keywords||[]),signals:frozenRows(summary.signals||[])
  });
}

function buildProduct(row={},master={},performance={},asOf=null){
  const channels=performance.channels||{};
  const naver=channels.NAVER||{};
  const connected=['CAFE24','NAVER','COUPANG'].filter(platform=>['ACTIVE','STOPPED','OUT_OF_STOCK'].includes(text(row.channels?.[platform]?.state).toUpperCase())).length;
  const metrics=Object.freeze({
    price:numberOrNull(master.selling_price),revenue:numberOrNull(performance.revenue),orders:numberOrNull(performance.orders),
    units:numberOrNull(performance.units),contributionProfit:numberOrNull(performance.contribution_profit),
    contributionMarginRate:numberOrNull(performance.contribution_margin_rate),roas:numberOrNull(performance.roas),
    searchDemand:numberOrNull(naver.impressions),searchClicks:numberOrNull(naver.clicks),adSpend:numberOrNull(performance.ad_spend)
  });
  const id=text(row.master_product_id||performance.master_product_id||master.id);
  const links=productAnalysisSourceLinks(id);
  return Object.freeze({
    id,
    name:text(row.name||performance.name||master.name)||'기준 상품 확인 필요',sku:text(master.sku||master.external_sku),
    connectedChannels:connected,metrics,
    channels:Object.freeze(Object.fromEntries(['CAFE24','NAVER','COUPANG'].map(platform=>[platform,Object.freeze({
      revenue:numberOrNull(channels[platform]?.revenue),orders:numberOrNull(channels[platform]?.orders),units:numberOrNull(channels[platform]?.units),
      impressions:numberOrNull(channels[platform]?.impressions),clicks:numberOrNull(channels[platform]?.clicks),adSpend:numberOrNull(channels[platform]?.ad_spend)
    })]))),
    sources:Object.freeze({
      sales:source(ready(metrics.revenue),'판매 실적','채널 주문·상품 매칭 기준',asOf,links.sales),
      profit:source(performance.cost_status==='CALCULATED'?'CALCULATED':'CHECK_REQUIRED','원가·공헌이익',performance.cost_status==='CALCULATED'?'원가 장부 계산 완료':'상품 원가 확인 필요',asOf,links.profit),
      search:source(ready(metrics.searchDemand),'네이버 검색광고',metrics.searchDemand==null?'상품 연결 검색 근거 없음':'노출·클릭 실제 집계',asOf,links.search),
      competition:source('SETUP_REQUIRED','경쟁 상품','네이버 쇼핑 검색 표본 연결 필요',null,links.competition),
      audience:source('SETUP_REQUIRED','고객 구성','상품별 채널 분석 자료 연결 필요',null,links.audience),
      reviews:source('SETUP_REQUIRED','검증 리뷰','리뷰 Evidence 연결 필요',null,links.reviews)
    })
  });
}

function lightweightOperationRows(masters,channelProducts=[]){
  const channelsByProduct=new Map();
  for(const item of channelProducts){
    const id=text(item.master_product_id);
    const platform=text(item.platform).toUpperCase();
    if(!id||!['CAFE24','NAVER','COUPANG'].includes(platform)||item.is_active===false)continue;
    if(!channelsByProduct.has(id))channelsByProduct.set(id,{});
    channelsByProduct.get(id)[platform]={state:'ACTIVE'};
  }
  return [...masters.values()].map(master=>({
    master_product_id:text(master.id),
    name:text(master.name),
    channels:channelsByProduct.get(text(master.id))||{}
  }));
}

function buildPhase28ProductAnalysisModel(data={}){
  const masters=new Map((data.masterProducts||[]).map(item=>[String(item.id),item]));
  const performanceRows=data.unifiedProductPerformance?.items||[];
  const performance=new Map(performanceRows.map(item=>[String(item.master_product_id),item]));
  const suppliedOperations=data.productOperations?.items||[];
  const operationRows=suppliedOperations.length?suppliedOperations:lightweightOperationRows(masters,data.channelProducts||[]);
  const seen=new Set();
  const products=[];
  for(const row of operationRows){
    const id=text(row.master_product_id);if(!id||seen.has(id))continue;seen.add(id);
    products.push(buildProduct(row,masters.get(id)||{},performance.get(id)||{},data.generatedAt||null));
  }
  for(const row of performanceRows){
    const id=text(row.master_product_id);if(!id||seen.has(id))continue;seen.add(id);
    products.push(buildProduct({},masters.get(id)||{},row,data.generatedAt||null));
  }
  const history=frozenRows((data.reports||[])
    .filter(report=>String(report.report_type||'').startsWith('PRODUCT_ANALYSIS_')&&report.summary_json?.kind==='PRODUCT_ANALYSIS')
    .sort((left,right)=>new Date(right.created_at||0)-new Date(left.created_at||0))
    .map(normalizeSavedReport));
  return Object.freeze({
    writePolicy:'GUARDED',generatedAt:data.generatedAt||null,defaultPeriod:30,periodOptions:Object.freeze([30,90,365]),
    products:frozenRows(products),history,activeReportId:history[0]?.id||null,
    hero:Object.freeze({productCount:products.length,savedCount:history.length,summary:'검색 수요, 고객층, 경쟁 가격과 실제 판매 실적을 같은 분석 시점으로 묶어 봅니다.'})
  });
}

module.exports={buildPhase28ProductAnalysisModel,normalizeSavedReport};
