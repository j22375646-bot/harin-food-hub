'use strict';

const FRESH_READ_MS = 24 * 60 * 60 * 1000;
const text = value => String(value ?? '').trim();
const enabled = value => text(value).toLowerCase() === 'true';
const time = value => new Date(value || 0).getTime() || 0;
const rowTime = row => time(row?.finished_at || row?.started_at || row?.date || row?.updated_at);
const latest = rows => [...(rows || [])].sort((left,right)=>rowTime(right)-rowTime(left))[0] || null;
const latestSuccess = rows => latest((rows || []).filter(row=>row?.status === 'SUCCESS'));
const credentialReady = (names,env) => names.every(name=>text(env?.[name]));
const fresh = (value,now) => Boolean(value && time(now)-time(value) <= FRESH_READ_MS && time(value) <= time(now)+60_000);

function naverChannel({ campaigns=[], adgroupCount=0, keywordCount=0, stats=[], syncs=[] }={},env,now){
  const searchRows=(syncs || []).filter(row=>row?.platform === 'NAVER' && ['SEARCH_AD_CONNECTION_TEST','FETCH_ALL','SEARCH_TERMS'].includes(row?.job_type));
  const attempt=latest(searchRows);
  const success=latestSuccess(searchRows);
  const counts={
    campaigns:campaigns.length,
    adgroups:Number(adgroupCount)||0,
    keywords:Number(keywordCount)||0,
    performance_days:new Set((stats || []).map(row=>row?.date).filter(Boolean)).size
  };
  const operated=counts.campaigns+counts.adgroups+counts.keywords+counts.performance_days>0 || Boolean(success);
  const credentials=credentialReady(['NAVER_CUSTOMER_ID','NAVER_API_KEY','NAVER_SECRET_KEY'],env);
  const lastSuccessAt=success?.finished_at || success?.started_at || null;
  const readFresh=fresh(lastSuccessAt,now);
  const writeEnabled=enabled(env?.NAVER_SEARCH_AD_WRITE_ENABLED);
  let readStatus='SETUP_REQUIRED';
  if(attempt?.status==='RUNNING')readStatus='RUNNING';
  else if(attempt?.status==='FAILED')readStatus=success?'STALE':'FAILED';
  else if(readFresh)readStatus='READY';
  else if(success||counts.campaigns+counts.keywords+counts.performance_days>0)readStatus='STALE';
  else if(credentials)readStatus='VERIFY_REQUIRED';
  const writeStatus=!writeEnabled?'LOCKED':readFresh?'OWNER_APPROVAL':'READ_REFRESH_REQUIRED';
  return {
    platform:'NAVER',label:'네이버 검색광고',icon:'naver',tone:'lavender',operated,
    sourceMode:'SEARCH_ADS_API',sourceLabel:'검색광고 API',readStatus,writeStatus,
    summary:readStatus==='READY'?'최근 읽기 검증을 통과했어요.':readStatus==='STALE'?'저장 자료는 있지만 실시간 읽기를 다시 확인해야 해요.':readStatus==='FAILED'?'최근 읽기 검증이 실패했어요.':'검색광고 읽기 연결을 먼저 확인해주세요.',
    counts,lastAttemptAt:attempt?.finished_at || attempt?.started_at || null,lastSuccessAt,
    writeReady:writeStatus==='OWNER_APPROVAL',
    safeguards:['실행 직전 현재 입찰가 재조회','사장님 승인과 30분 승인 유효시간','변경 후 API 재조회 값 일치 확인'],
    primaryAction:{kind:'probe',label:'네이버 읽기 다시 확인',endpoint:'/api/naver/probe'},
    workAction:{label:'네이버 키워드 운영',href:'/keywords/registered?platform=naver'}
  };
}

function coupangChannel({ daily=[], campaigns=[], keywordTop=[], keywordWaste=[], billing=[], syncs=[] }={},_env,now){
  const adRows=[...(daily || []),...(campaigns || []),...(keywordTop || []),...(keywordWaste || []),...(billing || [])];
  const importRows=(syncs || []).filter(row=>row?.platform === 'COUPANG' && row?.job_type === 'FILE_IMPORT');
  const attempt=latest(importRows);
  const success=latestSuccess(importRows);
  const dataAt=latest(adRows)?.date || latest(adRows)?.updated_at || null;
  const operated=adRows.length>0 || Boolean(success?.metadata?.adRows || success?.metadata?.sourceType === 'COUPANG_AD');
  const readStatus=adRows.length ? (fresh(dataAt || success?.finished_at || success?.started_at,now)?'READY':'STALE') : success?'STALE':'IMPORT_REQUIRED';
  return {
    platform:'COUPANG',label:'쿠팡 광고',icon:'coupang',tone:'blue',operated,
    sourceMode:'WING_FILE_IMPORT',sourceLabel:'WING 광고보고서 파일',readStatus,writeStatus:'MANUAL_REQUIRED',
    summary:adRows.length?'가져온 WING 광고자료를 읽고 있어요.':'WING 광고보고서 파일을 가져온 뒤 확인할 수 있어요.',
    counts:{
      performance_days:new Set((daily || []).map(row=>row?.date).filter(Boolean)).size,
      campaigns:(campaigns || []).length,
      visible_keywords:(keywordTop || []).length+(keywordWaste || []).length,
      billing_days:new Set((billing || []).map(row=>row?.date).filter(Boolean)).size
    },
    lastAttemptAt:attempt?.finished_at || attempt?.started_at || null,
    lastSuccessAt:dataAt || success?.finished_at || success?.started_at || null,
    writeReady:false,
    safeguards:['네이버 키워드와 별도 저장','허브 자동반영으로 표시하지 않음','WING 반영 후 결과를 다시 가져와 검증'],
    primaryAction:{kind:'link',label:'쿠팡 광고자료 확인',href:'/keywords/registered?platform=coupang'},
    workAction:{label:'WING 적용 작업표',href:'/keywords/registered?platform=coupang'},
    officialScope:'공식 판매자 Open API 목록에는 광고 키워드 입찰 조회·변경 항목이 확인되지 않아 WING 수동반영을 유지합니다.'
  };
}

function buildAdvertisingChannelCenter({naver={},coupang={},env=process.env,now=new Date()}={}){
  const all=[naverChannel(naver,env,now),coupangChannel(coupang,env,now)];
  const channels=all.filter(channel=>channel.operated);
  return {
    phase:'19-7',generatedAt:new Date(now).toISOString(),channels,
    excluded:all.filter(channel=>!channel.operated).map(channel=>({platform:channel.platform,label:channel.label,reason:'운영 광고자료가 없어 화면에서 제외'})),
    summary:{operated:channels.length,ready:channels.filter(channel=>channel.readStatus==='READY').length,writesReady:channels.filter(channel=>channel.writeReady).length},
    rules:[
      '네이버와 쿠팡의 광고 자격증명, 표, 변경 경로를 서로 공유하지 않습니다.',
      '광고자료가 실제로 존재하는 운영 채널만 이 화면에 표시합니다.',
      '네이버 변경은 최신 읽기 확인과 사장님 승인 후에만 실행됩니다.',
      '쿠팡은 공식 광고 입찰 쓰기 API가 확인되기 전까지 WING 수동 작업표만 제공합니다.'
    ]
  };
}

module.exports={FRESH_READ_MS,buildAdvertisingChannelCenter,coupangChannel,naverChannel};
