import authModule from '../../../lib/dashboard-auth.js';
import supabaseModule from '../../../lib/cafe24/supabase.js';
import apiSafety from '../../../lib/api/safety.js';
import productPerformance from '../../../lib/products/performance.js';
import reportModule from '../../../lib/analytics/product-analysis-report.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;

const PERIODS=new Set([30,90,365]);
const empty={data:[],error:null};
const values=rows=>[...new Set((rows||[]).map(value=>String(value||'')).filter(Boolean))];
const dateKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const fail=result=>{if(result?.error)throw result.error;return result?.data||[];};

function periodRange(days,now=new Date()){
  const end=dateKey(now);
  const startDate=new Date(`${end}T00:00:00+09:00`);
  startDate.setUTCDate(startDate.getUTCDate()-(days-1));
  return {start:dateKey(startDate),end};
}

async function optionalIn(query,field,items){return items.length?query.in(field,items):empty;}

export async function POST(request){
  const session=await authModule.validateSession(authModule.cookieValue(request)).catch(()=>null);
  if(!session)return apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request);
    const productId=String(body.product_id||'').trim();
    const periodDays=Number(body.period_days);
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(productId))return apiSafety.json({ok:false,error:'분석할 상품을 다시 선택해주세요.'},{status:400});
    if(!PERIODS.has(periodDays))return apiSafety.json({ok:false,error:'분석 기간은 30일·90일·1년 중에서 선택해주세요.'},{status:400});
    const db=supabaseModule.getSupabase();
    const period=periodRange(periodDays);
    const [masterResult,channelResult,costResult,settingResult,ruleResult,marketProjectResult]=await Promise.all([
      db.from('master_products').select('id,name,selling_price,is_active').eq('id',productId).eq('is_active',true).maybeSingle(),
      db.from('channel_products').select('master_product_id,platform,external_product_id,external_product_name,selling_price,is_active,raw_data').eq('master_product_id',productId).eq('is_active',true).limit(100),
      db.from('product_costs').select('master_product_id,unit_cost,packaging_cost,other_unit_cost,effective_from').eq('master_product_id',productId).order('effective_from',{ascending:false}).limit(1),
      db.from('channel_cost_settings').select('platform,commission_rate,payment_fee_rate,default_shipping_cost'),
      db.from('channel_shipping_rules').select('platform,return_shipping_cost,return_rate,remote_area_surcharge,remote_area_rate'),
      db.from('market_projects').select('id,status,updated_at').eq('master_product_id',productId).neq('status','ARCHIVED').order('updated_at',{ascending:false}).limit(1).maybeSingle()
    ]);
    if(masterResult.error)throw masterResult.error;
    if(marketProjectResult.error)throw marketProjectResult.error;
    if(!masterResult.data)return apiSafety.json({ok:false,error:'판매 중인 기준 상품을 찾지 못했습니다.'},{status:404});
    const channelProducts=fail(channelResult);
    const costs=fail(costResult),settings=fail(settingResult),rules=fail(ruleResult);
    const marketProject=marketProjectResult.data||null;
    const cafeIds=values(channelProducts.filter(item=>item.platform==='CAFE24').map(item=>item.external_product_id));
    const sellerIds=values(channelProducts.filter(item=>item.platform==='COUPANG').map(item=>item.external_product_id));
    const [cafeOrdersResult,coupangOrdersResult,rgOrdersResult,productItemsResult,keywordLinksResult]=await Promise.all([
      db.from('cafe24_orders').select('order_id,order_date,customer_id').gte('order_date',period.start).lte('order_date',`${period.end}T23:59:59+09:00`).limit(10000),
      db.from('coupang_orders').select('order_id,ordered_at,paid_at,status').gte('paid_at',`${period.start}T00:00:00+09:00`).lte('paid_at',`${period.end}T23:59:59+09:00`).limit(10000),
      db.from('coupang_rg_orders').select('order_id,paid_at,status').gte('paid_at',`${period.start}T00:00:00+09:00`).lte('paid_at',`${period.end}T23:59:59+09:00`).limit(10000),
      optionalIn(db.from('coupang_product_items').select('vendor_item_id,seller_product_id,item_name,sale_price,status'), 'seller_product_id', sellerIds),
      db.from('naver_keyword_product_links').select('ncc_keyword_id,master_product_id').eq('master_product_id',productId).limit(1000)
    ]);
    const cafeOrders=fail(cafeOrdersResult),coupangOrders=fail(coupangOrdersResult),rgOrders=fail(rgOrdersResult),productItems=fail(productItemsResult);
    const keywordLinks=keywordLinksResult.error?[]:(keywordLinksResult.data||[]);
    const cafeOrderIds=values(cafeOrders.map(item=>item.order_id));
    const coupangOrderIds=values(coupangOrders.map(item=>item.order_id));
    const rgOrderIds=values(rgOrders.map(item=>item.order_id));
    const keywordIds=values(keywordLinks.map(item=>item.ncc_keyword_id));
    const vendorIds=values(productItems.map(item=>item.vendor_item_id));
    const [cafeItemsResult,coupangItemsResult,rgItemsResult,keywordsResult,keywordStatsResult,coupangAdsResult,competitorsResult,personasResult,reviewsResult,competitorReviewsResult]=await Promise.all([
      cafeIds.length&&cafeOrderIds.length?db.from('cafe24_order_items').select('order_id,external_product_no,product_name,quantity,unit_price,paid_amount').in('external_product_no',cafeIds).in('order_id',cafeOrderIds).limit(15000):empty,
      sellerIds.length&&coupangOrderIds.length?db.from('coupang_order_items').select('order_id,seller_product_id,vendor_item_id,product_name,quantity,unit_price,paid_amount').in('seller_product_id',sellerIds).in('order_id',coupangOrderIds).limit(15000):empty,
      vendorIds.length&&rgOrderIds.length?db.from('coupang_rg_order_items').select('order_id,vendor_item_id,product_name,quantity,amount').in('vendor_item_id',vendorIds).in('order_id',rgOrderIds).limit(15000):empty,
      optionalIn(db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id,keyword'), 'ncc_keyword_id', keywordIds),
      keywordIds.length?db.from('naver_keyword_stats').select('ncc_keyword_id,keyword,impressions,clicks,cost,conversions,conversion_revenue').in('ncc_keyword_id',keywordIds).eq('period_start',period.start).eq('period_end',period.end).limit(5000):empty,
      db.from('coupang_ad_keyword_daily').select('keyword,ad_spend,date,advertised_product_name,advertised_option_id,converted_product_name,converted_option_id').gte('date',period.start).lte('date',period.end).limit(5000),
      marketProject?db.from('market_competitors').select('id,price_won,updated_at').eq('project_id',marketProject.id).eq('master_product_id',productId).eq('status','VERIFIED').limit(200):empty,
      marketProject?db.from('market_personas').select('id,updated_at').eq('project_id',marketProject.id).eq('master_product_id',productId).eq('status','VERIFIED').limit(100):empty,
      marketProject?db.from('market_review_insights').select('id,sample_size,updated_at').eq('project_id',marketProject.id).eq('master_product_id',productId).eq('status','VERIFIED').limit(200):empty,
      marketProject?db.from('market_competitor_review_insights').select('id,sample_size,updated_at').eq('project_id',marketProject.id).eq('master_product_id',productId).eq('status','VERIFIED').limit(200):empty
    ]);
    const cafeItems=fail(cafeItemsResult);
    const keywords=fail(keywordsResult),keywordStats=fail(keywordStatsResult);
    const competitors=fail(competitorsResult),personas=fail(personasResult),reviews=fail(reviewsResult),competitorReviews=fail(competitorReviewsResult);
    const naverGroupLinks=keywords.map(item=>({platform:'NAVER',external_product_id:item.ncc_adgroup_id,master_product_id:productId,is_active:true}));
    const performance=productPerformance.buildUnifiedProductPerformance({
      masterProducts:[masterResult.data],channelProducts:[...channelProducts,...naverGroupLinks],productCosts:costs,
      channelCostSettings:settings,channelShippingRules:rules,periodStart:period.start,periodEnd:period.end,
      cafe24Orders:cafeOrders,cafe24OrderItems:cafeItems,naverKeywords:keywords,naverKeywordStats:keywordStats,
      coupangOrders,coupangOrderItems:fail(coupangItemsResult),coupangProductItems:productItems,
      coupangRgOrders:rgOrders,coupangRgOrderItems:fail(rgItemsResult),coupangAdKeywords:fail(coupangAdsResult)
    });
    const item=performance.items.find(row=>String(row.master_product_id)===productId)||{
      master_product_id:productId,name:masterResult.data.name,revenue:null,orders:null,units:null,ad_spend:null,
      contribution_profit:null,contribution_margin_rate:null,roas:null,cost_status:costs.length?'NO_PERFORMANCE_DATA':'COST_DATA_REQUIRED',
      channels:{CAFE24:{},NAVER:{},COUPANG:{}}
    };
    const customerEvidence=reportModule.buildCustomerPurchaseEvidence({
      orders:cafeOrders,
      productOrderIds:values(cafeItems.map(row=>row.order_id))
    });
    const reviewRows=[...reviews,...competitorReviews];
    const marketAsOf=values([marketProject?.updated_at,...competitors.map(row=>row.updated_at),...personas.map(row=>row.updated_at),...reviewRows.map(row=>row.updated_at)]).sort().at(-1)||null;
    const marketEvidence={
      project_id:marketProject?.id||'',
      verified_competitors:competitors.length,
      competitor_price_samples:competitors.filter(row=>Number.isFinite(Number(row.price_won))).length,
      verified_personas:personas.length,
      verified_review_sets:reviewRows.length,
      review_sample_size:reviewRows.reduce((total,row)=>total+(Number(row.sample_size)||0),0),
      as_of:marketAsOf
    };
    const summary=reportModule.buildProductAnalysisSummary({
      product:{id:productId,name:masterResult.data.name,sku:''},performance:item,keywords:keywordStats,
      customerEvidence,marketEvidence,
      periodDays,periodStart:period.start,periodEnd:period.end,generatedAt:new Date().toISOString()
    });
    const reportType=reportModule.productAnalysisReportType(productId);
    const saved=await db.rpc('create_report_version',{
      p_platform:'ALL',p_report_type:reportType,p_period_start:period.start,p_period_end:period.end,
      p_title:`${masterResult.data.name} ${periodDays===365?'1년':`${periodDays}일`} 상품 분석`,p_status:'FINAL',
      p_summary_json:summary,p_report_html:null,p_revision_note:`${authModule.actor(session)} 수동 상품분석`
    });
    if(saved.error)throw saved.error;
    const report=Array.isArray(saved.data)?saved.data[0]:saved.data;
    return apiSafety.json({ok:true,report:{...report,summary_json:summary}},{status:201});
  }catch(error){
    console.error('[product analysis]',error);
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'상품 분석을 만들지 못했습니다.'},{status:500});
  }
}
