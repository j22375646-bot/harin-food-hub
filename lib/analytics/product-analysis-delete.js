'use strict';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ProductAnalysisDeleteError extends Error{
  constructor(message,status=400,code='INVALID_PRODUCT_ANALYSIS_DELETE'){
    super(message);
    this.name='ProductAnalysisDeleteError';
    this.status=status;
    this.code=code;
  }
}

function validTimestamp(value){
  const text=String(value||'').trim();
  return text&&Number.isFinite(new Date(text).getTime())?text:null;
}

async function deleteSavedProductAnalysisReport({db,reportId,expectedCreatedAt,actor}={}){
  const id=String(reportId||'').trim();
  const createdAt=validTimestamp(expectedCreatedAt);
  if(!UUID.test(id))throw new ProductAnalysisDeleteError('삭제할 분석을 다시 선택해주세요.');
  if(!createdAt)throw new ProductAnalysisDeleteError('분석 생성 시각을 확인한 뒤 다시 시도해주세요.');
  if(!db||typeof db.rpc!=='function')throw new ProductAnalysisDeleteError('분석 저장 서버를 확인할 수 없습니다.',503,'STORE_UNAVAILABLE');
  const result=await db.rpc('delete_product_analysis_report',{
    p_report_id:id,
    p_expected_created_at:createdAt,
    p_deleted_by:String(actor||'owner').trim().slice(0,100)||'owner'
  });
  if(result.error){
    if(String(result.error.code)==='40001')throw new ProductAnalysisDeleteError('분석이 목록을 연 뒤 변경됐습니다. 새로고침한 뒤 다시 삭제해주세요.',409,'STALE_REPORT');
    if(String(result.error.code)==='42501')throw new ProductAnalysisDeleteError('삭제할 수 있는 상품 분석이 아닙니다.',404,'REPORT_NOT_FOUND');
    throw result.error;
  }
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  if(!row)throw new ProductAnalysisDeleteError('분석 삭제 결과를 확인하지 못했습니다.',500,'DELETE_RESULT_MISSING');
  return {id:String(row.report_id||id),deleted:row.deleted===true,promotedReportId:row.promoted_report_id||null};
}

module.exports={ProductAnalysisDeleteError,deleteSavedProductAnalysisReport};
