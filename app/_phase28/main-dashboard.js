'use client';

import {useState} from 'react';
import HarinIcon from '../_design-system/harin-icon.js';
import './phase28-main.css';

const brandName={NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'};
const brandMark={NAVER:'N',CAFE24:'24',COUPANG:'C'};
const statusLabel={READY:'정상',PARTIAL:'일부 확인',FAILED:'수집 실패',STALE:'갱신 필요',PREVIOUS:'이전 자료',WAITING:'수집 대기',RUNNING:'수집 중'};

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

function MetricCard({icon,label,metric,note,tone='blue',onClick}){
  const body=<><span className={`phase28MetricIcon ${tone}`}><HarinIcon name={icon} size={22}/></span><span className="phase28MetricCopy"><small>{label}</small><strong>{formatWon(metric)}</strong><em>{metric?.status==='READY'?note:metric?.status==='PARTIAL'?`${note} · 추정값`:'근거 자료 확인 필요'}</em></span></>;
  return onClick?<button type="button" className={`phase28MetricCard ${tone}`} onClick={onClick}>{body}<HarinIcon name="chevron" size={18}/></button>:<article className={`phase28MetricCard ${tone}`}>{body}</article>;
}

function Schedule({items,onOpen}){
  return <section className="phase28Route" aria-label="오늘의 운영선">
    <header><div><h2>오늘의 운영선</h2><p>하루에 꼭 확인할 흐름을 시간 순서로 정리했어요.</p></div><span>실제 운영 기준</span></header>
    <div className="phase28RouteTrack" role="list">{items.length?items.map(item=><button type="button" role="listitem" className={`phase28RouteStep ${String(item.status||'UPCOMING').toLowerCase()}`} key={item.id} onClick={()=>onOpen({view:item.view||'main'})}><i/><span><time>{item.time}</time><strong>{item.label}</strong></span></button>):<p className="phase28Empty">운영 일정 근거를 확인하고 있어요.</p>}</div>
  </section>;
}

function Decisions({items,onOpen}){
  return <article className="phase28Sheet phase28DecisionSheet">
    <header><div><h2>오늘 사장님이 결정할 일</h2><p>매출과 운영에 영향이 큰 순서대로 정리했어요.</p></div><button type="button" onClick={()=>onOpen({view:'reports'})}>전체 업무 보기</button></header>
    <div className="phase28DecisionList">{items.length?items.map(item=><button type="button" className="phase28Decision" key={item.id} onClick={()=>onOpen(item)}><b>{item.rank}</b><span><strong>{item.title}</strong><small>{item.reason}</small></span><em>{item.status==='READY'?'확인하기':'선행 확인'}</em><HarinIcon name="chevron" size={18}/></button>):<div className="phase28Empty"><HarinIcon name="check" size={22}/><span><strong>새로 결정할 일이 없어요.</strong><small>채널 상태와 매출 흐름만 확인하면 됩니다.</small></span></div>}</div>
  </article>;
}

function ChannelRows({channels,onOpen}){
  return <div className="phase28ChannelRows">{channels.map(item=>{
    const platform=String(item.platform||'').toUpperCase();
    const tone=['READY','RUNNING'].includes(item.status)?'ready':['FAILED','STALE'].includes(item.status)?'warning':'check';
    return <button type="button" key={platform} onClick={()=>onOpen({view:'insight',platform})}><span className="phase28Brand" data-brand={platform.toLowerCase()} role="img" aria-label={brandName[platform]}>{brandMark[platform]||'·'}</span><span><strong>{brandName[platform]||platform}</strong><small>{item.summary||'최근 수집 상태 확인'}</small></span><em className={tone}><i/>{item.label||statusLabel[item.status]||'확인 필요'}</em></button>;
  })}</div>;
}

function GrowthRows({growth,risks,onOpen}){
  const rows=[...growth.map(item=>({...item,tone:'growth',caption:item.growthRate==null?'새 성장 신호':`이전 7일보다 +${item.growthRate}%`})),...risks.map(item=>({...item,tone:'risk',caption:item.riskReason||'판매 흐름 확인 필요'}))].slice(0,4);
  return <div className="phase28GrowthRows">{rows.length?rows.map((item,index)=><button type="button" key={item.key||index} onClick={()=>onOpen({view:'product',platform:item.platform})}><span className={item.tone}><HarinIcon name={item.tone==='growth'?'growth':'warning'} size={19}/></span><span><strong>{item.name||'상품 확인'}</strong><small>{item.caption}</small></span><em>{item.currentRevenue?`${Math.round(item.currentRevenue).toLocaleString('ko-KR')}원`:'보기'}</em></button>):<div className="phase28Empty"><span><strong>비교 가능한 상품 신호를 모으고 있어요.</strong><small>판매 자료가 쌓이면 성장과 위험 상품을 표시합니다.</small></span></div>}</div>;
}

export default function Phase28MainDashboard({model={},aiPanel,onOpen=()=>{},onOpenTargets=()=>{}}){
  const [railOpen,setRailOpen]=useState(true);
  const hero=model.hero||{};
  const metrics=model.metrics||{};
  return <section className={`phase28Main phase28Main--${hero.tone||'steady'}`} data-phase28-page="home">
    <header className="phase28Hero">
      <div><span className="phase28Context"><i/>실제 운영 자료 · {formatAsOf(hero.asOf)}</span><h1>{hero.headline?.includes('정리')?'오늘 처리할 일은 ':''}<em className="page-title-accent">{hero.taskCount>0?`${hero.taskCount}건`:hero.headline||'순항 중'}</em>{hero.taskCount>0?'이에요.':''}</h1><p>{hero.summary}</p></div>
      <aside><span>오늘 회사 상태</span><strong>{hero.exceptionCount>0?'확인 필요':hero.taskCount>0?'집중 운영':'순항 중'}</strong><small>{hero.exceptionCount>0?`예외 ${hero.exceptionCount}건을 먼저 확인하세요.`:'운영 근거가 보호된 상태예요.'}</small></aside>
    </header>

    <section className="phase28Metrics" aria-label="이번 달 핵심 금액">
      <MetricCard icon="target" label="이번 달 목표" metric={metrics.target} note="입력한 월 목표" tone="blue" onClick={onOpenTargets}/>
      <MetricCard icon="growth" label="현재 매출" metric={metrics.current} note="세 채널 결제 기준" tone="mint"/>
      <MetricCard icon="analysis" label="월말 예상 매출" metric={metrics.forecast} note="현재 일평균 속도" tone="apricot"/>
      <MetricCard icon="settlement" label="30일 예상 잔액" metric={metrics.balance} note="원가·수수료 반영" tone="mauve"/>
    </section>

    <Schedule items={model.schedule||[]} onOpen={onOpen}/>

    <div className={`phase28MainLayout${railOpen?'':' rail-collapsed'}`}>
      <div className="phase28MainCore">
        <Decisions items={model.decisions||[]} onOpen={onOpen}/>
        <div className="phase28TwinSheets">
          <article className="phase28Sheet"><header><div><h2>판매 채널 체온</h2><p>채널별 마지막 성공 자료와 현재 상태예요.</p></div><button type="button" onClick={()=>onOpen({view:'collection'})}>수집 상태</button></header><ChannelRows channels={model.channels||[]} onOpen={onOpen}/></article>
          <article className="phase28Sheet"><header><div><h2>이번 주 상품 신호</h2><p>성장과 위험을 같은 기준으로 비교했어요.</p></div><button type="button" onClick={()=>onOpen({view:'product'})}>상품 보기</button></header><GrowthRows growth={model.growth||[]} risks={model.risks||[]} onOpen={onOpen}/></article>
        </div>
      </div>

      <aside className="phase28MainRail" aria-label="사장님 판단 보조석">
        <button type="button" className="phase28RailControl" aria-expanded={railOpen} aria-controls="phase28-main-rail-content" onClick={()=>setRailOpen(value=>!value)}><HarinIcon name={railOpen?'chevron':'sidebarExpand'} size={18}/><span>{railOpen?'판단 보조석 접기':'판단 보조석 열기'}</span></button>
        <div id="phase28-main-rail-content" className="phase28RailContent" aria-hidden={!railOpen}>
          <section className="phase28RailBrief"><span>오늘의 판단</span><strong>{hero.taskCount||0}<small>건 남았어요</small></strong><p>{model.decisions?.[0]?.title||'지금 바로 처리할 결정은 없습니다.'}</p><button type="button" onClick={()=>model.decisions?.[0]&&onOpen(model.decisions[0])} disabled={!model.decisions?.length}>첫 번째 결정 시작</button></section>
          <section className="phase28RailCard"><header><h2>목표 달성 가능성</h2><span>{model.likelihood?.code==='HIGH'?'안정':model.likelihood?.code==='LOW'?'위험':'관찰'}</span></header><strong>{model.likelihood?.label||'확인 필요'}</strong><p>{model.likelihood?.description}</p><button type="button" onClick={onOpenTargets}>목표·근거 확인</button></section>
          <section className="phase28RailCard"><header><h2>돈이 남는 흐름</h2><span>{model.trust?.status==='READY'?'근거 확인':'판단 보류'}</span></header><strong>{formatWon(metrics.balance)}</strong><p>{model.cashflow?.description}</p><button type="button" onClick={()=>onOpen({view:'settlement'})}>정산·비용 보기</button></section>
          {aiPanel?<details className="phase28RailCard phase28AiCard"><summary><span><HarinIcon name="ai" size={18}/>오늘의 AI 경영 메모</span><em>열기</em></summary><div>{aiPanel}</div></details>:null}
        </div>
      </aside>
    </div>
  </section>;
}
