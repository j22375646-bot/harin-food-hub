'use strict';

const text=value=>String(value==null?'':value).trim();
const time=value=>new Date(value||0).getTime()||0;

function relativeTime(value,now){
  const at=time(value),reference=time(now);
  if(!at||!reference)return '시각 확인 필요';
  const minutes=Math.max(0,Math.floor((reference-at)/60000));
  if(minutes<1)return '방금';
  if(minutes<60)return `${minutes}분 전`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}시간 전`;
  return `${Math.floor(hours/24)}일 전`;
}

function channelLabel(value){
  const key=text(value).toUpperCase();
  return {COUPANG:'쿠팡',CAFE24:'Cafe24',NAVER:'네이버',EPOST:'우체국택배',ALL:'전체 운영'}[key]||text(value)||'채널 확인 필요';
}

function notificationState(row,now){
  const status=text(row?.status||'OPEN').toUpperCase();
  if(status==='OPEN'&&time(row?.snoozed_until)>time(now))return 'SNOOZED';
  return ['OPEN','ACKNOWLEDGED','RESOLVED'].includes(status)?status:'OPEN';
}

function normalizeAlert(row,now){
  const state=notificationState(row,now);
  const severity=text(row?.severity||'WARNING').toUpperCase();
  return {
    id:text(row?.id),
    state,
    severity:['ERROR','WARNING','INFO'].includes(severity)?severity:'WARNING',
    channel:channelLabel(row?.platform),
    platform:text(row?.platform).toUpperCase()||'UNKNOWN',
    source:text(row?.source_type)||'운영 신호',
    title:text(row?.title)||'알림 내용 확인 필요',
    message:text(row?.message)||'상세 근거를 확인해주세요.',
    createdAt:row?.created_at||null,
    timeLabel:relativeTime(row?.created_at,now),
    snoozedUntil:row?.snoozed_until||null,
    acknowledgedAt:row?.acknowledged_at||null,
    resolvedAt:row?.resolved_at||null,
    stateLabel:{OPEN:'열림',SNOOZED:'1시간 숨김',ACKNOWLEDGED:'확인',RESOLVED:'해결'}[state]
  };
}

function buildPhase28NotificationsModel(snapshot={}){
  const hasError=Boolean(snapshot.error);
  const generatedAt=snapshot.generatedAt||null;
  const alerts=(snapshot.alerts||[]).map(row=>normalizeAlert(row,generatedAt||new Date())).sort((a,b)=>time(b.createdAt)-time(a.createdAt));
  const count=state=>alerts.filter(item=>item.state===state).length;
  const summary=hasError
    ?{current:null,open:null,snoozed:null,acknowledged:null,resolved:null,total:null}
    :{current:alerts.filter(item=>item.state!=='RESOLVED').length,open:count('OPEN'),snoozed:count('SNOOZED'),acknowledged:count('ACKNOWLEDGED'),resolved:count('RESOLVED'),total:alerts.length};
  return {
    dataStatus:hasError?'ERROR':'READY',
    generatedAt,
    error:hasError?text(snapshot.error):null,
    alerts,
    summary,
    lastSignalLabel:hasError?'확인 필요':alerts.length?relativeTime(alerts[0].createdAt,generatedAt):'새 알림 없음',
    flow:[
      {id:'detect',step:'01',label:'발견',value:hasError?'확인 필요':`운영 신호 ${summary.current}건`,description:'채널·작업·자료 상태'},
      {id:'inspect',step:'02',label:'확인',value:'근거를 먼저 봐요',description:'발생 시각·영향 범위'},
      {id:'handle',step:'03',label:'처리',value:hasError?'확인 필요':`${summary.open}건 조치 필요`,description:'숨김·확인·해결'},
      {id:'record',step:'04',label:'기록',value:'상태 이력 보존',description:'외부 발송은 별도 설정'}
    ],
    policy:{detailLoading:'ON_DEMAND',externalDeliveryOnLoad:false,missingAsZero:false,bulkConfirmation:true}
  };
}

module.exports={buildPhase28NotificationsModel,normalizeAlert,notificationState,channelLabel,relativeTime};
