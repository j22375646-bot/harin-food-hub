'use client';

import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import styles from './home-page.module.css';

const channelNames={NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'};
const statusLabels={READY:'정상',PARTIAL:'일부 확인',BLOCKED:'확인 필요',SETUP_REQUIRED:'설정 필요',ERROR:'수집 오류',FAILED:'수집 실패',STALE:'갱신 필요',PREVIOUS:'이전 자료',WAITING:'수집 대기',RUNNING:'수집 중'};

function metricReady(metric){return Boolean(metric&&['READY','PARTIAL'].includes(metric.status)&&typeof metric.value==='number');}
function formatWon(metric){
  if(!metricReady(metric))return metric?.status==='SETUP_REQUIRED'?'설정 필요':'확인 필요';
  return `${Math.round(metric.value).toLocaleString('ko-KR')}원`;
}
function formatPlainWon(value){return typeof value==='number'?`${Math.round(value).toLocaleString('ko-KR')}원`:'확인 필요';}
function formatAsOf(value){
  if(!value)return '기준시각 확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function formatDate(value){
  if(!value)return '날짜 확인';
  const date=new Date(`${String(value).slice(0,10)}T00:00:00+09:00`);
  if(Number.isNaN(date.getTime()))return '날짜 확인';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short'}).format(date);
}
function formatDeadline(deadline={}){
  if(typeof deadline.remainingMinutes!=='number')return '남은 시간 확인 필요';
  if(deadline.remainingMinutes<=0)return '마감 시각 확인';
  const hours=Math.floor(deadline.remainingMinutes/60);
  const minutes=deadline.remainingMinutes%60;
  return hours?`${hours}시간 ${minutes}분 남음`:`${minutes}분 남음`;
}
function metricEvidence(metric){
  if(metric?.status==='READY')return '실제 운영 근거 · 자세히 보기';
  if(metric?.status==='PARTIAL')return '현재 근거의 예상값 · 계산 보기';
  return statusLabels[metric?.status]||'근거 자료 확인 필요';
}

function GoalDialog({settings={},onClose,onSaved}){
  const [form,setForm]=useState({
    revenueTarget:settings.revenueTarget??'',
    adBudget:settings.adBudget??0,
    targetRoas:settings.targetRoas??250,
    notes:''
  });
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const month=settings.month||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date());
  const update=event=>setForm(current=>({...current,[event.target.name]:event.target.value}));
  async function save(event){
    event.preventDefault();
    if(saving)return;
    setSaving(true);setError('');
    try{
      const idempotencyKey=`main-target-${month}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
      const previewResponse=await fetch('/api/targets',{
        method:'POST',headers:{'content-type':'application/json','idempotency-key':idempotencyKey},
        body:JSON.stringify({month,platform:'ALL',revenueTarget:Number(form.revenueTarget),adBudget:Number(form.adBudget),targetRoas:Number(form.targetRoas),notes:form.notes})
      });
      const preview=await previewResponse.json();
      if(!previewResponse.ok||!preview.ok||!preview.request?.id)throw new Error(preview.error||'목표 변경안을 만들지 못했습니다.');
      const confirmResponse=await fetch(`/api/financial-changes/${preview.request.id}`,{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'CONFIRM_EXECUTE',confirm:true,note:'메인에서 월 목표 설정'})
      });
      const confirmation=await confirmResponse.json();
      if(!confirmResponse.ok||!confirmation.ok||!confirmation.applied||!confirmation.verified)throw new Error(confirmation.error||'저장 후 검증이 완료되지 않았습니다.');
      onSaved('목표를 저장했고 월 매출과 예상치를 다시 계산했어요.');
    }catch(cause){setError(cause?.message||'목표를 저장하지 못했습니다.');}
    finally{setSaving(false);}
  }
  const content=<div className={styles.goalDialogBackdrop} role="presentation" onMouseDown={event=>event.target===event.currentTarget&&onClose()}>
    <section className={styles.goalDialog} role="dialog" aria-modal="true" aria-labelledby="monthly-goal-title">
      <header><div><span>MONTHLY GOAL</span><h2 id="monthly-goal-title">{month} 목표 설정</h2><p>한 번 확인하면 저장·검증 후 월 매출과 예상치를 자동으로 다시 계산해요.</p></div><button type="button" onClick={onClose} aria-label="목표 설정 닫기">×</button></header>
      <form onSubmit={save}>
        <label><span>월 매출 목표</span><input name="revenueTarget" type="number" min="1" step="10000" required value={form.revenueTarget} onChange={update} placeholder="예: 10000000"/></label>
        <label><span>월 광고 예산</span><input name="adBudget" type="number" min="0" step="10000" required value={form.adBudget} onChange={update}/></label>
        <label><span>목표 ROAS</span><span className={styles.goalInputUnit}><input name="targetRoas" type="number" min="0" step="10" required value={form.targetRoas} onChange={update}/><i>%</i></span></label>
        <label className={styles.goalNotes}><span>메모</span><input name="notes" maxLength="500" value={form.notes} onChange={update} placeholder="예: 9월 프로모션 반영"/></label>
        {error?<p className={styles.goalError} role="alert">{error}</p>:null}
        <footer><button type="button" onClick={onClose} disabled={saving}>취소</button><button type="submit" disabled={saving}>{saving?'저장·검증 중…':'확인하고 목표 적용'}</button></footer>
      </form>
    </section>
  </div>;
  return typeof document==='undefined'?content:createPortal(content,document.body);
}

function CompanyStatus({hero,deadline}){
  const exceptionCount=Number(hero.exceptionCount)||0;
  return <aside className={styles.companyStatus} aria-label="오늘 회사 상태">
    <div className={styles.companyState}><span>오늘 회사 상태</span><strong>{hero.taskCount==null?'확인 필요':exceptionCount>0?'집중 운영':'순항 중'}</strong></div>
    <div className={styles.statusMatrix}>
      <span><i data-tone="good"/>매출 근거</span>
      <span><i data-tone={exceptionCount>0?'warn':'good'}/>운영 상태</span>
      <span><i data-tone={hero.status==='BLOCKED'?'warn':'good'}/>자료 수집</span>
      <span><i data-tone="good"/>채널 연결</span>
    </div>
    <div className={styles.deadlineClock}><span>다음 운영 마감</span><strong>{deadline?.label||'마감 확인 필요'}</strong><small>{formatDeadline(deadline)}</small></div>
  </aside>;
}

function MainMetrics({metrics,targetSettings,onNavigate,onGoalSaved}){
  const [goalOpen,setGoalOpen]=useState(false);
  const items=[
    {id:'current',label:'현재 매출',metric:metrics.current},
    {id:'forecast',label:'월말 예상 매출',metric:metrics.forecast},
    {id:'profit',label:'이번 달 실제 이익',metric:metrics.profit}
  ];
  const progress=metricReady(metrics.current)&&metricReady(metrics.target)&&metrics.target.value>0?Math.max(0,Math.min(100,metrics.current.value/metrics.target.value*100)):0;
  return <section className={styles.executiveBoard} aria-label="이번 달 경영 현황">
    <header className={styles.boardHeader}><div><span>EXECUTIVE BOARD</span><h2>이번 달, 목표까지 얼마나 남았을까요?</h2><p>매출이 들어와 실제 이익으로 남는 흐름을 한눈에 봐요.</p></div><small>{formatAsOf(metrics.current?.asOf)}</small></header>
    <div className={styles.boardMetrics}>{items.map(item=><button type="button" key={item.id} className={styles.boardMetric} onClick={()=>onNavigate({view:'settlement'})}><span>{item.label}</span><strong>{formatWon(item.metric)}</strong><small>{metricEvidence(item.metric)}</small></button>)}</div>
    <div className={styles.vitalityStage}>
      <div className={styles.vitalityHeader}><div><strong>하린식품 경영 활력선</strong><span>돈이 들어와 실제 이익으로 남는 흐름이에요.</span></div><b>{metricReady(metrics.current)?'실제 자료 기준':'근거 확인 필요'}</b></div>
      <div className={styles.vitalityTrack} aria-label="경영 지표 근거 상태">
        <svg viewBox="0 0 840 90" preserveAspectRatio="none" aria-hidden="true"><path d="M30 66 C135 5 205 68 300 42 S470 12 555 48 S690 82 810 22"/><path className={styles.pulsePath} d="M30 66 C135 5 205 68 300 42 S470 12 555 48 S690 82 810 22"/></svg>
        <div className={styles.vitalityPoints}>
          <span data-tone={metricReady(metrics.current)?'good':'check'}><i/><strong>매출</strong><small>{metricReady(metrics.current)?'실제 집계':'확인 필요'}</small></span>
          <span data-tone="check"><i/><strong>광고 효율</strong><small>근거 확인</small></span>
          <span data-tone={metricReady(metrics.profit)?'good':'check'}><i/><strong>실제 이익</strong><small>{statusLabels[metrics.profit?.status]||'확인 필요'}</small></span>
          <span data-tone={progress>0?'good':'check'}><i/><strong>월말 목표</strong><small>{progress>0?`${progress.toFixed(1)}% 도달`:'확인 필요'}</small></span>
        </div>
      </div>
    </div>
    <div className={styles.goalControl}>
      <span><b>{metricReady(metrics.target)?`목표 ${formatWon(metrics.target)}`:'이번 달 목표가 아직 없어요.'}</b><small>{metricReady(metrics.target)?`현재 ${progress.toFixed(1)}% 도달 · 저장 시 자동 재계산`:'저장하면 월 매출과 예상치를 자동으로 다시 계산해요.'}</small></span>
      <button type="button" onClick={()=>setGoalOpen(true)}>{metricReady(metrics.target)?'월 목표 수정':'이번 달 목표 설정'}</button>
    </div>
    {goalOpen?<GoalDialog settings={targetSettings} onClose={()=>setGoalOpen(false)} onSaved={message=>{setGoalOpen(false);onGoalSaved(message);}}/>:null}
  </section>;
}

function OperatingLine({items,onNavigate}){
  return <section className={styles.operatingLine} aria-label="오늘의 운영선">
    <div className={styles.operatingSummary}><span>지난 접속 이후</span><strong>{items.length?`확인할 운영 일정 ${items.length}개`:'새 운영 일정 확인 중'}</strong><small>실제 수집 일정과 운영 상태를 시간 순서로 확인해요.</small><button type="button" onClick={()=>onNavigate('changes')}>지난 접속과 비교</button></div>
    <div className={styles.operatingTrack} role="list">{items.length?items.map(item=><button type="button" role="listitem" key={item.id} data-state={String(item.status||'UPCOMING').toLowerCase()} onClick={()=>onNavigate({view:item.view||'main',workspace:item.workspace||null})}><i/><span><time>{item.time||'시간 확인'}</time><strong>{item.label||'운영 일정 확인'}</strong></span></button>):<div className={styles.emptyState}><strong>운영 일정을 확인하고 있어요.</strong><span>수집 근거가 준비되면 시간 순서로 표시합니다.</span></div>}</div>
  </section>;
}

function MainDecisionList({items,blocked,onNavigate}){
  return <article className={styles.decisionSheet}>
    <header className={styles.sectionHeader}><div><span>DECISION DESK</span><h2>오늘 사장님이 결정할 일</h2><p>매출과 운영에 영향이 큰 순서대로 정리했어요.</p></div><button type="button" onClick={()=>onNavigate({view:'reports'})}>전체 업무 보기</button></header>
    <div className={styles.decisionList}>{items.length?items.map(item=><button type="button" className={styles.decisionRow} key={item.id} onClick={()=>onNavigate(item)}><b>{item.rank}</b><span><strong>{item.title}</strong><small>{item.reason}</small></span><em><small>{item.status==='READY'?'다음 행동':'선행 확인'}</small><strong>{item.nextStep||'내용 보기'}</strong></em></button>):<div className={styles.emptyState}><strong>{blocked?'운영 건수 근거를 확인해주세요.':'새로 결정할 일이 없어요.'}</strong><span>{blocked?'자료가 준비되면 우선순위대로 표시합니다.':'채널 상태와 매출 흐름만 확인하면 됩니다.'}</span></div>}</div>
  </article>;
}

function CashFlowSheet({cashflow,onNavigate}){
  const rows=cashflow?.rows||[];
  const maximum=Math.max(1,...rows.map(item=>typeof item.value==='number'?Math.abs(item.value):0));
  return <article className={styles.cashSheet}>
    <header className={styles.sectionHeader}><div><span>CASH FLOW</span><h2>돈이 얼마나 남았나요?</h2><p>결제 매출에서 비용과 실제 이익까지 같은 기준으로 봐요.</p></div><button type="button" onClick={()=>onNavigate({view:'settlement'})}>정산·비용 보기</button></header>
    <div className={styles.cashRows}>{rows.length?rows.map((item,index)=><div key={item.key||index} data-profit={item.key==='profit'?'true':'false'}><span>{item.label}</span><em><i style={{width:`${typeof item.value==='number'?Math.max(4,Math.abs(item.value)/maximum*100):0}%`}}/></em><strong>{formatPlainWon(item.value)}</strong></div>):<div className={styles.emptyState}><strong>현금 흐름 근거를 확인하고 있어요.</strong><span>자료가 준비되면 비용과 실제 이익을 분리해 표시합니다.</span></div>}</div>
  </article>;
}

function GrowthHorizon({growth,sources={},forecast,onNavigate}){
  const growthRows=(growth||[]).slice(0,3);
  const days=forecast?.days||[];
  const maximum=Math.max(1,...days.map(item=>Number(item.revenue)||0));
  const openGrowthSource=destination=>onNavigate(destination==='insights'?{view:'insight',workspace:'overview'}:'product-analysis');
  return <section className={styles.growthHorizon}>
    <article className={styles.growthPanel}><header className={styles.sectionHeader}><div><span>GROWTH HORIZON</span><h2>이번 주 성장 동력</h2><p>저장된 인사이트와 상품분석의 실제 근거만 연결해요.</p></div><nav className={styles.growthNav} aria-label="성장 동력 근거 페이지"><button type="button" onClick={()=>openGrowthSource('insights')}>인사이트</button><button type="button" onClick={()=>openGrowthSource('product-analysis')}>상품분석</button></nav></header><div className={styles.growthSources} aria-label="연결된 성장 근거"><button type="button" onClick={()=>openGrowthSource('insights')}><span>인사이트</span><strong>{sources.insights?.reportCount?`${sources.insights.reportCount}개 저장`:'근거 확인 필요'}</strong></button><button type="button" onClick={()=>openGrowthSource('product-analysis')}><span>상품분석</span><strong>{sources.productAnalysis?.reportCount?`${sources.productAnalysis.reportCount}개 저장`:'근거 확인 필요'}</strong></button></div><div className={styles.growthRows}>{growthRows.length?growthRows.map((item,index)=><button type="button" key={item.key||index} onClick={()=>openGrowthSource(item.destination)}><b>{item.source==='INSIGHT'?'◎':'↗'}</b><span><i>{item.sourceLabel||'판매 근거'}</i><strong>{item.name||'상품 확인'}</strong><small>{item.evidence||item.metricLabel||(item.growthRate==null?'성장 근거 확인':`이전 7일보다 +${item.growthRate}%`)}</small></span><em>{item.metricLabel||formatPlainWon(item.currentRevenue)}</em></button>):<div className={styles.emptyState}><strong>저장된 성장 근거를 확인하고 있어요.</strong><span>인사이트 보고서나 상품분석표가 저장되면 이곳에 연결합니다.</span></div>}</div></article>
    <article className={styles.forecastPanel}><header><div><span>다음 7일 전망</span><strong>{formatPlainWon(forecast?.expectedRevenue)}</strong></div><em>{forecast?.status==='PARTIAL'?'예상값':'확인 필요'}</em></header><div className={styles.forecastChart} aria-label="다음 7일 매출 전망">{days.length?days.map(item=><span key={item.date}><i style={{height:`${Math.max(12,(Number(item.revenue)||0)/maximum*100)}%`}}/><small>{formatDate(item.date).replace('요일','')}</small></span>):<div className={styles.emptyState}><strong>7일 전망을 계산할 근거가 부족해요.</strong><span>최근 판매 자료가 준비되면 예상값으로 표시합니다.</span></div>}</div><p>{forecast?.basis||'최근 판매 근거 확인 필요'}</p></article>
  </section>;
}

function CashCalendar({items}){
  return <section className={styles.railCard}><header><h2>앞으로 7일 입출금</h2><span>{items?.length?`${items.length}건`:'확인 중'}</span></header><div className={styles.cashCalendar}>{items?.length?items.map((item,index)=><div key={`${item.date}-${item.platform}-${index}`}><Phase28ChannelLogo brand={item.platform} compact/><span><strong>{channelNames[item.platform]||item.platform||'공통'}</strong><small>{formatDate(item.date)} · {item.status}</small></span><em>{formatPlainWon(item.amount)}</em></div>):<div className={styles.emptyState}><strong>예정된 입출금 근거가 없어요.</strong><span>정산 일정이 준비되면 날짜별로 표시합니다.</span></div>}</div></section>;
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
    <CashCalendar items={model.cashCalendar||[]}/>
    <details className={`${styles.railCard} ${styles.foldCard}`}><summary><span>변경 후 좋아진 것</span><em>{model.changeEffects?.length?`${model.changeEffects.length}건`:'비교 준비'}</em></summary><div>{model.changeEffects?.length?model.changeEffects.map((item,index)=><p key={item.id||index}>{item.summary||item.title}</p>):<p>현재 메인에서 불러온 변경 효과가 없어요.</p>}<button type="button" onClick={()=>onNavigate('changes')}>변경 기록 보기</button></div></details>
    {aiPanel?<details className={`${styles.railCard} ${styles.foldCard}`}><summary><span>오늘의 AI 경영 메모</span><em>{aiPanel.execution_enabled?'사용 중':'비용 0원'}</em></summary><div><strong>{aiPanel.title||'페이지별 분석'}</strong><p>{aiPanel.summary||'실제 운영 자료가 준비되면 분석 근거를 확인할 수 있어요.'}</p><button type="button" onClick={()=>onNavigate('knowledge')}>분석 설정 보기</button></div></details>:null}
  </div>;
}

export default function Phase28HomePage({model={},aiPanel=null,onNavigate=()=>{},onRefresh=()=>{}}){
  const hero=model.hero||{};
  const taskCount=typeof hero.taskCount==='number'?hero.taskCount:null;
  const [goalMessage,setGoalMessage]=useState('');
  return <section className={styles.home} data-phase28-root="true" data-phase28-page="home">
    <div className={styles.intro}>
      <div className={styles.introCopy}><Phase28PageHeading context={`실제 운영 자료 · ${formatAsOf(hero.asOf)}`} title={taskCount===null?'오늘 운영 건수는 ':taskCount>0?'오늘 처리할 일은 ':'오늘 회사는 '} accent={taskCount===null?'확인 필요':taskCount>0?`${taskCount}건`:'순항 중'} suffix="이에요." summary={hero.summary||'운영 자료를 확인하고 있어요.'}/><div className={styles.todayNote}><span>오늘의 메모</span><strong>{hero.note||'등록된 메모 없음'}</strong></div></div>
      <CompanyStatus hero={hero} deadline={model.deadline||{}}/>
    </div>
    <Phase28RightRailLayout label="사장님 판단 보조석" rail={<MainDecisionRail model={model} aiPanel={aiPanel} onNavigate={onNavigate}/> }>
      <div className={styles.mainColumn}>
        <MainMetrics metrics={model.metrics||{}} targetSettings={model.targetSettings||{}} onNavigate={onNavigate} onGoalSaved={message=>{setGoalMessage(message);onRefresh();}}/>
        {goalMessage?<p className={styles.goalSaved} role="status">{goalMessage}</p>:null}
        <OperatingLine items={model.schedule||[]} onNavigate={onNavigate}/>
        <div className={styles.decisionDesk}><MainDecisionList items={model.decisions||[]} blocked={hero.status==='BLOCKED'} onNavigate={onNavigate}/><CashFlowSheet cashflow={model.cashflow||{}} onNavigate={onNavigate}/></div>
        <GrowthHorizon growth={model.growth||[]} sources={model.growthSources||{}} forecast={model.forecast||{}} onNavigate={onNavigate}/>
      </div>
    </Phase28RightRailLayout>
  </section>;
}
