'use strict';

const SUCCESS = new Set(['SUCCESS']);
const ACTIVE = new Set(['PENDING','QUEUED','RUNNING','RETRYING']);

const DEFINITIONS = [
  {
    key:'commerce', label:'네이버 커머스', subtitle:'스마트스토어 상품·주문·문의·정산', icon:'naverStore',
    jobs:['COMMERCE_CONNECTION_TEST','COMMERCE_SYNC'],
    env:['NAVER_COMMERCE_CLIENT_ID','NAVER_COMMERCE_CLIENT_SECRET'], writeEnv:'NAVER_COMMERCE_WRITE_ENABLED',
    endpoint:'/api/naver-commerce/probe', actionLabel:'커머스 읽기 확인', fixedIp:true,
    capabilities:[['products','상품'],['orders','주문'],['inquiries','문의'],['claims','클레임'],['settlements','정산']]
  },
  {
    key:'searchAds', label:'네이버 검색광고', subtitle:'캠페인·광고그룹·키워드·입찰가', icon:'target',
    jobs:['SEARCH_AD_CONNECTION_TEST','FETCH_ALL','SEARCH_TERMS'],
    env:['NAVER_CUSTOMER_ID','NAVER_API_KEY','NAVER_SECRET_KEY'], writeEnv:'NAVER_SEARCH_AD_WRITE_ENABLED',
    endpoint:'/api/naver/probe', actionLabel:'검색광고 읽기 확인', fixedIp:false,
    capabilities:[['campaigns','캠페인'],['keywords','키워드'],['bids','입찰가']]
  },
  {
    key:'apiHub', label:'NAVER API HUB', subtitle:'검색 트렌드·쇼핑 인사이트·검색 API', icon:'analysis',
    jobs:['API_HUB_CONNECTION_TEST'],
    env:['NAVER_API_HUB_CLIENT_ID','NAVER_API_HUB_CLIENT_SECRET'], writeEnv:null,
    endpoint:'/api/naver-api-hub/probe', actionLabel:'API HUB 읽기 확인', fixedIp:false,
    capabilities:[['searchTrend','검색 트렌드'],['shoppingInsight','쇼핑 인사이트'],['search','검색 API']]
  }
];

