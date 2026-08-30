'use strict';

const finite=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const rounded=value=>value==null?null:Math.round(Number(value));
const sum=(rows,key)=>rows.reduce((total,item)=>total+(finite(item?.[key])||0),0);
const status=value=>value==null?'NO_DATA':'READY';

function productAnalysisReportType(productId){
  const safe=String(productId||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,60);
  return `PRODUCT_ANALYSIS_${safe||'PRODUCT'}`;
}

function evidence(statusValue,label,detail,asOf=null,href=null){return {status:statusValue,label,detail,as_of:asOf,href};}

function productAnalysisSourceLinks(productId,marketProjectId=''){
  const safeProduct=encodeURIComponent(String(productId||''));
  const safeProject=encodeURIComponent(String(marketProjectId||''));
  const projectBase=safeProject?`/market-intelligence/${safeProject}`:`/market-intelligence?master_product_id=${safeProduct}`;
  return Object.freeze({
    sales:`/products/mappings?product=${safeProduct}`,
    profit:`/products/costs?master_product_id=${safeProduct}`,
    search:`/keywords/registered?platform=naver&product=${safeProduct}`,
    competition:safeProject?`${projectBase}/competition`:projectBase,
    audience:safeProject?`${projectBase}/market`:projectBase,
    reviews:safeProject?`${projectBase}/competition`:projectBase
  });
}

function buildCustomerPurchaseEvidence({orders=[],productOrderIds=[]}={}){
  const matchedIds=new Set((productOrderIds||[]).map(value=>String(value||'').trim()).filter(Boolean));
  const customerOrders=new Map();
  for(const order of orders||[]){
    const orderId=String(order?.order_id||'').trim();
    if(!matchedIds.has(orderId))continue;
    const customerId=String(order?.customer_id||'').trim();
    if(!customerId)continue;
    if(!customerOrders.has(customerId))customerOrders.set(customerId,new Set());
    customerOrders.get(customerId).add(orderId);
  }
  return {
    order_count:matchedIds.size,
    identified_customers:customerOrders.size,
    repeat_customers:[...customerOrders.values()].filter(orderIds=>orderIds.size>1).length
  };
}

