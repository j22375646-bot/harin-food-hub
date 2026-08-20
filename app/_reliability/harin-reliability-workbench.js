'use client';

import './harin-reliability-v8.css';
import { useMemo } from 'react';
import HarinIcon from '../_design-system/harin-icon.js';
import { buildExceptions, dateTime, PLATFORM_LABEL, workerHeartbeatReady } from './harin-reliability-model.js';

const HEALTH_LABEL={READY:'정상',RUNNING:'수집 중',PARTIAL:'일부 확인',FAILED:'수집 실패',STALE:'갱신 필요',WAITING:'수집 대기'};
const CONNECTION_LABEL={READ_READY:'읽기 연결',WRITE_READY:'읽기·쓰기 연결',RECONNECT_REQUIRED:'재연결 필요',SETUP_REQUIRED:'설정 필요',VERIFY_REQUIRED:'연결 확인',FAILED:'연결 실패'};
const PLATFORM_ICON={NAVER:'naverStore',COUPANG:'shoppingBag',CAFE24:'store',EPOST:'truck',ALL:'database'};

function exceptionIcon(kind){
  if(kind==='DEAD_LETTER')return 'sync';
  if(kind==='CHANNEL')return 'link';
  return 'warning';
}
function channelTone(channel={}){
  if(['FAILED','PARTIAL'].includes(channel.health_status))return 'danger';
  if(['STALE','WAITING'].includes(channel.health_status)||!['READ_READY','WRITE_READY'].includes(channel.connection_status))return 'warning';
  if(channel.health_status==='RUNNING')return 'running';
  return 'ready';
}

function ChannelReadiness({channels=[]}){
  return <section className="reliabilityChannelRail" aria-label="채널 준비 상태">
    {channels.map(channel=>{
      const tone=channelTone(channel);
      return <article className={tone} key={channel.platform}>
        <i aria-hidden="true"><HarinIcon name={PLATFORM_ICON[channel.platform]||'database'} size={22}/></i>
        <span><small>{PLATFORM_LABEL[channel.platform]||channel.platform}</small><b>{HEALTH_LABEL[channel.health_status]||channel.health_status||'확인 필요'}</b><em>{CONNECTION_LABEL[channel.connection_status]||channel.connection_status||'연결 확인'}</em></span>
        <u aria-hidden="true"/>
      </article>;
    })}
  </section>;
}
function WorkerSignals({reliability={}}){
  const workers=reliability.worker?.workers||[];
  const heartbeatReady=workerHeartbeatReady(reliability);
  return <section className="reliabilityWorkerSignals">
    <header><span><small>WORKER HEARTBEAT</small><b>서버 생존 신호</b></span><em className={heartbeatReady?'ready':'danger'}>{heartbeatReady?'모두 연결됨':'확인 필요'}</em></header>
    <div>{workers.length?workers.map(worker=><article className={worker.stale?'danger':'ready'} key={worker.worker_id}><i aria-hidden="true"/><span><b>{worker.service_name||worker.worker_id}</b><small>{worker.stale?'신호가 멈췄어요':worker.status==='BUSY'?'작업 처리 중':'정상 연결'} · {dateTime(worker.last_seen_at)}</small></span>{worker.current_job_type?<em>{worker.current_job_type}</em>:null}</article>):<article className="warning"><i aria-hidden="true"/><span><b>고정 IP 워커</b><small>첫 생존 신호를 기다리고 있어요.</small></span></article>}</div>
  </section>;
}

function ExceptionPreview({items=[],onRetry,retrying}){
  const deadLetters=items.filter(item=>item.kind==='DEAD_LETTER');
  return <section className="reliabilityExceptionPreview">
    <header><span><small>GLOBAL EXCEPTION INBOX</small><b>지금 확인할 예외</b><p>개인정보 없이 실패·지연·연결 이상만 모으고, 같은 문제는 여러 상자에 반복하지 않습니다.</p></span><em>{items.length}건</em></header>
    {items.length?<div>{items.slice(0,5).map(item=><article className={item.tone} key={item.id}><i aria-hidden="true"><HarinIcon name={exceptionIcon(item.kind)} size={20}/></i><span><small>{PLATFORM_LABEL[item.platform]||item.platform} · {dateTime(item.at)}</small><b>{item.title}</b><p>{item.message||'상세 원인을 확인해주세요.'}</p></span>{item.kind==='DEAD_LETTER'?<button type="button" onClick={()=>onRetry?.([item.raw])} disabled={retrying}>{retrying?'요청 중':'다시 처리'}</button>:null}</article>)}</div>:<div className="reliabilityAllClear"><i aria-hidden="true"><HarinIcon name="check" size={21}/></i><span><b>지금 막힌 작업이 없어요</b><small>채널과 워커가 보내는 새 신호를 계속 확인합니다.</small></span></div>}
    {deadLetters.length>1?<button className="reliabilityRetryAll" type="button" onClick={()=>onRetry?.(deadLetters.map(item=>item.raw))} disabled={retrying}>{retrying?'재시도 요청 중…':`실패 ${deadLetters.length}건 모두 다시 처리`}</button>:null}
  </section>;
}

