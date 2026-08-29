'use client';

import Phase28OperationalDashboard,{Phase28ChannelRows,Phase28ChannelLogo} from './operational-dashboard.js';

function CsPriorities({items=[]}){
  if(!items.length)return <p className="phase28OperationalEmpty">지금 바로 답할 문의는 없어요.</p>;
  return <div className="phase28RailPriorityRows">{items.map(item=><article key={item.id}>
    <Phase28ChannelLogo platform={item.platform} size="compact"/>
    <span><strong>{item.title}</strong><small>{item.excerpt}</small></span>
    <em className={item.dueCode==='OVERDUE'?'urgent':item.dueCode==='TODAY'?'watch':'calm'}>{item.dueLabel}</em>
  </article>)}</div>;
}

function CsSummary({summary={}}){
  return <div className="phase28RailSummaryRows">
    <article><span>답변 대기</span><strong>{Number(summary.unanswered||0).toLocaleString('ko-KR')}건</strong><small>문의 답변 초안 확인</small></article>
    <article><span>클레임</span><strong>{Number(summary.claims||0).toLocaleString('ko-KR')}건</strong><small>취소·반품·교환 상태</small></article>
    <article><span>주문 연결</span><strong>{Number(summary.linkedOrders||0).toLocaleString('ko-KR')}건</strong><small>주문과 함께 판단 가능</small></article>
    <article><span>처리 완료</span><strong>{Number(summary.completed||0).toLocaleString('ko-KR')}건</strong><small>이력에서 다시 확인</small></article>
  </div>;
}

export default function Phase28CsDashboard({model={},aiPanel,children}){
  const hero=model.hero||{};
  const summary=model.summary||{};
  const pulseItems=[
    {id:'overdue',icon:'alerts',kicker:'1순위',label:'기한 초과',value:`${Number(hero.overdueCount||0).toLocaleString('ko-KR')}건`,tone:hero.overdueCount?'urgent':'calm'},
    {id:'unanswered',icon:'customer',kicker:'2순위',label:'미답변 문의',value:`${Number(hero.unansweredCount||0).toLocaleString('ko-KR')}건`,tone:'watch'},
    {id:'claims',icon:'shield',kicker:'3순위',label:'클레임',value:`${Number(hero.claimCount||0).toLocaleString('ko-KR')}건`,tone:'calm'},
    {id:'linked',icon:'orders',kicker:'판단 근거',label:'주문 연결',value:`${Number(summary.linkedOrders||0).toLocaleString('ko-KR')}건`,tone:'complete'}
  ];
  const tabs=[
    {id:'priority',label:'우선 처리',content:<><header className="phase28RailPanelHeader"><span>고객 대화</span><h2>기한과 주문을 같이 봐요</h2><p>오래 기다린 고객부터 처리할 수 있게 정리했습니다.</p></header><CsPriorities items={model.priorities}/></>},
    {id:'summary',label:'업무 요약',content:<CsSummary summary={summary}/>},
    {id:'channels',label:'채널 상태',content:<><header className="phase28RailPanelHeader"><span>채널 연결</span><h2>문의 수집 경계를 확인해요</h2><p>채널별 권한과 수집 상태를 따로 표시합니다.</p></header><Phase28ChannelRows channels={model.channels}/></>},
    {id:'ai',label:'고객·CS AI',content:aiPanel||<p className="phase28OperationalEmpty">분석 근거를 준비하고 있어요.</p>}
  ];
  return <Phase28OperationalDashboard
    kind="cs"
    context="채널 문의와 클레임 · 마지막 문의 먼저 표시"
    titleBefore="오늘 답할 문의는 "
    titleAccent={`${Number(hero.activeCount||0).toLocaleString('ko-KR')}건`}
    titleAfter="이에요."
    summary={hero.summary||'문의 내용과 주문 상태를 함께 보고 필요한 답변부터 처리합니다.'}
    asOf={hero.asOf}
    heroFact={{label:'먼저 답할 항목',value:`기한 초과 ${Number(hero.overdueCount||0).toLocaleString('ko-KR')}건`,description:hero.unansweredCount?`미답변 문의 ${hero.unansweredCount.toLocaleString('ko-KR')}건이 남아 있습니다.`:'답변 대기 문의가 없습니다.',tone:hero.overdueCount?'urgent':'calm'}}
    pulseLabel="고객 응답 우선순위"
    pulseItems={pulseItems}
    tabs={tabs}
    railLabel="CS 보조석"
  >{children}</Phase28OperationalDashboard>;
}