function buildProductAnalysisSummary({product={},performance={},keywords=[],customerEvidence={},marketEvidence={},periodDays=30,periodStart=null,periodEnd=null,generatedAt=new Date().toISOString()}={}){
  const channels=performance.channels||{};
  const keywordRows=(keywords||[]).map(item=>({
    keyword:String(item.keyword||'').trim()||'키워드 확인 필요',impressions:rounded(finite(item.impressions)),clicks:rounded(finite(item.clicks)),
    cost:rounded(finite(item.cost)),orders:rounded(finite(item.conversions)),revenue:rounded(finite(item.conversion_revenue)),
    ctr:finite(item.impressions)>0?Number(((finite(item.clicks)||0)/finite(item.impressions)*100).toFixed(2)):null,
    roas:finite(item.cost)>0?Number(((finite(item.conversion_revenue)||0)/finite(item.cost)*100).toFixed(1)):null
  })).sort((left,right)=>(right.impressions||0)-(left.impressions||0)).slice(0,12);
  const searchDemand=keywordRows.length?sum(keywordRows,'impressions'):finite(channels.NAVER?.impressions);
  const searchClicks=keywordRows.length?sum(keywordRows,'clicks'):finite(channels.NAVER?.clicks);
  const revenue=finite(performance.revenue),orders=finite(performance.orders),units=finite(performance.units);
  const contribution=finite(performance.contribution_profit),margin=finite(performance.contribution_margin_rate);
  const metrics={
    revenue:rounded(revenue),orders:rounded(orders),units:rounded(units),order_value:orders>0?rounded(revenue/orders):null,
    contribution_profit:rounded(contribution),contribution_margin_rate:margin==null?null:Number(margin.toFixed(2)),
    roas:finite(performance.roas),search_demand:rounded(searchDemand),search_clicks:rounded(searchClicks),
    click_rate:searchDemand>0?Number(((searchClicks||0)/searchDemand*100).toFixed(2)):null,
    ad_spend:rounded(finite(performance.ad_spend))
  };
  const channelRows=Object.fromEntries(['CAFE24','NAVER','COUPANG'].map(platform=>[platform,{
    revenue:rounded(finite(channels[platform]?.revenue)),orders:rounded(finite(channels[platform]?.orders)),units:rounded(finite(channels[platform]?.units)),
    impressions:rounded(finite(channels[platform]?.impressions)),clicks:rounded(finite(channels[platform]?.clicks)),ad_spend:rounded(finite(channels[platform]?.ad_spend))
  }]));
  const customer={
    order_count:Math.max(0,rounded(finite(customerEvidence.order_count))||0),
    identified_customers:Math.max(0,rounded(finite(customerEvidence.identified_customers))||0),
    repeat_customers:Math.max(0,rounded(finite(customerEvidence.repeat_customers))||0)
  };
  const market={
    project_id:String(marketEvidence.project_id||''),
    verified_competitors:Math.max(0,rounded(finite(marketEvidence.verified_competitors))||0),
    competitor_price_samples:Math.max(0,rounded(finite(marketEvidence.competitor_price_samples))||0),
    verified_personas:Math.max(0,rounded(finite(marketEvidence.verified_personas))||0),
    verified_review_sets:Math.max(0,rounded(finite(marketEvidence.verified_review_sets))||0),
    review_sample_size:Math.max(0,rounded(finite(marketEvidence.review_sample_size))||0),
    as_of:marketEvidence.as_of||null
  };
  const sourceLinks=productAnalysisSourceLinks(product.id,market.project_id);
  const competitionStatus=market.competitor_price_samples>0?'READY':market.verified_competitors>0?'CHECK_REQUIRED':'SETUP_REQUIRED';
  const audienceStatus=customer.identified_customers>0||market.verified_personas>0?'READY':'SETUP_REQUIRED';
  const reviewsStatus=market.verified_review_sets>0&&market.review_sample_size>0?'READY':'SETUP_REQUIRED';
  const sources={
    sales:evidence(status(metrics.revenue),'채널 판매 실적',metrics.revenue==null?'선택 기간 판매 자료 없음':'주문·상품 매칭 실제값',generatedAt,sourceLinks.sales),
    profit:evidence(performance.cost_status==='CALCULATED'?'CALCULATED':'CHECK_REQUIRED','원가·공헌이익',performance.cost_status==='CALCULATED'?'원가 장부 계산 완료':'상품 원가 확인 필요',generatedAt,sourceLinks.profit),
    search:evidence(status(metrics.search_demand),'네이버 검색광고',metrics.search_demand==null?'연결된 상품 키워드 자료 없음':'상품 연결 키워드 실제 집계',generatedAt,sourceLinks.search),
    competition:evidence(competitionStatus,'경쟁 상품 가격',competitionStatus==='READY'?`검증 경쟁상품 ${market.verified_competitors}개 · 가격 표본 ${market.competitor_price_samples}개`:competitionStatus==='CHECK_REQUIRED'?`검증 경쟁상품 ${market.verified_competitors}개 · 가격 근거 확인 필요`:'상품개발의 검증 경쟁상품 근거 연결 필요',market.as_of,sourceLinks.competition),
    audience:evidence(audienceStatus,'고객 구성',customer.identified_customers>0?`Cafe24 구매고객 ${customer.identified_customers}명 · 재구매 ${customer.repeat_customers}명`:market.verified_personas>0?`검증 고객상 ${market.verified_personas}개 연결`:'구매 고객 집계 또는 검증 고객상 연결 필요',market.as_of||generatedAt,sourceLinks.audience),
    reviews:evidence(reviewsStatus,'검증 리뷰',reviewsStatus==='READY'?`검증 리뷰 ${market.verified_review_sets}묶음 · 표본 ${market.review_sample_size}건`:'상품개발의 검증 리뷰 Evidence 연결 필요',market.as_of,sourceLinks.reviews)
  };
  const signals=[];
  if(metrics.search_demand!=null)signals.push({tone:'good',title:'검색 수요 확인',body:`선택 기간에 연결 키워드 노출 ${metrics.search_demand.toLocaleString('ko-KR')}회가 확인됐습니다.`});
  if(metrics.revenue!=null)signals.push({tone:metrics.revenue>0?'good':'hold',title:'판매 실적 확인',body:`선택 기간 매출 ${metrics.revenue.toLocaleString('ko-KR')}원을 확인했습니다.`});
  if(sources.profit.status!=='CALCULATED')signals.push({tone:'hold',title:'이익 판단 보류',body:'상품 원가가 완성되기 전에는 공헌이익을 확정하지 않습니다.'});
  if(sources.competition.status==='SETUP_REQUIRED')signals.push({tone:'hold',title:'경쟁 근거 연결 필요',body:'경쟁 가격·순위는 외부 검색 표본이 연결되기 전까지 추정하지 않습니다.'});
  return {
    kind:'PRODUCT_ANALYSIS',schema_version:'1.1',generated_at:generatedAt,period_days:Number(periodDays),period_start:periodStart,period_end:periodEnd,
    product:{id:String(product.id||''),name:String(product.name||'상품 확인 필요'),sku:String(product.sku||'')},
    metrics,channels:channelRows,keywords:keywordRows,customer,market,sources,signals,
    trust:{status:Object.values(sources).some(item=>!['READY','CALCULATED'].includes(item.status))?'PARTIAL':'READY',unknown_values_are_zero:false,external_market_estimates:false}
  };
}

module.exports={buildCustomerPurchaseEvidence,buildProductAnalysisSummary,productAnalysisReportType,productAnalysisSourceLinks};
