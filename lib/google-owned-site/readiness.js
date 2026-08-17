'use strict';

const configModule=require('./config.js');
const searchConsole=require('./search-console.js');
const ga4=require('./ga4.js');
const pageSpeed=require('./pagespeed.js');
const crux=require('./crux.js');

const DEFINITIONS=[
  {key:'searchConsole',provider:'SEARCH_CONSOLE',label:'Google Search Console',subtitle:'검색 노출·클릭·CTR·평균 순위',icon:'search',endpoint:'/api/google-search-console/probe',actionLabel:'검색 유입 읽기 확인',capabilities:['검색 클릭','검색 노출','CTR','검색 순위']},
  {key:'ga4',provider:'GA4',label:'Google Analytics 4',subtitle:'자사몰 방문·사용자·전환 준비',icon:'analysis',endpoint:'/api/google-analytics/probe',actionLabel:'방문 자료 읽기 확인',capabilities:['세션','사용자','날짜별 추이','전환 확장 준비']},
  {key:'pageSpeed',provider:'PAGESPEED',label:'PageSpeed Insights',subtitle:'모바일 속도·Lighthouse 성능',icon:'speed',endpoint:'/api/google-pagespeed/probe',actionLabel:'모바일 속도 확인',capabilities:['성능 점수','첫 화면 표시','주요 화면 표시','차단 시간']},
  {key:'crux',provider:'CRUX',label:'Chrome UX Report',subtitle:'실제 방문자의 모바일 사용성',icon:'mobile',endpoint:'/api/google-crux/probe',actionLabel:'실사용 품질 확인',capabilities:['LCP','INP','CLS','표본 유무']}
];

