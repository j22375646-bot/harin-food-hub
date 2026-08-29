'use strict';

const LATEST_FIELDS='id,platform,report_type,period_start,period_end,title,status,summary_json,version,supersedes_report_id,is_latest,revision_note,approved_at,approved_by,created_at';
const VERSION_FIELDS='id,platform,report_type,period_start,period_end,title,status,version,supersedes_report_id,is_latest,revision_note,approved_at,approved_by,created_at';

async function loadPhase28DiagnosisSnapshot({db,now=new Date()}={}){
  if(!db||typeof db.from!=='function')throw new Error('진단 저장소를 확인할 수 없습니다.');
  const latestPromise=db.from('reports').select(LATEST_FIELDS).eq('is_latest',true).order('created_at',{ascending:false}).limit(24);
  const versionsPromise=db.from('reports').select(VERSION_FIELDS).order('created_at',{ascending:false}).limit(80);
  const [latestResult,versionsResult]=await Promise.all([latestPromise,versionsPromise]);
  if(latestResult?.error)throw new Error(latestResult.error.message||'최신 진단을 불러오지 못했습니다.');
  return {
    generatedAt:new Date(now).toISOString(),
    latestReports:latestResult?.data||[],
    versionHeaders:versionsResult?.error?[]:versionsResult?.data||[],
    versionsError:versionsResult?.error?.message||null
  };
}

module.exports={LATEST_FIELDS,VERSION_FIELDS,loadPhase28DiagnosisSnapshot};
