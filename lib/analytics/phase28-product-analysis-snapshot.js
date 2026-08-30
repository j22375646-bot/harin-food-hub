'use strict';

const PRODUCT_FIELDS='id,name,selling_price,is_active';
const CHANNEL_FIELDS='master_product_id,platform,is_active';
const REPORT_FIELDS='id,platform,report_type,period_start,period_end,title,status,summary_json,version,supersedes_report_id,is_latest,revision_note,approved_at,approved_by,created_at';

async function loadPhase28ProductAnalysisSnapshot({db,now=new Date()}={}){
  if(!db||typeof db.from!=='function')throw new Error('상품분석 저장소를 확인할 수 없습니다.');
  const productsPromise=db.from('master_products').select(PRODUCT_FIELDS).eq('is_active',true).order('name',{ascending:true}).limit(200);
  const channelsPromise=db.from('channel_products').select(CHANNEL_FIELDS).eq('is_active',true).order('platform',{ascending:true}).limit(1000);
  const reportsPromise=db.from('reports').select(REPORT_FIELDS).like('report_type','PRODUCT_ANALYSIS_%').order('created_at',{ascending:false}).limit(24);
  const [productsResult,channelsResult,reportsResult]=await Promise.all([productsPromise,channelsPromise,reportsPromise]);
  for(const result of [productsResult,channelsResult,reportsResult]){
    if(result?.error)throw new Error(result.error.message||'상품분석 초기 자료를 불러오지 못했습니다.');
  }
  return {
    generatedAt:new Date(now).toISOString(),
    masterProducts:productsResult?.data||[],
    channelProducts:channelsResult?.data||[],
    reports:reportsResult?.data||[]
  };
}

module.exports={PRODUCT_FIELDS,CHANNEL_FIELDS,REPORT_FIELDS,loadPhase28ProductAnalysisSnapshot};
