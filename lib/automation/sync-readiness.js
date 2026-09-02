'use strict';

const text = value => value == null ? '' : String(value).trim();
const has = (env, keys) => keys.every(key => Boolean(text(env[key])));

const PROVIDERS = Object.freeze([
  { name:'CAFE24', platform:'CAFE24' },
  { name:'NAVER_ADS', platform:'NAVER' },
  { name:'NAVER_COMMERCE', platform:'NAVER' },
  { name:'COUPANG', platform:'COUPANG' }
]);

function buildCoreSyncPlan({ env = process.env, cafe24Token = null, evidence = {} } = {}) {
  const cafe24Env = has(env, ['CAFE24_MALL_ID','CAFE24_CLIENT_ID','CAFE24_CLIENT_SECRET','CAFE24_REDIRECT_URI']);
  const naverAdsEnv = has(env, ['NAVER_CUSTOMER_ID','NAVER_API_KEY','NAVER_SECRET_KEY']);
  const naverCommerceEnv = has(env, ['NAVER_COMMERCE_CLIENT_ID','NAVER_COMMERCE_CLIENT_SECRET']);
  const coupangEnv = has(env, ['COUPANG_VENDOR_ID','COUPANG_ACCESS_KEY','COUPANG_SECRET_KEY']);
  const readiness = {
    CAFE24: cafe24Env && Boolean(text(cafe24Token?.access_token))
      ? { runnable:true, code:'CONNECTED', reason:'Cafe24 OAuth 읽기 연결 확인' }
      : { runnable:false, code:cafe24Env?'RECONNECT_REQUIRED':'SETUP_REQUIRED', reason:cafe24Env?'Cafe24 OAuth를 다시 연결해주세요.':'Cafe24 서버 설정이 준비되지 않았습니다.' },
    NAVER_ADS: naverAdsEnv
      ? { runnable:true, code:'CONNECTED', reason:'네이버 검색광고 서버 키 확인' }
      : { runnable:false, code:'SETUP_REQUIRED', reason:'네이버 검색광고 API 서버 설정이 준비되지 않았습니다.' },
    NAVER_COMMERCE: naverCommerceEnv || Boolean(evidence.naverCommerceWorkerReady)
      ? { runnable:true, code:naverCommerceEnv?'CONNECTED':'WORKER_CONNECTED', reason:naverCommerceEnv?'네이버 커머스 서버 키 확인':'서울 고정 IP 작업자의 최근 성공 기록 확인' }
      : { runnable:false, code:'SETUP_REQUIRED', reason:'네이버 커머스 고정 IP 작업자 연결 기록이 없습니다.' },
    COUPANG: coupangEnv || Boolean(evidence.coupangWorkerReady)
      ? { runnable:true, code:coupangEnv?'CONNECTED':'WORKER_CONNECTED', reason:coupangEnv?'쿠팡 서버 키 확인':'서울 고정 IP 작업자의 최근 성공 기록 확인' }
      : { runnable:false, code:'SETUP_REQUIRED', reason:'쿠팡 고정 IP 작업자 연결 기록이 없습니다.' }
  };
  return PROVIDERS.map(provider => ({ ...provider, ...readiness[provider.name] }));
}

function skippedJob(entry) {
  return { name:entry.name, platform:entry.platform, ok:true, skipped:true, status:entry.code, reason:entry.reason };
}

function channelUpdates(jobs = [], now = new Date().toISOString()) {
  const byName = name => jobs.find(job => job.name === name);
  const summarize = (platform, names) => {
    const selected = names.map(byName).filter(Boolean);
    const attempted = selected.filter(job => !job.skipped);
    const failed = attempted.filter(job => !job.ok || job.degraded);
    const succeeded = attempted.filter(job => job.ok);
    const skipped = selected.filter(job => job.skipped);
    if (!attempted.length) return {
      platform, health_status:'WAITING', data_mode:'PREVIOUS', last_attempt_at:now,
      latest_collection_summary:'연결 설정 후 수집 가능', error_message:skipped.map(job => job.reason).filter(Boolean).join(' · ') || null
    };
    if (failed.length) return {
      platform, health_status:succeeded.length?'PARTIAL':'FAILED', data_mode:'PREVIOUS', last_attempt_at:now,
      latest_collection_summary:succeeded.length?'일부 자료만 최신 반영':'최근 수집 실패', error_message:failed.map(job => job.error).filter(Boolean).join(' · ') || '수집 결과를 다시 확인해주세요.'
    };
    const queued = succeeded.some(job => job.status === 'RUNNING' || job.data?.queued || job.data?.status === 'RUNNING');
    return {
      platform, health_status:queued?'RUNNING':'READY', data_mode:queued?'PENDING':'LIVE', last_attempt_at:now,
      ...(queued?{}:{last_success_at:now}), latest_collection_summary:queued?'고정 IP 서버 수집 대기·진행 중':'방금 수집 완료',
      error_message:skipped.length?skipped.map(job => job.reason).join(' · '):null
    };
  };
  return [
    summarize('CAFE24',['CAFE24']),
    summarize('NAVER',['NAVER_ADS','NAVER_COMMERCE']),
    summarize('COUPANG',['COUPANG'])
  ];
}

module.exports = { PROVIDERS, buildCoreSyncPlan, skippedJob, channelUpdates };
