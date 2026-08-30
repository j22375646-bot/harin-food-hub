'use strict';

const calculator=require('../../experiments/calculator.js');

const METRIC_LABELS=Object.freeze({CTR:'클릭률',CPC:'클릭당비용',CVR:'전환율',CPA:'전환당비용',ROAS:'ROAS',REVENUE:'매출',ORDERS:'주문수',AOV:'객단가'});
const STATUS_LABELS=Object.freeze({RUNNING:'진행 중',COMPLETED:'종료',DRAFT:'준비 중',CANCELLED:'취소'});
const VERDICT_LABELS=Object.freeze({WINNER:'승자 확정',INSUFFICIENT_SAMPLE:'표본 대기',INCONCLUSIVE:'판단 보류',NOT_EVALUATED:'평가 전'});
const BENCHMARK_LABELS=Object.freeze({TARGET:'목표 달성',WATCH:'관찰',RISK:'기준 미달',NO_DATA:'확인 필요'});
const number=value=>Number.isFinite(Number(value))?Number(value):null;
const count=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('ko-KR'):'확인 필요';
const won=value=>Number.isFinite(Number(value))?`${Math.round(Number(value)).toLocaleString('ko-KR')}원`:'확인 필요';

function metricValue(metric,value){
  if(value==null)return '확인 필요';
  if(['CTR','CVR','ROAS'].includes(metric))return `${Number(value).toFixed(2)}%`;
  if(['CPC','CPA','REVENUE','AOV'].includes(metric))return won(value);
  return `${count(value)}건`;
}

function testModel(test,productMap){
  const variants=Array.isArray(test.ab_test_variants)?test.ab_test_variants:[];
  const evaluation=calculator.evaluate(test,variants);
  const winnerId=test.winner_variant_id||evaluation.winner?.id||null;
  const minimum=Number(test.minimum_sample_size)||30;
  const mapped=variants
    .slice()
    .sort((a,b)=>Number(b.is_control)-Number(a.is_control))
    .map((variant,index)=>{
      const calculated=calculator.metrics(variant);
      return Object.freeze({
        id:String(variant.id||`${test.id}-${index}`),
        name:String(variant.name||`변형 ${index+1}`),
        roleLabel:variant.is_control?'A · 대조군':`B · 실험군`,
        isControl:Boolean(variant.is_control),
        entityId:variant.entity_id||null,
        metricValue:metricValue(test.metric,calculated[test.metric]),
        sample:calculator.sampleSize(test.metric,variant),
        impressions:Number(variant.impressions)||0,
        clicks:Number(variant.clicks)||0,
        conversions:Number(variant.conversions)||Number(variant.orders)||0,
        orders:Number(variant.orders)||Number(variant.conversions)||0,
        revenue:Number(variant.revenue)||0,
        cost:Number(variant.cost)||0,
        isWinner:winnerId!=null&&String(winnerId)===String(variant.id)
      });
    });
  const status=String(test.evaluation_status||evaluation.status||'NOT_EVALUATED');
  const product=productMap.get(String(test.master_product_id||''))||test.product||null;
  return Object.freeze({
    id:String(test.id),name:String(test.name||'이름 확인 필요'),platform:String(test.platform||'ALL'),
    productId:test.master_product_id||null,productLabel:product?.name||'모든 상품',
    metric:String(test.metric||'CVR'),metricLabel:METRIC_LABELS[test.metric]||String(test.metric||'KPI'),
    sourceType:String(test.source_type||'MANUAL'),sourceLabel:{MANUAL:'수동 실적',NAVER_ENTITY:'네이버 자동집계',CAFE24_PRODUCT:'Cafe24 상품',COUPANG_PRODUCT:'쿠팡 상품'}[test.source_type]||'자료 연결 확인 필요',
    hypothesis:String(test.hypothesis||'가설 확인 필요'),periodLabel:`${test.start_date||'시작일 확인 필요'} ~ ${test.end_date||'종료일 확인 필요'}`,
    status:String(test.status||'DRAFT'),statusLabel:STATUS_LABELS[test.status]||'상태 확인 필요',
    evaluationStatus:status,verdictLabel:VERDICT_LABELS[status]||'판단 보류',
    resultSummary:String(test.result_summary||evaluation.summary||'평가 결과 확인 필요'),
    confidence:number(evaluation.confidence),confidenceRequired:Number(test.confidence_level)||90,
    liftPercent:number(evaluation.liftPercent),minimumDetectableLift:Number(test.minimum_detectable_lift)||0,
    samples:Object.freeze({control:evaluation.samples?.control??0,challenger:evaluation.samples?.challenger??0,minimum}),
    winner:mapped.find(item=>item.isWinner)||null,variants:Object.freeze(mapped),lastEvaluatedAt:test.last_evaluated_at||null
  });
}

