'use client';

import './harin-main-v8.css';
import { useEffect, useMemo, useState } from 'react';
import { HarinIcon } from '../_design-system/harin-icon.js';
import { HarinMetricChart } from '../_design-system/harin-ui.js';

const STATUS_LABEL={READY:'바로 처리',BLOCKED:'먼저 확인',ON_HOLD:'보류',COMPLETED:'완료'};
const SOURCE_LABEL={TRUST_GATE:'재무 신뢰',ALERT:'운영 알림',DATA_QUALITY:'데이터 품질',ACTION:'실행 결정',PACING:'월 목표'};
const PLATFORM_LABEL={ALL:'전체',NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24'};
const SCHEDULE_LABEL={DONE:'완료',NOW:'지금',UPCOMING:'예정'};

const QUICK_COMMANDS=[
  { id:'orders', title:'송장 발급·주문 처리', description:'오늘 출고할 판매자배송 확인', view:'orders', icon:'truck', keywords:'주문 배송 송장 출고 우체국' },
  { id:'cs', title:'오늘 CS 확인', description:'문의·취소·반품·교환 요청', view:'cs', icon:'customer', keywords:'고객 문의 반품 교환 취소' },
  { id:'inventory', title:'재고 위험 확인', description:'품절·저재고·재입고 판단', view:'inventory', icon:'inventory', keywords:'재고 품절 저재고 발주 상품' },
  { id:'collection', title:'수집 오류 다시 보기', description:'채널 상태·실패·재시도 확인', view:'collection', icon:'sync', keywords:'수집 오류 실패 재시도 채널' },
  { id:'notifications', title:'열린 알림 처리', description:'운영 예외와 경고 확인', view:'notifications', icon:'alerts', keywords:'알림 경고 예외 위험' },
  { id:'changes', title:'변경 승인 확인', description:'사장님 결정이 필요한 변경안', view:'changes', icon:'approvals', keywords:'승인 변경 실행 결정' },
  { id:'keyword', title:'키워드 성과 보기', description:'실제 검색어와 광고 판단', view:'keyword', icon:'keyword', keywords:'키워드 검색어 광고 성과' },
  { id:'knowledge', title:'AI 기준자료 관리', description:'페이지별 분석에 쓰는 자료', view:'knowledge', icon:'ai', keywords:'AI 분석 기준자료 학습' }
];

const won=value=>value==null?'판단 보류':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');

function greetingMessages(total, generatedAt) {
  const hour=generatedAt?Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(new Date(generatedAt))):12;
  if(!total)return ['안녕하세요, 급하게 처리할 일은 없어요.','오늘 운영 상태가 차분해요. 중요한 숫자만 살펴볼까요?','좋아요, 밀린 일 없이 다음 성장 기회를 볼 수 있어요.'];
  const hello=hour<12?'좋은 아침이에요.':hour<18?'안녕하세요.':'오늘도 수고 많았어요.';
  return [
    `${hello} 오늘 확인할 일이 ${count(total)}건 있어요.`,
    `오늘도 차근차근, ${count(total)}건만 순서대로 끝내볼까요?`,
    `지금 가장 중요한 일부터 보면, 확인할 항목은 ${count(total)}건이에요.`
  ];
}

function RotatingGreeting({ total, generatedAt }) {
  const messages=useMemo(()=>greetingMessages(total,generatedAt),[total,generatedAt]);
  const [index,setIndex]=useState(0);
  useEffect(()=>{
    setIndex(0);
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return undefined;
    const timer=window.setInterval(()=>setIndex(current=>(current+1)%messages.length),7000);
    return()=>window.clearInterval(timer);
  },[messages]);
  return <h1 key={`${messages[index]}-${index}`} className="mainGreeting">{messages[index]}</h1>;
}