function time(row) { return new Date(row?.finished_at || row?.started_at || 0).getTime() || 0; }
function latest(rows) { return [...rows].sort((a,b) => time(b) - time(a))[0] || null; }
function envReady(names, env) { return names.every(name => String(env[name] || '').trim()); }
function configFailure(row) {
  const value = `${row?.metadata?.code || ''} ${row?.error_message || ''}`;
  return /CONFIG_REQUIRED|환경변수|Client ID|Secret|자격증명/i.test(value);
}
function safeError(row) {
  if (!row?.error_message) return null;
  const code = String(row.metadata?.code || '');
  if (code.includes('CONFIG_REQUIRED')) return '서버 자격증명을 저장한 뒤 다시 확인해주세요.';
  if (/Unauthorized|401|invalid.*key|authentication/i.test(row.error_message)) return '인증키 또는 API 권한을 다시 확인해주세요.';
  if (/timeout|시간.*초과|AbortError/i.test(row.error_message)) return '플랫폼 응답이 늦어 연결 확인이 끝나지 않았습니다.';
  if (/^\s*[<{[]/.test(row.error_message)) return '플랫폼 오류 응답을 받았습니다. 연결 확인을 다시 실행해주세요.';
  return String(row.error_message).replace(/\s+/g,' ').slice(0, 180);
}
function capabilityStatus(value) {
  if (value === true || value?.read === true) return 'READY';
  if (value === 'NOT_TESTED' || value?.read === 'NOT_TESTED') return 'NOT_TESTED';
  return 'VERIFY_REQUIRED';
}
function kstMonthKey(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit' })
    .formatToParts(new Date(value)).reduce((result,item) => ({ ...result, [item.type]:item.value }), {});
  return `${parts.year}-${parts.month}`;
}

function buildService(definition, syncs, env, now) {
  const rows = syncs.filter(row => row.platform === 'NAVER' && definition.jobs.includes(row.job_type));
  const attempt = latest(rows);
  const success = latest(rows.filter(row => SUCCESS.has(row.status)));
  const localConfig = envReady(definition.env, env);
  const credentialReady = localConfig || Boolean(success) || Boolean(attempt && !configFailure(attempt));
  let status = 'SETUP_REQUIRED';
  if (attempt && ACTIVE.has(attempt.status)) status = 'RUNNING';
  else if (attempt?.status === 'SUCCESS') status = 'READY';
  else if (attempt?.status === 'PARTIAL') status = 'PARTIAL';
  else if (attempt?.status === 'FAILED' && configFailure(attempt)) status = 'SETUP_REQUIRED';
  else if (attempt?.status === 'FAILED') status = 'FAILED';
  else if (credentialReady) status = 'VERIFY_REQUIRED';

  const metadata = success?.metadata || attempt?.metadata || {};
  const writeEnabled = definition.writeEnv
    ? String(env[definition.writeEnv] || metadata.writeEnabled || '').toLowerCase() === 'true'
    : false;
  const capabilities = definition.capabilities.map(([key,label]) => {
    const source = metadata.capabilities?.[key];
    const readStatus = capabilityStatus(source);
    return {
      key, label,
      readStatus:status === 'READY' && readStatus === 'VERIFY_REQUIRED' ? 'READY' : readStatus,
      writeStatus:definition.writeEnv ? writeEnabled ? 'OWNER_APPROVAL' : 'LOCKED' : 'NOT_APPLICABLE'
    };
  });
  const summary = {
    READY:'읽기 연결이 확인됐어요.', PARTIAL:'일부 읽기 권한을 다시 확인해주세요.',
    RUNNING:'읽기 연결을 확인하고 있어요.', FAILED:'최근 연결 확인이 실패했어요.',
    VERIFY_REQUIRED:'자격증명은 준비됐고 읽기 확인이 필요해요.',
    SETUP_REQUIRED:'서버 자격증명을 먼저 저장해주세요.'
  }[status];
  const service = {
    key:definition.key, label:definition.label, subtitle:definition.subtitle, icon:definition.icon,
    status, summary, fixedIp:definition.fixedIp, previousSuccess:Boolean(success && attempt !== success),
    credentialReady, writeEnabled, lastAttemptAt:attempt?.finished_at || attempt?.started_at || null,
    lastSuccessAt:success?.finished_at || success?.started_at || null,
    errorMessage:status === 'FAILED' || status === 'PARTIAL' || status === 'SETUP_REQUIRED' ? safeError(attempt) : null,
    action:{ endpoint:definition.endpoint, label:definition.actionLabel },
    checks:[
      { key:'credentials', label:definition.fixedIp?'고정 IP 서버 자격증명':'서버 자격증명', status:credentialReady?'READY':'SETUP_REQUIRED' },
      { key:'read', label:'읽기 전용 검증', status:status },
      { key:'write', label:'플랫폼 변경', status:definition.writeEnv ? writeEnabled?'OWNER_APPROVAL':'LOCKED' : 'NOT_APPLICABLE' }
    ],
    capabilities
  };
  if (definition.key === 'apiHub') {
    const month = kstMonthKey(now);
    const used = rows.filter(row => row.job_type === 'API_HUB_CONNECTION_TEST'
      && kstMonthKey(row.started_at || row.finished_at) === month
      && row.metadata?.requestAttempted === true).length;
    service.quota = {
      label:'검색 트렌드 월 호출 한도', used, limit:50_000, unit:'회',
      source:'허브 연결검사 기록 기준', consoleExcluded:true
    };
  }
  return service;
}

function buildNaverApiReadiness({ syncs = [], env = process.env, now = new Date() } = {}) {
  const services = DEFINITIONS.map(definition => buildService(definition, syncs, env, now));
  return {
    phase:'18-1', generatedAt:new Date(now).toISOString(), services,
    summary:{
      ready:services.filter(item => item.status === 'READY').length,
      attention:services.filter(item => !['READY','RUNNING'].includes(item.status)).length,
      running:services.filter(item => item.status === 'RUNNING').length,
      writesLocked:services.filter(item => !item.writeEnabled).length
    },
    rules:[
      '커머스·검색광고·API HUB는 자격증명과 수집 기록을 서로 공유하지 않습니다.',
      '이 화면의 확인 버튼은 읽기 전용이며 플랫폼 데이터를 변경하지 않습니다.',
      '쓰기 기능은 사장님 승인과 서버 잠금 해제가 모두 있어야 실행됩니다.'
    ]
  };
}

module.exports = { buildNaverApiReadiness, safeError, kstMonthKey };
