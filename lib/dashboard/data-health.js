'use strict';

const CHANNELS = ['NAVER', 'CAFE24', 'COUPANG'];
const RUNNING = new Set(['PENDING', 'QUEUED', 'RUNNING', 'RETRYING']);
const FAILED = new Set(['FAILED', 'ERROR']);

function safeError(error, meta = {}) {
  const code = String(error?.code || error?.name || 'QUERY_ERROR');
  return {
    platform: meta.platform || 'SHARED',
    dataset: meta.dataset || 'unknown',
    code,
    message: code.startsWith('PGRST')
      ? '저장소 응답을 확인해야 합니다.'
      : '데이터를 불러오지 못했습니다.',
    retryable: /^08|^53|^57|^PGRST00/.test(code)
  };
}

function settleQueries(settled, metadata, onError = () => {}) {
  const issues = [];
  const results = settled.map((entry, index) => {
    const meta = metadata[index] || {};
    const error = entry.status === 'rejected' ? entry.reason : entry.value?.error;
    if (!error) return entry.value;
    const issue = safeError(error, meta);
    issues.push(issue);
    onError(error, issue);
    return { data: null, count: null, error: null, unavailable: true };
  });
  return { results, issues };
}

function nextDailyKst(now = new Date(), hour = 5, minute = 30) {
  const current = new Date(now);
  const kst = new Date(current.getTime() + 9 * 60 * 60 * 1000);
  let candidate = new Date(Date.UTC(
    kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), hour - 9, minute, 0, 0
  ));
  if (candidate <= current) candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  return candidate.toISOString();
}

function buildDataHealth({ issues = [], syncs = [], automationRuns = [], coupangRequests = [], summaries = {}, now = new Date() }) {
  const current = new Date(now);
  const channels = CHANNELS.map(platform => {
    const channelIssues = issues.filter(item => item.platform === platform);
    const latest = syncs.find(item => item.platform === platform) || null;
    const run = automationRuns.find(item => item.job_name === `${platform}_SYNC` && RUNNING.has(item.status));
    const request = platform === 'COUPANG' ? coupangRequests.find(item => RUNNING.has(item.status)) : null;
    const running = run || request;
    const latestAt = latest?.finished_at || latest?.started_at || null;
    const stale = latestAt && current.getTime() - new Date(latestAt).getTime() > 30 * 60 * 60 * 1000;
    let status = 'WAITING';
    if (running) status = 'RUNNING';
    else if (channelIssues.length) status = 'PARTIAL';
    else if (latest?.status === 'PARTIAL') status = 'PARTIAL';
    else if (FAILED.has(latest?.status)) status = 'FAILED';
    else if (latest?.status === 'SUCCESS' && stale) status = 'STALE';
    else if (latest?.status === 'SUCCESS') status = 'READY';
    const lastSuccess = syncs.find(item => item.platform === platform && item.status === 'SUCCESS');
    return {
      platform,
      status,
      lastSuccessAt: lastSuccess?.finished_at || null,
      lastAttemptAt: latestAt,
      nextScheduledAt: nextDailyKst(current),
      failedDatasets: channelIssues.map(item => item.dataset),
      errorMessage: channelIssues[0]?.message || latest?.error_message || null,
      storedSummary: summaries[platform] || '저장량 확인 필요'
    };
  });
  const sharedIssues = issues.filter(item => !CHANNELS.includes(item.platform));
  const unhealthy = channels.filter(item => !['READY', 'RUNNING'].includes(item.status));
  return {
    overallStatus: sharedIssues.length || unhealthy.length ? 'PARTIAL' : 'READY',
    channels,
    issues,
    sharedIssues,
    nextScheduledAt: nextDailyKst(current)
  };
}

module.exports = { buildDataHealth, nextDailyKst, safeError, settleQueries };
