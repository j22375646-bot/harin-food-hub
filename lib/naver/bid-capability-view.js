'use strict';

const GROUPS=[
  {key:'core',label:'계정·키워드',description:'캠페인부터 현재 입찰가까지',keys:['campaigns','adgroups','keywords','current_bid']},
  {key:'performance',label:'성과 분해',description:'최근 성과와 기기·요일·시간·지역',keys:['base_stats','device_breakdown','weekday_breakdown','hour_breakdown','region_breakdown']},
  {key:'estimate',label:'입찰 예상',description:'PC·모바일 목표 순위와 최소 노출',keys:['average_position_pc','average_position_mobile','minimum_exposure_pc','minimum_exposure_mobile','position_15']},
  {key:'boundary',label:'사용 경계',description:'공식 API 값과 허브 파생값 구분',keys:['exact_live_rank','competitor_bid_distribution','bid_write']}
];

const STATUS={
  READY:['사용 가능','ready'],
  PARTIAL:['일부 확인','warning'],
  VERIFY_REQUIRED:['다시 확인','warning'],
  NO_DATA:['표본 없음','empty'],
  NO_SAMPLE:['기간 표본 없음','empty'],
  SKIPPED:['검사 안 함','muted'],
  NOT_SUPPORTED:['지원 확인 안 됨','muted'],
  ESTIMATE_ONLY:['예상값만 사용','estimate'],
  DERIVED_ONLY:['허브 계산값','estimate'],
  CONFIGURED_NOT_TESTED:['설정됨·변경 안 함','locked'],
  LOCKED:['변경 잠금','locked']
};

const OVERALL={READY:['핵심 기능 사용 가능','ready'],PARTIAL:['일부 확인 필요','warning'],NO_DATA:['광고 표본 필요','empty'],SETUP_REQUIRED:['연결 설정 필요','locked'],FAILED:['검증 실패','danger']};
const PHASE25_ROLLBACK_TAG='v1.38.67';
const ACCEPTANCE_STALE_MS=24*60*60*1000;

function countLabel(value){return value==null?'확인 필요':`${Number(value).toLocaleString('ko-KR')}개`;}

function capabilityView(result){
  const current=result&&typeof result==='object'?result:null;
  const [statusLabel,statusTone]=OVERALL[current?.status]||['아직 검사하지 않음','muted'];
  const byKey=new Map((current?.checks||[]).map(item=>[item.key,item]));
  return {
    statusLabel,statusTone,checkedAt:current?.checkedAt||null,coreReady:current?.coreReady===true,
    counts:[['캠페인',countLabel(current?.counts?.campaigns)],['광고그룹',countLabel(current?.counts?.adgroups)],['키워드',countLabel(current?.counts?.keywords)]],
    groups:GROUPS.map(group=>({...group,items:group.keys.map(key=>byKey.get(key)).filter(Boolean).map(item=>{
      const [displayStatus,tone]=STATUS[item.status]||[item.status||'확인 필요','muted'];
      return {...item,displayStatus,tone};
    })}))
  };
}

function capabilityAcceptanceView(result,{now=new Date(),staleAfterMs=ACCEPTANCE_STALE_MS}={}){
  const current=result&&typeof result==='object'?result:null;
  const checkedAt=Date.parse(current?.checkedAt||'');
  const age=Number(new Date(now).getTime())-checkedAt;
  const fresh=Number.isFinite(checkedAt)&&age>=-5*60*1000&&age<=Number(staleAfterMs);
  const readStatus=current?.coreReady===true&&fresh?'READY':current?.coreReady===true?'STALE':'CHECK';
  const isolated=current?.provider==='NAVER_SEARCH_ADS'&&current?.mode==='READ_ONLY';
  const bidWrite=(current?.checks||[]).find(item=>item.key==='bid_write');
  const guarded=current?.writeProbePerformed===false&&['CONFIGURED_NOT_TESTED','LOCKED'].includes(bidWrite?.status);
  const steps=[
    {key:'LIVE_READ',label:'실계정 읽기',status:readStatus,note:readStatus==='READY'?'최근 핵심 읽기 결과를 다시 확인했어요.':readStatus==='STALE'?'마지막 확인이 하루를 지나 다시 확인해야 해요.':'캠페인·광고그룹·키워드 읽기 상태를 확인해주세요.'},
    {key:'PLATFORM_ISOLATION',label:'채널 분리',status:isolated?'READY':'CHECK',note:isolated?'네이버 읽기 전용 결과만 이 작업대에 사용해요.':'네이버 전용 읽기 결과인지 다시 확인해야 해요.'},
    {key:'WRITE_GUARD',label:'변경 안전',status:guarded?'READY':'CHECK',note:guarded?'실제 입찰 변경 없이 쓰기 잠금만 확인했어요.':'쓰기 검증 상태를 다시 확인해야 해요.'},
    {key:'RECOVERY',label:'복구 기준',status:'READY',note:`직전 정상 태그 ${PHASE25_ROLLBACK_TAG}로 화면만 복구할 수 있어요.`}
  ];
  const ready=steps.every(item=>item.status==='READY');
  return {
    status:ready?'READY':'VERIFY_REQUIRED',
    label:ready?'운영 사용 가능':'다시 확인 필요',
    tone:ready?'ready':'warning',
    rollbackTag:PHASE25_ROLLBACK_TAG,
    checkedAt:current?.checkedAt||null,
    steps
  };
}

module.exports={GROUPS,STATUS,PHASE25_ROLLBACK_TAG,capabilityView,capabilityAcceptanceView};
