const statusLabel={READY:'확인 가능',PARTIAL:'참고용',STALE:'자료 오래됨',BLOCKED:'확인 필요',UNAVAILABLE:'연결 확인',NO_DATA:'자료 없음',RISK:'개선 필요',CHECK_REQUIRED:'연결 필요',PREVIEW:'미리보기',NO_CANDIDATE:'대상 없음'};

function money(value){return value==null?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;}
function count(value){return value==null?'확인 필요':Math.round(Number(value)).toLocaleString('ko-KR');}
function formatMetric(metric){
  if(metric.value==null)return '확인 필요';
  if(metric.unit==='원')return money(metric.value);
  if(metric.unit==='%')return `${Number(metric.value).toLocaleString('ko-KR',{maximumFractionDigits:1})}%`;
  return `${count(metric.value)}${metric.unit||''}`;
}
function signed(value,unit='%'){
  if(value==null)return '비교 불가';
  const number=Number(value);
  return `${number>0?'+':''}${number.toLocaleString('ko-KR',{maximumFractionDigits:1})}${unit}`;
}

export default function NaverExecutiveBoard({board}){
  if(!board)return null;
  const current=board.current||{},previous=board.previous||{};
  const comparisons=[
    ['광고 ROAS',current.roas,previous.roas,'%'],['클릭률',current.ctr,previous.ctr,'%'],['구매전환율',current.cvr,previous.cvr,'%'],
    ['클릭비',current.cpc,previous.cpc,'원'],['광고 전환 객단가',current.aov,previous.aov,'원']
  ];
  return <section className="naverExecutiveBoard">
    <header className="naverExecutiveHero">
      <div><span>PHASE 12-3 · NAVER AD EXECUTIVE BOARD</span><h1>네이버 광고 경영판</h1><p>광고센터 성과와 실제 주문·정산·이익을 섞지 않고, 지금 막힌 지점과 다음 행동을 보여줍니다.</p></div>
      <div><small>분석 기간</small><b>{board.period_start||'확인 필요'} → {board.period_end||'확인 필요'}</b><em>목표 광고 ROAS {board.target_roas}%</em></div>
    </header>

    <details className="naverExecutiveHelp">
      <summary><span><b>도움말 · 숫자가 왜 서로 다른가요?</b><small>광고 ROAS, 정산 ROAS, MER, 공헌이익을 쉬운 예시로 설명합니다.</small></span><em>열기 ＋</em></summary>
      <div>
        <p><b>광고센터 ROAS</b>는 네이버가 광고 전환으로 잡은 매출입니다. 광고비 10만원, 전환매출 25만원이면 250%입니다.</p>
        <p><b>정산 ROAS</b>는 그 주문의 취소·반품을 빼고 실제 정산된 돈으로 다시 보는 값입니다. 주문 연결키가 없으면 계산하지 않습니다.</p>
        <p><b>MER</b>는 확인된 전체 실주문 순매출을 광고비로 나눕니다. 광고가 직접 만든 주문이라고 단정하지 않는 경영 지표입니다.</p>
        <p><b>공헌이익</b>은 매출에서 원가·수수료·배송비·광고비를 뺀 돈입니다. 원가가 부족하면 0원이 아니라 확인 필요입니다.</p>
      </div>
    </details>

    <div className="naverExecutiveKpis">{(board.metrics||[]).map(metric=><article className={`naverExecutiveKpi ${String(metric.status||'').toLowerCase()}`} key={metric.key}>
      <header><span>{metric.label}</span><em>{statusLabel[metric.status]||metric.status}</em></header>
      <strong>{formatMetric(metric)}</strong>
      <p>{metric.description}</p><small>{metric.reason||metric.evidence}</small>
      {metric.reason&&metric.evidence&&<i>{metric.evidence}</i>}
    </article>)}</div>

    <section className="naverExecutivePanel">
      <header><div><span>7일 비교</span><h2>이번 주에 무엇이 달라졌나요?</h2></div><p>현재 7일과 바로 앞 7일을 같은 방식으로 비교합니다.</p></header>
      <div className="naverCompareGrid">{comparisons.map(([label,now,before,unit])=>{
        const change=before>0?(now-before)/before*100:null;
        return <article key={label}><span>{label}</span><b>{unit==='원'?money(now):now==null?'확인 필요':`${Number(now).toFixed(1)}${unit}`}</b><small>직전 {unit==='원'?money(before):before==null?'확인 필요':`${Number(before).toFixed(1)}${unit}`}</small><em className={change<0?'down':'up'}>{signed(change)}</em></article>;
      })}</div>
    </section>

    <section className="naverExecutivePanel">
      <header><div><span>세 가지 성장 손잡이</span><h2>목표 ROAS까지 무엇을 바꿔야 하나요?</h2></div><p>현재 → 목표 → 필요한 변화 순서입니다. 이 화면은 입찰가를 바꾸지 않습니다.</p></header>
      <div className="naverLeverGrid">{(board.levers||[]).map(lever=><article className={lever.status==='BLOCKED'?'blocked':''} key={lever.key}>
        <header><b>{lever.label}</b><em>{statusLabel[lever.status]||lever.status}</em></header>
        <div><span><small>현재</small><strong>{lever.unit==='원'?money(lever.current):lever.current==null?'확인 필요':`${Number(lever.current).toFixed(1)}%`}</strong></span><i>→</i><span><small>목표</small><strong>{lever.unit==='원'?money(lever.target):lever.target==null?'확인 필요':`${Number(lever.target).toFixed(1)}%`}</strong></span></div>
        <p>{lever.change_rate==null?'안전 계산에 필요한 자료를 먼저 채워야 합니다.':`필요 변화 ${signed(lever.change_rate)}`}</p><small>{lever.action}</small>
      </article>)}</div>
    </section>

    <section className="naverExecutivePanel">
      <header><div><span>병목 진단</span><h2>지금 가장 먼저 볼 곳: {board.bottleneck?.label}</h2></div><p>{board.bottleneck?.reason}</p></header>
      <div className="naverBottleneckFlow">{(board.stages||[]).map((stage,index)=><div className={`${String(stage.status||'').toLowerCase()} ${board.bottleneck?.key===stage.key?'focus':''}`} key={stage.key}>
        <span>{index+1}. {stage.label}</span><b>{stage.value==null?(stage.note||'확인 필요'):`${stage.unit==='원'?money(stage.value):`${count(stage.value)}${stage.unit}`}`}</b>
        {stage.subvalue!=null&&<small>{stage.subunit==='%'?`${Number(stage.subvalue).toFixed(1)}%`:stage.subvalue}</small>}{index<(board.stages||[]).length-1&&<i>→</i>}
      </div>)}</div>
    </section>

    <div className="naverExecutiveBottom">
      <section className="naverExecutivePanel budget">
        <header><div><span>예산 이동 미리보기</span><h2>낭비 후보를 줄이면</h2></div><em>{statusLabel[board.budget_preview?.status]}</em></header>
        <div className="naverBudgetNumbers"><span><small>검토 후보</small><b>{count(board.budget_preview?.candidate_count)}개</b></span><i>→</i><span><small>절감 예상</small><b>{money(board.budget_preview?.saved_spend)}</b></span><i>→</i><span><small>필요 추가매출</small><b>{money(board.budget_preview?.required_revenue)}</b></span></div>
        <p>필요 주문 약 {board.budget_preview?.required_orders??'확인 필요'}건 · 재고와 출고 가능 여부는 실행 전 확인해야 합니다.</p><small>{board.budget_preview?.note}</small>
      </section>
      <section className="naverExecutivePanel trust">
        <header><div><span>데이터 신뢰</span><h2>{board.data_trust?.status==='READY'?'계산 가능':'일부 판단 보류'}</h2></div><em>{board.data_trust?.status}</em></header>
        <ul>{(board.data_trust?.notes||[]).map(note=><li key={note}>{note}</li>)}</ul>
        <footer><span>광고 자료 {board.data_trust?.ad_age_days??'?'}일 전</span><span>원가 반영률 {board.data_trust?.cost_coverage_rate==null?'확인 필요':`${Number(board.data_trust.cost_coverage_rate).toFixed(1)}%`}</span></footer>
      </section>
    </div>
  </section>;
}
