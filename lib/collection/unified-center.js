'use strict';

const PLATFORM_LABEL = { NAVER:'네이버', CAFE24:'Cafe24', COUPANG:'쿠팡' };
const READY_CONNECTIONS = new Set(['READ_READY','WRITE_READY']);
const HEALTHY = new Set(['READY','RUNNING']);

function latestQualityChecks(checks = []) {
  const seen = new Set();
  return checks.filter(item => {
    const key = `${item.platform}:${item.dataset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function channelAction(channel) {
  if (!READY_CONNECTIONS.has(channel.connection_status)) return {
    priority:3, code:'CONNECT', label:'연결부터 확인', message:`${channel.label} 연결 또는 권한 확인이 먼저 필요합니다.`
  };
  if (channel.health_status === 'RUNNING') return {
    priority:0, code:'WAIT', label:'수집 완료 기다리기', message:'현재 수집 중입니다. 같은 작업을 다시 누르지 않아도 됩니다.'
  };
  if (['FAILED','PARTIAL'].includes(channel.health_status)) return {
    priority:3, code:'RETRY', label:'이 채널 다시 수집', message:'다른 채널은 그대로 두고 실패한 채널만 다시 수집하세요.'
  };
  if (channel.health_status === 'STALE') return {
    priority:2, code:'REFRESH', label:'자료 새로 받기', message:'이전 자료는 보존 중이지만 계산 전 새로 수집하는 것이 안전합니다.'
  };
  if (channel.health_status === 'WAITING') return {
    priority:2, code:'COLLECT', label:'첫 수집 실행', message:'아직 성공 기록이 없어 첫 수집이 필요합니다.'
  };
  return { priority:0, code:'READY', label:'현재 정상', message:'최근 성공 자료를 사용하고 있습니다.' };
}

function buildUnifiedCollectionCenter({
  dataHealth = {}, channelConnections = {}, syncs = [], automationRuns = [], qualityChecks = [], alerts = [], queueHealth = {}, reliability = {}
} = {}) {
  const connectionMap = new Map((channelConnections.channels || []).map(item => [item.platform,item]));
  const healthMap = new Map((dataHealth.channels || []).map(item => [item.platform,item]));
  const channels = ['NAVER','CAFE24','COUPANG'].map(platform => {
    const connection = connectionMap.get(platform) || {};
    const health = healthMap.get(platform) || {};
    const run = automationRuns.find(item => item.job_name === `${platform}_SYNC`);
    const latestSuccess = syncs.find(item => item.platform === platform && item.status === 'SUCCESS');
    const collectedSummary = latestSuccess
      ? latestSuccess.rows_received == null ? '최근 수집 완료' : `최근 수집 ${Number(latestSuccess.rows_received).toLocaleString('ko-KR')}행`
      : null;
    const channel = {
      platform,
      label:PLATFORM_LABEL[platform],
      connection_status:connection.status || 'SETUP_REQUIRED',
      connection_summary:connection.summary || '연결 상태 확인 필요',
      health_status:health.status || 'WAITING',
      data_mode:health.dataMode || 'WAITING',
      calculation_status:health.calculationStatus || 'WAITING',
      stored_summary:collectedSummary || health.storedSummary || '저장량 확인 필요',
      last_success_at:health.lastSuccessAt || latestSuccess?.finished_at || null,
      last_attempt_at:health.lastAttemptAt || null,
      next_scheduled_at:health.nextScheduledAt || dataHealth.nextScheduledAt || null,
      failed_datasets:health.failedDatasets || [],
      error_message:health.errorMessage || null,
      attempt_count:Number(run?.attempt_count || 0)
    };
    return { ...channel, action:channelAction(channel) };
  });
  const latestChecks = latestQualityChecks(qualityChecks);
  const qualityProblems = latestChecks.filter(item => !['OK','PASS','SUCCESS'].includes(String(item.status_code || '').toUpperCase()));
  const activeQueue = Number(queueHealth.pending || 0) + Number(queueHealth.running || 0) + Number(queueHealth.retryWaiting || 0);
  const longFailures = Number(queueHealth.longFailures?.length || 0);
  const recommendations = channels.filter(item => item.action.priority > 0)
    .map(item => ({ platform:item.platform, title:`${item.label} · ${item.action.label}`, message:item.action.message, priority:item.action.priority }))
    .concat(longFailures ? [{ platform:'COUPANG', title:'쿠팡 장기 실패 작업 확인', message:`고정 IP 작업 ${longFailures}건이 오래 걸리거나 실패했습니다.`, priority:3 }] : [])
    .concat(qualityProblems.length ? [{ platform:'ALL', title:'데이터 품질검사 확인', message:`최근 검사에서 ${qualityProblems.length}개 항목을 확인해야 합니다.`, priority:2 }] : [])
    .sort((a,b)=>b.priority-a.priority);
  return {
    phase:'13-8',
    overall_status:channels.every(item=>HEALTHY.has(item.health_status)&&READY_CONNECTIONS.has(item.connection_status))&&!qualityProblems.length&&!longFailures ? 'READY' : 'ATTENTION',
    next_scheduled_at:dataHealth.nextScheduledAt || channels.find(item=>item.next_scheduled_at)?.next_scheduled_at || null,
    channels,
    recommendations,
    reliability,
    summary:{
      ready_channels:channels.filter(item=>item.health_status==='READY'&&READY_CONNECTIONS.has(item.connection_status)).length,
      running_channels:channels.filter(item=>item.health_status==='RUNNING').length,
      attention_channels:channels.filter(item=>!HEALTHY.has(item.health_status)||!READY_CONNECTIONS.has(item.connection_status)).length,
      previous_data_channels:channels.filter(item=>item.data_mode==='PREVIOUS').length,
      quality_problems:qualityProblems.length,
      open_alerts:(alerts || []).length,
      active_queue:activeQueue,
      long_failures:longFailures,
      dead_letters:Number(reliability.dead_letter_count||0),
      worker_status:reliability.worker?.status||'CHECK'
    }
  };
}

module.exports = { buildUnifiedCollectionCenter, latestQualityChecks };
