'use client';

import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import styles from './home-page.module.css';

const channelNames={NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'};
const statusLabels={READY:'정상',PARTIAL:'일부 확인',BLOCKED:'확인 필요',SETUP_REQUIRED:'설정 필요',ERROR:'수집 오류',FAILED:'수집 실패',STALE:'갱신 필요',PREVIOUS:'이전 자료',WAITING:'수집 대기',RUNNING:'수집 중'};

function formatWon(metric){
  if(!metric||!['READY','PARTIAL'].includes(metric.status)||typeof metric.value!=='number')return metric?.status==='SETUP_REQUIRED'?'설정 필요':'확인 필요';
  return `${Math.round(metric.value).toLocaleString('ko-KR')}원`;
}

function formatAsOf(value){
  if(!value)return '기준시각 확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}

function metricEvidence(metric){
  if(metric?.status==='READY')return '실제 운영 근거 · 자세히 보기';
  if(metric?.status==='PARTIAL')return '현재 근거의 예상값 · 계산 보기';
  return statusLabels[metric?.status]||'근거 자료 확인 필요';
}

function MainMetrics({metrics,onNavigate}){
  const items=[
    {id:'current',label:'현재 매출',metric:metrics.current},
    {id:'forecast',label:'월말 예상 매출',metric:metrics.forecast},
    {id:'balance',label:'30일 예상 잔액',metric:metrics.balance},
    {id:'target',label:'이번 달 목표',metric:metrics.target}
  ];
  return <section className={styles.executiveBoard} aria-label="이번 달 경영 현황">
    <header className={styles.boardHeader}><div><h2>이번 달, 목표까지 얼마나 남았을까요?</h2><p>매출뿐 아니라 실제 이익과 현금 흐름까지 함께 봐요.</p></div><span>{formatAsOf(metrics.current?.asOf)}</span></header>
    <div className={styles.boardMetrics}>{items.map(item=><button type="button" key={item.id} className={styles.boardMetric} onClick={()=>onNavigate({view:'settlement'})}><span>{item.label}</span><strong>{formatWon(item.metric)}</strong><small>{metricEvidence(item.metric)}</small></button>)}</div>
    <div className={styles.vitalityStage}>
      <div className={styles.vitalityHeader}><div><strong>하린식품 경영 활력선</strong><span>실제 자료가 준비된 흐름과 확인할 지점을 함께 표시해요.</span></div><b>{metrics.current?.status==='READY'?'실제 자료 기준':'근거 확인 필요'}</b></div>
      <div className={styles.vitalityTrack} aria-label="경영 지표 근거 상태">
        <svg viewBox="0 0 840 90" preserveAspectRatio="none" aria-hidden="true"><path d="M30 66 C135 5 205 68 300 42 S470 12 555 48 S690 82 810 22"/></svg>
        <div className={styles.vitalityPoints}>{items.map(item=><span key={item.id} data-ready={['READY','PARTIAL'].includes(item.metric?.status)?'true':'false'}><i/><strong>{item.label}</strong><small>{statusLabels[item.metric?.status]||'확인 필요'}</small></span>)}</div>
      </div>
    </div>
  </section>;
}

function OperatingLine({items,onNavigate}){
  return <section className={styles.operatingLine} aria-label="오늘의 운영선">
    <div className={styles.operatingSummary}><strong>오늘의 운영선</strong><span>실제 수집 일정과 운영 상태를 시간 순서로 확인해요.</span></div>
    <div className={styles.operatingTrack} role="list">{items.length?items.map(item=><button type="button" role="listitem" key={item.id} data-state={String(item.status||'UPCOMING').toLowerCase()} onClick={()=>onNavigate({view:item.view||'main',workspace:item.workspace||null})}><i/><span><time>{item.time||'시간 확인'}</time><strong>{item.label||'운영 일정 확인'}</strong></span></button>):<div className={styles.emptyState}><strong>운영 일정을 확인하고 있어요.</strong><span>수집 근거가 준비되면 시간 순서로 표시합니다.</span></div>}</div>
  </section>;
}

function MainDecisionList({items,blocked,onNavigate}){
  return <article className={styles.decisionSheet}>
    <header className={styles.sectionHeader}><div><h2>오늘 사장님이 결정할 일</h2><p>매출과 운영에 영향이 큰 순서대로 정리했어요.</p></div><button type="button" onClick={()=>onNavigate({view:'reports'})}>전체 업무 보기</button></header>
    <div className={styles.decisionList}>{items.length?items.map(item=><button type="button" className={styles.decisionRow} key={item.id} onClick={()=>onNavigate(item)}><b>{item.rank}</b><span><strong>{item.title}</strong><small>{item.reason}</small></span><em><small>{item.status==='READY'?'다음 행동':'선행 확인'}</small><strong>{item.nextStep||'내용 보기'}</strong></em></button>):<div className={styles.emptyState}><strong>{blocked?'운영 건수 근거를 확인해주세요.':'새로 결정할 일이 없어요.'}</strong><span>{blocked?'자료가 준비되면 우선순위대로 표시합니다.':'채널 상태와 매출 흐름만 확인하면 됩니다.'}</span></div>}</div>
  </article>;
}

function MainSignalSheets({growth,risks,onNavigate}){
  const growthRows=growth.slice(0,3);
  const riskRows=risks.slice(0,3);
  return <div className={styles.signalSheets}>
    <article className={styles.signalSheet}><header className={styles.sectionHeader}><div><h2>이번 주 성장 동력</h2><p>판매 근거가 있는 상품 신호만 보여드려요.</p></div><button type="button" onClick={()=>onNavigate('product-analysis')}>상품분석</button></header><div>{growthRows.length?growthRows.map((item,index)=><button type="button" key={item.key||index} onClick={()=>onNavigate({view:'product',workspace:'catalog'})}><span className={styles.signalMark}>↗</span><span><strong>{item.name||'상품 확인'}</strong><small>{item.growthRate==null?'성장 근거 확인':`이전 7일보다 +${item.growthRate}%`}</small></span><em>{typeof item.currentRevenue==='number'?`${Math.round(item.currentRevenue).toLocaleString('ko-KR')}원`:'보기'}</em></button>):<div className={styles.emptyState}><strong>비교 가능한 성장 신호를 모으고 있어요.</strong><span>판매 자료가 쌓이면 이곳에 표시합니다.</span></div>}</div></article>
    <article className={styles.signalSheet}><header className={styles.sectionHeader}><div><h2>지금 볼 위험 신호</h2><p>확인할 근거를 정상 숫자와 섞지 않아요.</p></div><button type="button" onClick={()=>onNavigate({view:'reports'})}>진단 보기</button></header><div>{riskRows.length?riskRows.map((item,index)=><button type="button" key={item.key||index} onClick={()=>onNavigate({view:'product',workspace:'catalog'})}><span className={`${styles.signalMark} ${styles.riskMark}`}>!</span><span><strong>{item.name||'상품 확인'}</strong><small>{item.riskReason||'판매 흐름 확인 필요'}</small></span><em>확인</em></button>):<div className={styles.emptyState}><strong>현재 표시할 상품 위험이 없어요.</strong><span>자료가 부족한 항목은 별도로 확인 필요 상태를 유지합니다.</span></div>}</div></article>
  </div>;
}

function MainDecisionRail({model,aiPanel,onNavigate}){
  const hero=model.hero||{};
  const firstDecision=model.decisions?.[0]||null;
  const channels=model.channels||[];
  const risks=model.risks||[];
  return <div className={styles.railStack}>
    <section className={`${styles.railCard} ${styles.railBrief}`}><header><h2>오늘의 판단</h2><span>운영 브리핑</span></header><div className={styles.remaining}><strong>{hero.taskCount==null?'—':hero.taskCount}</strong><span>{hero.taskCount==null?'건수 확인 필요':'건 남았어요'}</span></div><p>{firstDecision?.title||hero.summary||'지금 바로 처리할 결정은 없습니다.'}</p><button type="button" onClick={()=>firstDecision&&onNavigate(firstDecision)} disabled={!firstDecision}>첫 번째 결정 시작</button></section>
    <section className={styles.railCard}><header><h2>지금 막힐 수 있는 것</h2><span>{risks.length?`주의 ${risks.length}건`:'현재 신호'}</span></header><div className={styles.riskList}>{risks.length?risks.slice(0,3).map((item,index)=><button type="button" key={item.key||index} onClick={()=>onNavigate({view:'product',workspace:'catalog'})}><i/><span><strong>{item.name||'위험 신호 확인'}</strong><small>{item.riskReason||'근거 확인 필요'}</small></span><em>보기</em></button>):<div className={styles.emptyState}><strong>확정된 위험 신호가 없어요.</strong><span>자료 공백은 확인 필요로 유지합니다.</span></div>}</div></section>
    <section className={styles.railCard}><header><h2>판매 채널 체온</h2><span>{formatAsOf(hero.asOf)}</span></header><div className={styles.channelList}>{channels.length?channels.map(item=>{const brand=String(item.platform||'').toUpperCase();return <button type="button" key={brand} onClick={()=>onNavigate({view:'insight',workspace:'overview',platform:brand})}><Phase28ChannelLogo brand={brand}/><span><strong>{channelNames[brand]||brand||'채널 확인'}</strong><small>{item.summary||'최근 수집 상태 확인'}</small></span><em data-ready={['READY','RUNNING'].includes(item.status)?'true':'false'}>{item.label||statusLabels[item.status]||'확인 필요'}</em></button>}):<div className={styles.emptyState}><strong>채널 수집 상태를 확인하고 있어요.</strong><span>연결되지 않은 채널은 설정 필요로 표시합니다.</span></div>}</div></section>
    <section className={styles.railCard}><header><h2>목표 달성 가능성</h2><span>{model.likelihood?.code==='HIGH'?'안정':model.likelihood?.code==='LOW'?'주의':'관찰'}</span></header><strong className={styles.railValue}>{model.likelihood?.label||'확인 필요'}</strong><p>{model.likelihood?.description||'목표와 매출 근거를 확인한 뒤 계산할 수 있어요.'}</p><button type="button" onClick={()=>onNavigate({view:'settlement'})}>목표·근거 확인</button></section>
    <section className={styles.railCard}><header><h2>돈이 남는 흐름</h2><span>{model.trust?.status==='READY'?'근거 확인':'판단 보류'}</span></header><strong className={styles.railValue}>{formatWon(model.metrics?.balance)}</strong><p>{model.cashflow?.description||'재무 근거를 확인한 뒤 예상 잔액을 계산합니다.'}</p><button type="button" onClick={()=>onNavigate({view:'settlement'})}>정산·비용 보기</button></section>
    {aiPanel?<details className={`${styles.railCard} ${styles.aiCard}`}><summary><span>오늘의 AI 경영 메모</span><em>{aiPanel.execution_enabled?'사용 중':'비용 0원'}</em></summary><div><strong>{aiPanel.title||'페이지별 분석'}</strong><p>{aiPanel.summary||'실제 운영 자료가 준비되면 분석 근거를 확인할 수 있어요.'}</p><button type="button" onClick={()=>onNavigate('knowledge')}>분석 설정 보기</button></div></details>:null}
  </div>;
}

export default function Phase28HomePage({model={},aiPanel=null,onNavigate=()=>{}}){
  const hero=model.hero||{};
  const taskCount=typeof hero.taskCount==='number'?hero.taskCount:null;
  return <section className={styles.home} data-phase28-page="home">
    <div className={styles.intro}>
      <Phase28PageHeading context={`실제 운영 자료 · ${formatAsOf(hero.asOf)}`} title={taskCount===null?'오늘 운영 건수는 ':taskCount>0?'오늘 처리할 일은 ':'오늘 회사는 '} accent={taskCount===null?'확인 필요':taskCount>0?`${taskCount}건`:'순항 중'} suffix="이에요." summary={hero.summary||'운영 자료를 확인하고 있어요.'}/>
      <aside className={styles.companyStatus}><span>오늘 회사 상태</span><strong>{taskCount===null?'확인 필요':hero.exceptionCount>0?'집중 운영':'순항 중'}</strong><div><i data-tone="good"/>매출 근거<i data-tone={hero.exceptionCount>0?'warn':'good'}/>운영 상태</div><small>{hero.exceptionCount>0?`예외 ${hero.exceptionCount}건을 먼저 확인하세요.`:taskCount===null?'수집 기준시각과 운영 근거를 확인해주세요.':'운영 근거가 보호된 상태예요.'}</small></aside>
    </div>
    <MainMetrics metrics={model.metrics||{}} onNavigate={onNavigate}/>
    <OperatingLine items={model.schedule||[]} onNavigate={onNavigate}/>
    <Phase28RightRailLayout
      label="사장님 판단 보조석"
      rail={<MainDecisionRail model={model} aiPanel={aiPanel} onNavigate={onNavigate}/>}
    >
      <div className={styles.mainColumn}><MainDecisionList items={model.decisions||[]} blocked={hero.status==='BLOCKED'} onNavigate={onNavigate}/><MainSignalSheets growth={model.growth||[]} risks={model.risks||[]} onNavigate={onNavigate}/></div>
    </Phase28RightRailLayout>
  </section>;
}