const ADAPTERS={SEARCH_CONSOLE:searchConsole,GA4:ga4,PAGESPEED:pageSpeed,CRUX:crux};
function time(row){return new Date(row?.fetched_at||row?.created_at||0).getTime()||0;}
function latest(rows){return [...rows].sort((a,b)=>time(b)-time(a))[0]||null;}
function publicError(error){
  const message=String(error?.message||'연결 확인에 실패했습니다.').replace(/\s+/g,' ').slice(0,180);
  if(/private.?key|credential|invalid_grant|unauthorized|permission|403|401/i.test(message))return '서비스 계정 권한 또는 서버 자격증명을 다시 확인해주세요.';
  if(/quota|rate.?limit|429/i.test(message))return 'API 호출 한도를 확인해주세요. 이전 성공 자료는 그대로 보존됩니다.';
  if(/^\s*[<{[]/.test(message))return '공급자 오류 응답을 받았습니다. 잠시 뒤 다시 확인해주세요.';
  return message;
}
function statusFor(row,config,missing){
  if(!config.enabled)return 'LOCKED';
  if(missing.length)return 'SETUP_REQUIRED';
  if(!row)return 'VERIFY_REQUIRED';
  if(row.status==='SUCCESS')return 'READY';
  if(row.status==='NO_DATA')return 'NO_DATA';
  return 'FAILED';
}
function metricSummary(provider,metrics={}){
  if(provider==='SEARCH_CONSOLE')return metrics.days?`${metrics.days}일 · 클릭 ${Number(metrics.clicks||0).toLocaleString('ko-KR')}회 · 노출 ${Number(metrics.impressions||0).toLocaleString('ko-KR')}회`:'검색 표본이 아직 없습니다.';
  if(provider==='GA4')return metrics.days?`${metrics.days}일 · 방문 ${Number(metrics.sessions||0).toLocaleString('ko-KR')}회 · 사용자 ${Number(metrics.users||0).toLocaleString('ko-KR')}명`:'방문 표본이 아직 없습니다.';
  if(provider==='PAGESPEED')return Number.isFinite(metrics.performanceScore)?`모바일 성능 ${metrics.performanceScore}점 · LCP ${metrics.lcpMs==null?'확인 필요':`${Math.round(metrics.lcpMs)}ms`}`:'속도 결과가 아직 없습니다.';
  return metrics.lcpMs!=null?`실사용 LCP ${Math.round(metrics.lcpMs)}ms · INP ${metrics.inpMs==null?'확인 필요':`${Math.round(metrics.inpMs)}ms`}`:'해당 주소의 충분한 실사용 표본이 없습니다.';
}

function buildOwnedSiteReadiness({snapshots=[],env=process.env,now=new Date()}={}){
  const services=DEFINITIONS.map(def=>{
    const config=configModule.providerConfig(def.provider,env);const missing=configModule.missingFields(def.provider,config);
    const rows=snapshots.filter(row=>row.provider===def.provider);const attempt=latest(rows);const success=latest(rows.filter(row=>row.status==='SUCCESS'));
    const status=statusFor(attempt,config,missing);const noData=attempt?.status==='NO_DATA';
    return {...def,status,credentialReady:missing.length===0,killSwitchEnabled:config.enabled,missingFields:missing,
      summary:{READY:'읽기 연결과 최신 표본을 확인했어요.',NO_DATA:'연결은 됐지만 사용할 표본이 아직 없어요.',FAILED:'최근 읽기 확인이 실패했어요.',VERIFY_REQUIRED:'설정은 준비됐고 첫 읽기 확인이 필요해요.',SETUP_REQUIRED:'서버 연결 정보를 먼저 저장해주세요.',LOCKED:'공급자 사용이 서버에서 잠겨 있어요.'}[status],
      detail:attempt?metricSummary(def.provider,attempt.metric_summary||{}):missing.length?`필요한 설정 · ${missing.join(' · ')}`:'첫 읽기 확인을 실행해주세요.',
      previousSuccess:Boolean(success&&success!==attempt),lastAttemptAt:attempt?.fetched_at||null,lastSuccessAt:success?.fetched_at||null,
      errorMessage:status==='FAILED'?publicError({message:attempt?.error_message}):null,
      checks:[{key:'credentials',label:'서버 연결 정보',status:missing.length?'SETUP_REQUIRED':'READY'},{key:'read',label:'읽기 전용 확인',status},{key:'storage',label:'개인정보 없는 집계 저장',status:attempt||noData?'READY':'VERIFY_REQUIRED'}],
      capabilities:def.capabilities.map((label,index)=>({key:`scope-${index}`,label,readStatus:status==='READY'?'READY':status==='NO_DATA'?'NO_DATA':'NOT_TESTED',writeStatus:'NOT_APPLICABLE'})),
      action:{endpoint:def.endpoint,label:def.actionLabel}
    };
  });
  return {phase:'19-1',generatedAt:new Date(now).toISOString(),services,summary:{ready:services.filter(item=>item.status==='READY').length,attention:services.filter(item=>!['READY','NO_DATA'].includes(item.status)).length,noData:services.filter(item=>item.status==='NO_DATA').length},rules:[
    '네 공급자는 자격증명·요청·저장 기록을 서로 섞지 않습니다.',
    '고객 이름·연락처·주소·사용자 식별자는 수집하거나 외부 API로 보내지 않습니다.',
    '연결 실패 시 이전 성공 자료를 보존하고 0으로 덮어쓰지 않습니다.',
    '이 단계는 읽기 전용이며 광고·상품·사이트 설정을 변경하지 않습니다.'
  ]};
}

async function saveSnapshot(db,row){
  const result=await db.from('owned_site_api_snapshots').insert(row).select('id,provider,status,fetched_at').single();
  if(result.error){const error=new Error(`연결 결과 저장 실패: ${result.error.message}`);error.code='OWNED_SITE_SNAPSHOT_SAVE_FAILED';throw error;}
  return result.data;
}

async function probeProvider(provider,{db,env=process.env,fetchImpl=fetch,now=new Date()}={}){
  const config=configModule.providerConfig(provider,env);const missing=configModule.missingFields(provider,config);
  if(!config.enabled){const error=new Error('이 공급자는 서버 안전 스위치로 중지되어 있습니다.');error.code='PROVIDER_DISABLED';error.status=423;throw error;}
  if(missing.length){const error=new Error(`필요한 서버 설정: ${missing.join(', ')}`);error.code='CONFIG_REQUIRED';error.status=412;throw error;}
  try{
    const result=await ADAPTERS[provider].probe({config,fetchImpl,now});
    const stored=await saveSnapshot(db,{provider,site_url:config.siteUrl||config.origin,status:result.status,metric_summary:result.metricSummary||{},quota_summary:result.quotaSummary||{},source_timestamp:result.sourceTimestamp||null,fetched_at:new Date(now).toISOString(),metadata:{read_only:true,provider_isolated:true}});
    return {provider,status:result.status,snapshot:stored,summary:metricSummary(provider,result.metricSummary)};
  }catch(error){
    await saveSnapshot(db,{provider,site_url:config.siteUrl||config.origin,status:'FAILED',metric_summary:{},quota_summary:{},fetched_at:new Date(now).toISOString(),error_code:error.code||'PROVIDER_READ_FAILED',error_message:publicError(error),metadata:{read_only:true,provider_isolated:true}}).catch(()=>{});
    throw error;
  }
}

module.exports={ DEFINITIONS, buildOwnedSiteReadiness, probeProvider, publicError, metricSummary };
