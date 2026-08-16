'use client';

import HarinIcon from './_design-system/harin-icon.js';

const healthLabel={READY:'정상',RUNNING:'수집 중',PARTIAL:'일부 확인',FAILED:'수집 실패',STALE:'갱신 필요',WAITING:'수집 대기'};
const connectionLabel={READ_READY:'읽기 연결',WRITE_READY:'읽기·쓰기 연결',RECONNECT_REQUIRED:'재연결 필요',SETUP_REQUIRED:'설정 필요',VERIFY_REQUIRED:'연결 확인 필요',FAILED:'연결 실패'};

function displayDateTime(value) {
  if (!value) return '기록 없음';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

function ChannelCollectionCard({ channel, onRun, onConnect, busy }) {
  const needsConnection=channel.action?.code==='CONNECT';
  const handler=needsConnection?onConnect:onRun;
  const buttonLabel=needsConnection?channel.action?.label:channel.health_status==='READY'?'이 채널 새로 수집':channel.action?.label;
  const iconName={NAVER:'naver',CAFE24:'cafe24',COUPANG:'coupang'}[channel.platform]||'database';
  return <article className={`collectionOpsChannel ${String(channel.health_status||'WAITING').toLowerCase()}`}>
    <header><div className="collectionChannelTitle"><i><HarinIcon name={iconName} size={20}/></i><span><small>{channel.platform}</small><h2>{channel.label}</h2></span></div><em>{healthLabel[channel.health_status]||channel.health_status}</em></header>
    <section className="collectionOpsChannelState"><span>{connectionLabel[channel.connection_status]||channel.connection_status}</span><strong>{channel.stored_summary}</strong><small>{channel.connection_summary}</small></section>
    <dl>
      <div><dt>마지막 성공</dt><dd>{displayDateTime(channel.last_success_at)}</dd></div>
      <div><dt>마지막 시도</dt><dd>{displayDateTime(channel.last_attempt_at)}</dd></div>
      <div><dt>다음 자동수집</dt><dd>{displayDateTime(channel.next_scheduled_at)}</dd></div>
    </dl>
    <p>{channel.error_message||channel.action?.message}</p>
    {channel.failed_datasets?.length?<small className="collectionOpsDatasets">확인할 자료 · {channel.failed_datasets.join(', ')}</small>:null}
    <button type="button" onClick={handler} disabled={busy||!handler}>{busy?'요청 중…':buttonLabel||'상태 확인'}</button>
  </article>;
}

function ReliabilityWorkbench({ reliability={}, onRetry, retrying=false }) {
  const workers=reliability.worker?.workers||[];const deadLetters=reliability.dead_letters||[];
  return <section className="reliabilityWorkbench">
    <header><div className="reliabilityTitle"><i><HarinIcon name="server" size={22}/></i><span><span>운영 신뢰도</span><h2>고정 IP 워커와 실패 작업</h2><p>15분 이상 신호가 없으면 알림을 만들고, 최종 실패한 작업만 여기에서 다시 대기열로 보냅니다.</p></span></div><em className={reliability.status==='HEALTHY'?'healthy':'check'}>{reliability.status==='HEALTHY'?'정상':'확인 필요'}</em></header>
    <div className="workerHeartbeatGrid">{workers.length?workers.map(worker=><article className={worker.stale?'silent':'online'} key={worker.worker_id}><i><HarinIcon name={worker.stale?'warning':'server'} size={18}/></i><span>{worker.service_name}</span><strong>{worker.stale?'신호 없음':worker.status==='BUSY'?'작업 중':'연결됨'}</strong><small>마지막 신호 {displayDateTime(worker.last_seen_at)} · {worker.silence_minutes==null?'시간 확인 필요':`${worker.silence_minutes}분 전`}</small>{worker.current_job_type?<b>{worker.current_job_type}</b>:null}{worker.last_error?<p>{worker.last_error}</p>:null}</article>):<article className="silent"><i><HarinIcon name="server" size={18}/></i><span>harin-coupang-worker</span><strong>첫 신호 대기</strong><small>AWS 고정 IP 워커 재시작 후 자동 등록됩니다.</small></article>}</div>
    <details className="deadLetterWorkbench" open={deadLetters.length>0}><summary><span><b>다시 처리할 실패 작업</b><small>개인정보나 암호화된 작업 내용은 표시하지 않습니다.</small></span><em>{deadLetters.length}건</em></summary>{deadLetters.length?<div>{deadLetters.map(item=><article key={`${item.kind}-${item.id}`}><span><b>{item.title}</b><small>{item.target} · 실패 {displayDateTime(item.failed_at)} · 시도 {item.attempt_count}회</small><p>{item.error}</p></span><button type="button" onClick={()=>onRetry?.([item])} disabled={retrying}>{retrying?'요청 중…':'이 작업 다시 처리'}</button></article>)}<button className="retryAllDeadLetters" type="button" onClick={()=>onRetry?.(deadLetters)} disabled={retrying}>{retrying?'재시도 요청 중…':`실패 ${deadLetters.length}건 모두 다시 처리`}</button></div>:<p className="emptyDeadLetters">현재 다시 처리할 최종 실패 작업이 없습니다.</p>}</details>
  </section>;
}

export default function UnifiedCollectionOperationsCenter({ center={}, message='', onRunAll, allSyncing, onSync={}, onConnect={}, syncing={}, onRetryDeadLetters, retryingDeadLetters=false, compact=false, children }) {
  const summary=center.summary||{};
  const channels=center.channels||[];
  const recommendations=center.recommendations||[];
  return <section className={`collectionOpsCenter${compact?' compact':''}`}>
    {!compact?<section className="collectionOpsHero">
      <div className="collectionOpsHeroCopy"><span>통합 데이터 수집</span><div><i><HarinIcon name="database" size={28}/></i><span><h1>통합 데이터 수집 운영센터</h1><p>세 채널의 연결, 수집, 검증 상태와 고정 IP 워커를 한 번에 확인합니다. 문제가 생기면 전체를 다시 돌리지 않고 필요한 채널이나 실패 작업만 안전하게 다시 처리합니다.</p></span></div></div>
      <aside><small><HarinIcon name="checklist" size={16}/>지금 확인할 채널</small><strong>{Number(summary.attention_channels||0)}개</strong><em>정상 {Number(summary.ready_channels||0)} · 수집 중 {Number(summary.running_channels||0)} · 다음 {displayDateTime(center.next_scheduled_at)}</em><button type="button" onClick={onRunAll} disabled={allSyncing}><HarinIcon name="sync" size={16}/>{allSyncing?'전체 처리 중…':'전체 수집 + 검증'}</button></aside>
    </section>:null}

    {message?<div className="syncToast collectionOpsMessage">{message}</div>:null}

    {!compact?<ReliabilityWorkbench reliability={center.reliability||{}} onRetry={onRetryDeadLetters} retrying={retryingDeadLetters}/>:null}

    <details className="collectionOpsHelp">
      <summary>도움말 · 언제 전체 수집하고, 언제 채널만 수집하나요?</summary>
      <div><p><b>한 채널만 실패</b>했다면 그 채널 버튼만 누르세요. 예를 들어 Cafe24 주문이 오래됐지만 쿠팡은 정상이라면 Cafe24만 다시 받으면 됩니다.</p><p><b>전체 수집 + 검증</b>은 하루 업무 시작 전이나 여러 채널 숫자가 동시에 이상할 때 사용하세요. 수집 실패 자료는 0으로 계산하지 않고 이전 성공 자료와 ‘확인 필요’ 상태를 유지합니다.</p></div>
    </details>

    {!compact?<section className="collectionOpsFlow" aria-label="수집 운영 흐름">
      <article><i><HarinIcon name="link" size={17}/></i><span><b>연결</b><small>API와 권한 확인</small></span></article><em>→</em>
      <article><i><HarinIcon name="collection" size={17}/></i><span><b>수집</b><small>채널별 자료 저장</small></span></article><em>→</em>
      <article><i><HarinIcon name="checklist" size={17}/></i><span><b>검증</b><small>누락·중복·오류 검사</small></span></article><em>→</em>
      <article><i><HarinIcon name="analysis" size={17}/></i><span><b>사용</b><small>안전한 숫자만 계산</small></span></article>
    </section>:null}

    {!compact?<section className="collectionOpsKpis" aria-label="수집 운영 요약">
      <article><i><HarinIcon name="checklist" size={18}/></i><small>정상 채널</small><strong>{Number(summary.ready_channels||0)}개</strong><span>연결·최근 수집 정상</span></article>
      <article><i><HarinIcon name="database" size={18}/></i><small>이전 자료 사용</small><strong>{Number(summary.previous_data_channels||0)}개</strong><span>새 수집 실패 시 보존</span></article>
      <article><i><HarinIcon name="shield" size={18}/></i><small>품질 확인</small><strong>{Number(summary.quality_problems||0)}건</strong><span>열린 알림 {Number(summary.open_alerts||0)}건</span></article>
      <article><i><HarinIcon name="sync" size={18}/></i><small>쿠팡 작업 중</small><strong>{Number(summary.active_queue||0)}건</strong><span>대기·실행·재시도</span></article>
      <article className={summary.long_failures?'danger':''}><i><HarinIcon name="warning" size={18}/></i><small>장기 실패</small><strong>{Number(summary.long_failures||0)}건</strong><span>고정 IP 작업 확인</span></article>
    </section>:null}

    {!compact&&recommendations.length?<section className="collectionOpsPriority"><header><span>지금 먼저 확인</span><b>{recommendations.length}개 작업</b></header><div>{recommendations.slice(0,4).map((item,index)=><article key={`${item.platform}-${item.title}-${index}`}><em>{index+1}</em><span><b>{item.title}</b><small>{item.message}</small></span></article>)}</div></section>:null}

    <section className="collectionOpsChannels" aria-label="채널별 수집 상태">
      {channels.map(channel=><ChannelCollectionCard key={channel.platform} channel={channel} onRun={onSync[channel.platform]} onConnect={onConnect[channel.platform]} busy={Boolean(syncing[channel.platform])}/>)}
    </section>

    <details className="collectionOpsDetail">
      <summary><span><b>연결 권한·작업 큐·품질검사·파일 업로드 상세</b><small>연결 권한이나 실패 원인을 자세히 확인할 때만 펼치세요.</small></span><em>상세 도구 열기</em></summary>
      <div>{children}</div>
    </details>
  </section>;
}