export default function HarinReliabilityWorkbench({mode='collection',center={},alerts=[],deliveries=[],primaryLabel,onPrimary,primaryBusy=false,onRetry,retrying=false,aiPanel,children}){
  const isCollection=mode==='collection';
  const summary=center.summary||{};
  const exceptions=useMemo(()=>buildExceptions(center,alerts),[center,alerts]);
  const openAlerts=(alerts||[]).filter(item=>item.status==='OPEN').length;
  const failedDeliveries=(deliveries||[]).filter(item=>item.status==='FAILED').length;
  const kpis=isCollection?[
    ['정상 채널',`${Number(summary.ready_channels||0)}/3`,'최근 자료 사용 가능','mint'],
    ['수집·재시도',`${Number(summary.active_queue||0)}건`,'현재 대기열','blue'],
    ['오래된 자료',`${Number(summary.previous_data_channels||0)}개`,'0원 대신 확인 필요','yellow'],
    ['실패 작업',`${Number(summary.dead_letters||0)}건`,'안전하게 다시 처리','pink']
  ]:[
    ['열린 알림',`${openAlerts}건`,'확인·해결 필요','mint'],
    ['중요 오류',`${(alerts||[]).filter(item=>item.status==='OPEN'&&item.severity==='ERROR').length}건`,'먼저 처리할 항목','pink'],
    ['발송 완료',`${(deliveries||[]).filter(item=>item.status==='SENT').length}건`,'최근 발송 기록','blue'],
    ['발송 실패',`${failedDeliveries}건`,'메일 설정 확인','yellow']
  ];
  return <section className={`reliabilityV8 ${mode}`}>
    <header className="reliabilityHero">
      <div><span>{isCollection?'실시간 데이터 운영':'확인할 알림'}</span><h1>{isCollection?'데이터가 멈추기 전에 먼저 알려드릴게요':'처리할 알림만 차분하게 모아봤어요'}</h1><p>{isCollection?'채널 연결, 최근 수집, 고정 IP 워커와 실패 작업을 한 흐름으로 확인합니다. 정상 채널은 그대로 두고 문제가 있는 작업만 다시 처리해요.':'수집 오류와 운영 이상을 중요도순으로 확인하고, 지금 처리하지 않을 알림은 잠시 숨길 수 있어요.'}</p></div>
      <aside className={exceptions.length?'attention':'clear'}><i aria-hidden="true"><HarinIcon name={exceptions.length?'warning':'check'} size={22}/></i><span><small>{exceptions.length?'지금 확인할 신호':'현재 상태'}</small><b>{exceptions.length?`${exceptions.length}건`:'모두 안정적'}</b><em>{isCollection?`다음 자동수집 ${dateTime(center.next_scheduled_at)}`:'해결한 알림은 이력으로 남아요'}</em></span>{onPrimary?<button type="button" onClick={onPrimary} disabled={primaryBusy}>{primaryBusy?'처리 중…':primaryLabel}</button>:null}</aside>
    </header>
    <ChannelReadiness channels={center.channels||[]}/>
    <section className="reliabilityKpis">{kpis.map(([label,value,description,tone])=><article className={tone} key={label}><small>{label}</small><b>{value}</b><span>{description}</span></article>)}</section>
    <div className="reliabilityFocusGrid"><WorkerSignals reliability={center.reliability||{}}/><ExceptionPreview items={exceptions} onRetry={onRetry} retrying={retrying}/></div>
    {aiPanel?<div className="reliabilityAiSlot">{aiPanel}</div>:null}
    <div className="reliabilityPageBody">{children}</div>
  </section>;
}