function benchmarkModel(item,comparison){
  const status=String(comparison?.status||'NO_DATA');
  return Object.freeze({
    id:String(item.id),name:String(item.name||'기준 이름 확인 필요'),platform:String(item.platform||'ALL'),
    metric:String(item.metric||'ROAS'),metricLabel:METRIC_LABELS[item.metric]||String(item.metric||'KPI'),
    currentValue:metricValue(item.metric,comparison?.value),targetValue:metricValue(item.metric,number(item.target_value)),
    warningValue:item.warning_value==null?null:metricValue(item.metric,number(item.warning_value)),
    gapPercent:number(comparison?.gap_percent),sample:number(comparison?.sample),basis:comparison?.basis||item.source_name||'근거 확인 필요',
    status,statusLabel:BENCHMARK_LABELS[status]||'확인 필요',error:comparison?.error||null
  });
}

function buildPhase28ExperimentsModel(snapshot={}){
  const failed=Boolean(snapshot.error);
  const products=Array.isArray(snapshot.products)?snapshot.products.map(item=>Object.freeze({id:String(item.id),name:String(item.name||'상품명 확인 필요')})):[];
  const productMap=new Map(products.map(item=>[item.id,item]));
  const items=failed?[]:(Array.isArray(snapshot.tests)?snapshot.tests:[]).map(test=>testModel(test,productMap));
  const comparisonMap=new Map((Array.isArray(snapshot.comparisons)?snapshot.comparisons:[]).map(item=>[String(item.benchmark_id),item]));
  const benchmarks=failed?[]:(Array.isArray(snapshot.benchmarks)?snapshot.benchmarks:[]).map(item=>benchmarkModel(item,comparisonMap.get(String(item.id))));
  const partial=Boolean(snapshot.benchmarksError||snapshot.productsError||snapshot.comparisonsError);
  return Object.freeze({
    generatedAt:snapshot.generatedAt||null,dataStatus:failed?'ERROR':partial?'PARTIAL':'READY',error:snapshot.error||null,
    partialErrors:Object.freeze([snapshot.benchmarksError,snapshot.productsError,snapshot.comparisonsError].filter(Boolean)),
    summary:failed?Object.freeze({running:null,winners:null,waiting:null,risks:null}):Object.freeze({
      running:items.filter(item=>item.status==='RUNNING').length,
      winners:items.filter(item=>item.evaluationStatus==='WINNER').length,
      waiting:items.filter(item=>item.evaluationStatus==='INSUFFICIENT_SAMPLE').length,
      risks:benchmarks.filter(item=>item.status==='RISK').length
    }),
    items:Object.freeze(items),benchmarks:Object.freeze(benchmarks),products:Object.freeze(products),
    selectedProduct:snapshot.selectedProduct?Object.freeze({id:String(snapshot.selectedProduct.id),name:String(snapshot.selectedProduct.name||'상품명 확인 필요')}):null,
    policy:Object.freeze({minimumSampleBeforeWinner:true,confidenceBeforeWinner:true,productIsolation:'master_product_id',ownerConfirmationForWrites:true,missingAsZero:false})
  });
}

module.exports={METRIC_LABELS,buildPhase28ExperimentsModel};
