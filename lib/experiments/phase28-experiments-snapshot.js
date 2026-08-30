'use strict';

const service=require('./service.js');

const TEST_FIELDS='id,name,platform,hypothesis,master_product_id,market_project_id,target_type,source_type,metric,start_date,end_date,status,minimum_sample_size,confidence_level,minimum_detectable_lift,evaluation_status,winner_variant_id,result_summary,last_evaluated_at,created_at,ab_test_variants(id,name,is_control,entity_id,impressions,clicks,conversions,orders,revenue,cost,calculated_metrics)';
const BENCHMARK_FIELDS='id,name,platform,metric,warning_value,target_value,direction,source_type,source_name,effective_from,created_at';
const PRODUCT_FIELDS='id,name,selling_price';
const number=value=>Number.isFinite(Number(value))?Number(value):null;
const message=(result,fallback)=>result?.error?String(result.error.message||result.error):fallback||null;

function benchmarkStatus(benchmark,current){
  if(current?.value==null)return 'NO_DATA';
  const value=Number(current.value);
  const target=number(benchmark.target_value);
  const warning=benchmark.warning_value==null?null:number(benchmark.warning_value);
  if(target==null)return 'NO_DATA';
  const higher=benchmark.direction?benchmark.direction==='HIGHER_IS_BETTER':!['CPC','CPA'].includes(benchmark.metric);
  const targetMet=higher?value>=target:value<=target;
  const warningHit=warning==null?false:higher?value<warning:value>warning;
  return targetMet?'TARGET':warningHit?'RISK':'WATCH';
}

async function loadPhase28ExperimentsSnapshot({db,masterProductId=null,now=new Date(),getCurrentMetric=service.currentMetric}={}){
  if(!db||typeof db.from!=='function')throw new Error('A/B 테스트 데이터 연결을 확인해주세요.');
  const productId=String(masterProductId||'').trim().slice(0,80)||null;
  let testsQuery=db.from('ab_tests').select(TEST_FIELDS);
  if(productId)testsQuery=testsQuery.eq('master_product_id',productId);
  const testsPromise=testsQuery.order('created_at',{ascending:false}).limit(60);
  const benchmarksPromise=db.from('performance_benchmarks').select(BENCHMARK_FIELDS).eq('is_active',true).order('created_at',{ascending:false}).limit(24);
  const productsPromise=db.from('master_products').select(PRODUCT_FIELDS).eq('is_active',true).order('name',{ascending:true}).limit(200);
  const [testsResult,benchmarksResult,productsResult]=await Promise.all([testsPromise,benchmarksPromise,productsPromise]);
  if(testsResult?.error)throw new Error(message(testsResult,'A/B 테스트 목록 조회 실패'));
  const tests=Array.isArray(testsResult?.data)?testsResult.data:[];
  const benchmarks=benchmarksResult?.error?[]:(Array.isArray(benchmarksResult?.data)?benchmarksResult.data:[]);
  const products=productsResult?.error?[]:(Array.isArray(productsResult?.data)?productsResult.data:[]);
  const comparisons=await Promise.all(benchmarks.map(async benchmark=>{
    try{
      const current=await getCurrentMetric(benchmark.platform,benchmark.metric);
      const target=number(benchmark.target_value);
      return {
        benchmark_id:benchmark.id,...current,status:benchmarkStatus(benchmark,current),
        gap_percent:target&&current?.value!=null?(Number(current.value)-target)/Math.abs(target)*100:null
      };
    }catch(error){return {benchmark_id:benchmark.id,status:'NO_DATA',error:String(error?.message||error)};}
  }));
  return {
    generatedAt:now instanceof Date?now.toISOString():new Date(now).toISOString(),
    tests,benchmarks,comparisons,products,
    selectedProduct:productId?products.find(item=>String(item.id)===productId)||null:null,
    benchmarksError:message(benchmarksResult),productsError:message(productsResult)
  };
}

module.exports={TEST_FIELDS,BENCHMARK_FIELDS,PRODUCT_FIELDS,loadPhase28ExperimentsSnapshot};