function CutoffClock({ cutoffAt, cutoffState, generatedAt }) {
  // Keep the server render and the first browser render identical. The live clock
  // starts only after hydration so a few milliseconds of drift cannot create a
  // React text mismatch at the minute boundary.
  const initialNow=Number.isFinite(new Date(generatedAt||0).getTime())?new Date(generatedAt||0).getTime():0;
  const [now,setNow]=useState(initialNow);
  useEffect(()=>{setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
  const remaining=Math.max(0,new Date(cutoffAt||0).getTime()-now);
  const hours=Math.floor(remaining/3600000),minutes=Math.floor((remaining%3600000)/60000);
  const before=cutoffState==='BEFORE'&&remaining>0;
  return <div className={`mainCutoffClock ${before?'before':'after'}`}>
    <span><HarinIcon name="truck" size={18}/>15시 당일출고</span>
    <strong>{before?`${hours}시간 ${minutes}분 남음`:'오늘 접수 마감'}</strong>
    <small>{before?'지금 들어온 주문부터 출고 순서로 보여드려요.':'15시 이후 주문은 다음 출고 순서로 분리해 확인하세요.'}</small>
  </div>;
}

function QuickCommandBar({ daily, onOpen }) {
  const [query,setQuery]=useState('');
  const [focused,setFocused]=useState(false);
  const counts=Object.fromEntries((daily.groups||[]).map(item=>[item.id,item.count]));
  const normalized=query.trim().toLowerCase();
  const results=QUICK_COMMANDS.filter(item=>!normalized||`${item.title} ${item.description} ${item.keywords}`.toLowerCase().includes(normalized)).slice(0,5);
  const run=item=>{setQuery('');setFocused(false);onOpen(item);};
  return <section className={`mainQuickCommand${focused||query?' open':''}`} aria-label="화면별 빠른 명령">
    <div className="mainQuickSearch">
      <HarinIcon name="search" size={21}/>
      <input type="search" value={query} readOnly onFocus={()=>{setFocused(false);window.dispatchEvent(new CustomEvent('harin:open-command'));}} onClick={()=>window.dispatchEvent(new CustomEvent('harin:open-command'))} placeholder="송장 발급, 재고 위험, 오늘 CS처럼 검색해보세요" aria-label="전역 빠른 명령 열기"/>
      <kbd>Ctrl K</kbd>
    </div>
    <div className="mainQuickSuggestions" aria-label="추천 빠른 명령">
      {QUICK_COMMANDS.slice(0,4).map(item=><button type="button" key={item.id} onClick={()=>run(item)}><HarinIcon name={item.icon} size={17}/><span>{item.title}</span>{counts[item.id]>0?<em>{counts[item.id]}</em>:null}</button>)}
    </div>
    {focused||query?<div className="mainQuickResults"><header><b>{normalized?'검색 결과':'자주 쓰는 화면'}</b><small>{results.length}개</small></header>{results.map(item=><button type="button" key={item.id} onMouseDown={event=>event.preventDefault()} onClick={()=>run(item)}><i><HarinIcon name={item.icon} size={19}/></i><span><b>{item.title}</b><small>{item.description}</small></span><HarinIcon name="chevron" size={16}/></button>)}{!results.length?<p>이 명령을 찾지 못했어요. 메뉴 이름으로 다시 검색해보세요.</p>:null}</div>:null}
  </section>;
}

function TaskGroups({ daily, onOpen }) {
  return <section className="mainTaskGroups" aria-label="오늘의 할 일 분류">{(daily.groups||[]).map(item=><button type="button" className={item.count?'active':''} onClick={()=>onOpen(item)} key={item.id}><i><HarinIcon name={item.icon} size={20}/></i><span><b>{item.label}</b><small>{item.description}</small></span><strong>{count(item.count)}<em>건</em></strong></button>)}</section>;
}

function SmartSchedule({ schedule={}, onOpen }) {
  return <article className="mainScheduleCard"><header><div><span>오늘 시간표</span><h2>오늘 운영 순서</h2></div><small>{schedule.date||'오늘'} · 서울 시간</small></header><div>{(schedule.items||[]).map(item=><button type="button" className={String(item.status).toLowerCase()} onClick={()=>onOpen(item)} key={item.id}><i>{item.status==='DONE'?'✓':item.status==='NOW'?'●':'○'}</i><time>{item.time}</time><span><b>{item.label}</b><small>{item.description}</small></span><em>{SCHEDULE_LABEL[item.status]||item.status}</em></button>)}</div></article>;
}

function ExceptionInbox({ daily, onOpen }) {
  const items=daily.exceptions||[];
  return <article className="mainExceptionInbox"><header><div><span>운영 예외함</span><h2>놓치면 안 되는 예외</h2></div><b>{count(daily.exception_total)}건</b></header><div>{items.map(item=><button type="button" className={item.tone||'warning'} onClick={()=>onOpen(item)} key={item.id}><i><HarinIcon name={item.tone==='error'?'alerts':'shield'} size={18}/></i><span><small>{item.label} · {PLATFORM_LABEL[item.platform]||item.platform}</small><b>{item.title}</b><em>{item.reason}</em></span><HarinIcon name="chevron" size={16}/></button>)}{!items.length?<div className="mainExceptionEmpty"><i><HarinIcon name="shield" size={22}/></i><span><b>지금 열린 예외가 없어요.</b><small>새 오류가 생기면 채널별로 이곳에 모아드릴게요.</small></span></div>:null}</div>{daily.exception_total>items.length?<button type="button" className="mainExceptionMore" onClick={()=>onOpen({view:'collection'})}>나머지 {count(daily.exception_total-items.length)}건 모두 보기</button>:null}</article>;
}

function TodayActions({ actions=[], onOpen }) {
  const actionButton=item=>item.view==='product'?'상품 확인':item.view==='collection'?'수집 확인':item.view==='notifications'?'알림 처리':item.view==='reports'?'결정 확인':'상세 보기';
  return <section className="mainActionSection"><header><div><span>오늘의 우선 행동 · 3개</span><h2>먼저 하면 좋은 일</h2></div><small>긴급도·매출 영향·자료 신뢰도를 서버에서 함께 계산했어요.</small></header><div>{actions.map((item,index)=><article className={String(item.decision_status||'READY').toLowerCase()} key={item.id}><i>{index+1}</i><section><span>{SOURCE_LABEL[item.source]||item.source} · {PLATFORM_LABEL[item.platform]||item.platform}</span><h3>{item.title}</h3><p>{item.reason}</p><small>{item.next_step}</small></section><aside><em>{STATUS_LABEL[item.decision_status]||item.decision_status}</em><button type="button" onClick={()=>onOpen(item)}>{actionButton(item)}</button></aside></article>)}{!actions.length?<div className="mainActionEmpty">지금 바로 처리할 위험 행동은 없어요. 채널 상태와 성장 상품만 가볍게 확인하세요.</div>:null}</div></section>;
}

function BusinessPacing({ metrics={}, likelihood={}, month, onOpenTargets }) {
  const cards=[
    ['이번 달 목표',metrics.target==null?'입력 필요':won(metrics.target),month||'이번 달'],
    ['현재 매출',won(metrics.current),metrics.progressRate==null?'자료 확인 필요':`목표의 ${metrics.progressRate.toFixed(1)}%`],
    ['월말 예상',won(metrics.forecast),'현재 일평균 속도 기준'],
    ['목표까지 부족',won(metrics.shortage),'현재 매출과 목표의 차이'],
    ['하루 필요 매출',won(metrics.requiredDailyRevenue),'남은 기간 매일 필요한 금액']
  ];
  return <section className="mainPacing"><header><div><span>월간 매출 속도</span><h2>이번 달 매출 속도</h2></div><button type="button" onClick={onOpenTargets}>목표·계산 근거</button></header><div className="mainPacingGrid">{cards.map(([label,value,description],index)=><article className={index===4?'focus':''} key={label}><small>{label}</small><strong>{value}</strong><span>{description}</span></article>)}</div><section className="mainPacingVisual" data-core-visualization="main-pacing"><HarinMetricChart kind="bar" title="현재 속도와 목표를 비교해요" description="현재 매출, 지금 속도로 예상한 월말 매출, 입력한 목표를 같은 기준으로 봅니다." labels={['현재 매출','월말 예상','이번 달 목표']} series={[{label:'매출 금액',tone:'primary',values:[metrics.current==null?null:metrics.current,metrics.forecast==null?null:metrics.forecast,metrics.target==null?null:metrics.target]}]} valueFormatter={won}/></section><aside className={String(likelihood.code||'check_required').toLowerCase()}><i><HarinIcon name="analysis" size={20}/></i><span><small>목표 달성 가능성</small><b>{likelihood.label||'계산 대기'}</b><em>{likelihood.description}</em></span></aside></section>;
}

function ChannelHealth({ channels=[], onOpen }) {
  return <article className="mainChannelHealth"><header><div><span>채널 수집 상태</span><h2>채널 상태</h2></div><button type="button" onClick={()=>onOpen({view:'collection',platform:'ALL'})}>수집센터</button></header><div>{channels.map(item=><button type="button" className={String(item.status||'WAITING').toLowerCase()} onClick={()=>onOpen({view:'insight',platform:item.platform})} key={item.platform}><i/><span><b>{PLATFORM_LABEL[item.platform]}</b><small>{item.summary||'수집 기록을 확인하세요.'}</small></span><em>{item.label}</em></button>)}</div></article>;
}

function ProductAndCashflow({ products={}, cashflow={}, onOpen }) {
  return <div className="mainLowerGrid"><article className="mainProductSignals"><header><div><span>상품 성과 신호</span><h2>성장·위험 상품</h2></div><button type="button" onClick={()=>onOpen({view:'product',platform:'ALL'})}>상품관리</button></header><div><section><b>성장 상품</b>{(products.growth||[]).slice(0,2).map(item=><button type="button" onClick={()=>onOpen({view:'product',platform:'ALL'})} key={item.key}><span><strong>{item.name}</strong><small>{item.platform} · 최근 7일 {won(item.currentRevenue)}</small></span><em>+{item.growthRate==null?'신규':`${item.growthRate.toFixed(1)}%`}</em></button>)}{!products.growth?.length?<small>비교 가능한 성장 상품이 아직 없어요.</small>:null}</section><section><b>위험 상품</b>{(products.risk||[]).slice(0,2).map(item=><button type="button" onClick={()=>onOpen({view:'inventory'})} key={item.key}><span><strong>{item.name}</strong><small>{item.riskReason}</small></span><em>확인</em></button>)}{!products.risk?.length?<small>현재 감지된 급감·재고 위험이 없어요.</small>:null}</section></div></article><article className={`mainCashflow ${String(cashflow.status||'CHECK_REQUIRED').toLowerCase()}`}><header><div><span>앞으로 30일</span><h2>30일 운영 예상</h2></div><HarinIcon name="settlement" size={21}/></header><div><span><small>예상 매출 유입</small><b>{won(cashflow.expectedInflow)}</b></span><span><small>예상 광고비</small><b>{cashflow.expectedAdOutflow==null?'판단 보류':`- ${won(cashflow.expectedAdOutflow)}`}</b></span><span className="balance"><small>비용 반영 후</small><b>{won(cashflow.expectedBalance)}</b></span></div><p>{cashflow.description}</p><small>실제 통장 잔액이 아닌 현재 판매 속도의 운영 예상치입니다.</small></article></div>;
}

export default function HarinMainCommandCenter({ center={}, onOpen, onOpenTargets }) {
  const daily=center.daily||{},metrics=center.metrics||{},likelihood=center.likelihood||{};
  return <section className="mainV8CommandCenter">
    <section className="mainDailyHero">
      <div className="mainDailyCopy"><span className="mainPhasePill"><HarinIcon name="sparkles" size={16}/>오늘의 업무 요약</span><RotatingGreeting total={daily.total} generatedAt={daily.generated_at}/><p>중복을 뺀 실제 주문·CS·재고·결정·오류만 세었어요. 중요한 일부터 누르면 바로 해당 화면으로 이동합니다.</p><QuickCommandBar daily={daily} onOpen={onOpen}/></div>
      <aside><CutoffClock cutoffAt={daily.schedule?.cutoff_at} cutoffState={daily.schedule?.cutoff_state} generatedAt={daily.generated_at}/><div className="mainGoalPulse"><span>목표 달성 가능성</span><strong>{likelihood.label||'계산 대기'}</strong><small>{likelihood.description}</small><button type="button" onClick={onOpenTargets}>매출 목표 확인</button></div></aside>
      <div className="mainHeroOrb one"/><div className="mainHeroOrb two"/>
    </section>
    <TaskGroups daily={daily} onOpen={onOpen}/>
    <div className="mainOperationsGrid"><SmartSchedule schedule={daily.schedule} onOpen={onOpen}/><ExceptionInbox daily={daily} onOpen={onOpen}/></div>
    <TodayActions actions={center.actions||[]} onOpen={onOpen}/>
    <BusinessPacing metrics={metrics} likelihood={likelihood} month={center.month} onOpenTargets={onOpenTargets}/>
    <div className="mainHealthGrid"><ChannelHealth channels={center.channels||[]} onOpen={onOpen}/><ProductAndCashflow products={center.products||{}} cashflow={center.cashflow||{}} onOpen={onOpen}/></div>
  </section>;
}
