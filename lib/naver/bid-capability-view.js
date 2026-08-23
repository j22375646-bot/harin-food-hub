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

module.exports={GROUPS,STATUS,capabilityView};

