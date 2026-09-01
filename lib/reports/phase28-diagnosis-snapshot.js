'use strict';

const LATEST_FIELDS='id,platform,report_type,period_start,period_end,title,status,summary_json,version,supersedes_report_id,is_latest,revision_note,approved_at,approved_by,created_at';
const VERSION_FIELDS='id,platform,report_type,period_start,period_end,title,status,version,supersedes_report_id,is_latest,revision_note,approved_at,approved_by,created_at';

async function loadPhase28DiagnosisSnapshot({db,now=new Date(),latestLimit=24,versionLimit=80,platform=null,reportTypes=[]}={}){
  if(!db||typeof db.from!=='function')throw new Error('진단 저장소를 확인할 수 없습니다.');
  const safeLatestLimit=Math.min(96,Math.max(1,Number(latestLimit)||24));
  const requestedVersionLimit=Number(versionLimit);
  const safeVersionLimit=requestedVersionLimit===0?0:Math.min(160,Math.max(1,requestedVersionLimit||80));
  let latestQuery=db.from('reports').select(LATEST_FIELDS).eq('is_latest',true);
  if(platform)latestQuery=latestQuery.eq('platform',String(platform).toUpperCase());
  if(Array.isArray(reportTypes)&&reportTypes.length)latestQuery=latestQuery.in('report_type',reportTypes.map(item=>String(item).toUpperCase()));
  const latestPromise=latestQuery.order('created_at',{ascending:false}).limit(safeLatestLimit);
  const versionsPromise=safeVersionLimit===0?Promise.resolve({data:[],error:null}):db.from('reports').select(VERSION_FIELDS).order('created_at',{ascending:false}).limit(safeVersionLimit);
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
