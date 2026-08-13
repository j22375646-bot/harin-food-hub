'use client';

import { useState } from 'react';

const count=value=>value==null?'계산 대기':`${Number(value).toLocaleString('ko-KR')}명`;
const number=value=>Number(value||0).toLocaleString('ko-KR');
const won=value=>value==null?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const percent=value=>value==null?'계산 대기':`${Number(value).toFixed(1)}%`;
const date=value=>value?String(value).slice(0,10):'날짜 없음';
const platformLabel={ALL:'전체',NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'};
const actionStatusLabel={PLANNED:'실행 예정',ON_HOLD:'보류',EXECUTED:'실행 완료',CANCELLED:'취소',REVIEWED:'검토 완료'};
const changeStatusLabel={PREVIEWED:'미리보기',APPROVED:'승인됨',EXECUTING:'실행 중',EXECUTED:'실행됨',VERIFIED:'검증 완료',VERIFICATION_FAILED:'검증 불일치',STALE:'원본 변경됨',REJECTED:'반려',FAILED:'실행 실패',ROLLBACK_REQUESTED:'복구 중',ROLLED_BACK:'복구 완료',ROLLBACK_FAILED:'복구 실패',EXPIRED:'만료'};
const changeTypeLabel={PRODUCT_COST:'상품 원가',CHANNEL_COST:'채널 비용',SHIPPING_RULE:'배송 규칙',BUSINESS_TARGET:'매출 목표'};

function Waiting({children='계산 대기'}){return <span className="phase7Waiting">{children}</span>;}

function CustomerTab({customer}){
  const summary=customer?.summary||{};
  const enough=summary.lifecycle_status==='READY';
  return <div className="phase7TabPanel">
    <section className={`phase7Coverage ${enough?'ready':'waiting'}`}>
      <div><span>{enough?'판단 가능':'자료를 더 모으는 중'}</span><b>{customer?.period?.days||0}일 주문 이력 · 반복 간격 {number(summary.interval_samples)}개</b></div>
      <p>{enough?'재구매 예정과 휴면 가능 고객을 계산할 수 있습니다.':'최소 90일 주문 이력과 반복 구매 간격 3개가 쌓이기 전에는 휴면·재구매 예정 숫자를 억지로 만들지 않습니다.'}</p>
    </section>

    <section className="phase7Kpis" aria-label="고객 재구매 요약">
      <article><span>저장 이력 내 1회 구매 고객</span><strong>{count(summary.one_order_customers)}</strong><small>전체 생애 첫 구매가 아닌 현재 수집범위 기준</small></article>
      <article><span>재구매 고객</span><strong>{count(summary.repeat_customers)}</strong><small>재구매율 {percent(summary.repeat_rate)}</small></article>
      <article><span>재구매 예정</span><strong>{summary.due_customers==null?<Waiting/>:count(summary.due_customers)}</strong><small>평소 구매시기가 가까운 고객</small></article>
      <article><span>휴면 가능</span><strong>{summary.dormant_customers==null?<Waiting/>:count(summary.dormant_customers)}</strong><small>평소보다 오래 구매하지 않은 고객</small></article>
    </section>

    <div className="phase7Columns">
      <section className="phase7Panel">
        <div className="phase7PanelHead"><div><span>PRODUCT CYCLE</span><h3>상품별 재구매 주기</h3></div><small>동일 고객 반복 간격 3개 이상</small></div>
        {customer?.products?.length?<div className="phase7TableWrap"><table><thead><tr><th>상품</th><th>주문</th><th>재구매 고객</th><th>대표 주기</th><th>예정 고객</th></tr></thead><tbody>{customer.products.slice(0,12).map(product=><tr key={product.name}><td><b>{product.name}</b><small>반복 간격 {number(product.interval_samples)}개</small></td><td>{number(product.orders)}건</td><td>{number(product.repeat_customers)}명</td><td>{product.cycle_days?`${product.cycle_days}일`:<Waiting/>}</td><td>{product.due_customers==null?<Waiting/>:`${number(product.due_customers)}명`}</td></tr>)}</tbody></table></div>:<p className="phase7Empty">주문 상품 자료가 없습니다.</p>}
      </section>

      <section className="phase7Panel">
        <div className="phase7PanelHead"><div><span>ACQUISITION</span><h3>유입경로와 주문 연결</h3></div><small>{customer?.acquisition?.status==='VISITS_ONLY'?'방문만 수집됨':'연결 상태 확인'}</small></div>
        {customer?.acquisition?.status==='VISITS_ONLY'&&<div className="phase7Notice"><b>채널별 주문·매출은 아직 판단하지 않아요</b><p>현재 유입경로 자료에는 방문자만 있고 어떤 방문이 주문으로 이어졌는지 정보가 없습니다.</p></div>}
        <div className="phase7SourceList">{(customer?.acquisition?.rows||[]).slice(0,8).map(source=><div key={source.key}><span><b>{source.label}</b><small>방문 비중 {source.visitor_share}%</small></span><strong>{number(source.visitors)}명</strong><em>{source.order_attribution?`${number(source.orders)}건 주문`:'주문 연결 안 됨'}</em></div>)}</div>
        <details className="phase7Details"><summary>주문 접점 참고 보기</summary><div>{(customer?.order_places||[]).map(place=><p key={place.label}><b>{place.label}</b><span>{number(place.orders)}건</span></p>)}</div><small>주문 접점은 유입경로가 아니므로 광고 성과로 해석하지 않습니다.</small></details>
      </section>
    </div>

    <section className="phase7Recommendations">{(customer?.recommendations||[]).map(item=><article key={item.title}><span>{item.level==='WAIT'?'판단 보류':'자료 연결'}</span><div><b>{item.title}</b><p>{item.body}</p></div></article>)}</section>
    <p className="phase7Privacy">🔒 {customer?.privacy}</p>
  </div>;
}

function ResultBox({label,result}){
  const ready=['IMPROVED','DECLINED','INCONCLUSIVE'].includes(result?.status);
  return <div className={`phase7Result ${ready?'ready':'waiting'}`}><span>{label} · {result?.due_date||'실행 후 계산'}</span><b>{result?.label||'결과 대기'}</b>{ready&&<small>변화율 {result.change_rate==null?'확인 필요':`${Number(result.change_rate).toFixed(1)}%`} · 매출 {won(result.revenue_change)} · 이익 {won(result.profit_change)}</small>}</div>;
}

function ExecutionTab({execution}){
  const summary=execution?.summary||{};
  return <div className="phase7TabPanel">
    <section className="phase7Kpis execution" aria-label="실행 검증 요약">
      <article><span>실행 예정</span><strong>{number(summary.planned)}건</strong><small>효과와 위험 확인 전</small></article>
      <article><span>실행 완료</span><strong>{number(summary.executed)}건</strong><small>7일·14일 추적 대상</small></article>
      <article><span>7일 결과 있음</span><strong>{number(summary.day7_ready)}건</strong><small>초기 변화 확인</small></article>
      <article><span>14일 결과 있음</span><strong>{number(summary.day14_ready)}건</strong><small>매출 개선 {number(summary.revenue_improved)} · 이익 개선 {number(summary.profit_improved)}</small></article>
    </section>

    <section className="phase7Panel">
      <div className="phase7PanelHead"><div><span>ACTION VALIDATION</span><h3>실행 전 예상과 7일·14일 실제 결과</h3></div><small>보고서 {number(summary.linked_reports)} · 실험 {number(summary.linked_experiments)} 연결</small></div>
      {(execution?.actions||[]).length?<div className="phase7ActionList">{execution.actions.slice(0,12).map(action=><article key={action.id}>
        <header><span className={`phase7Platform ${String(action.platform||'ALL').toLowerCase()}`}>{platformLabel[action.platform]||action.platform}</span><div><b>{action.target_name||'대상 이름 없음'}</b><small>{actionStatusLabel[action.status]||action.status} · 결정 {date(action.decided_at)}</small></div></header>
        <div className="phase7Expectation"><div><span>기대 효과 · {action.expectation.metric}</span><p>{action.expectation.effect}</p></div><div className={`risk ${String(action.expectation.risk_level).toLowerCase()}`}><span>위험 {action.expectation.risk_level}</span><p>{action.expectation.risk}</p></div></div>
        <div className="phase7Results"><ResultBox label="7일" result={action.day7}/><ResultBox label="14일" result={action.day14}/></div>
        <footer>{action.report?<a href={`/api/reports/${action.report.id}/print`} target="_blank" rel="noreferrer">연결 보고서 · {action.report.title}</a>:<span>연결 보고서 없음</span>}{action.experiment?<span>연결 실험 · {action.experiment.name} ({action.experiment.evaluation_status})</span>:<span>직접 연결된 실험 없음</span>}</footer>
      </article>)}</div>:<p className="phase7Empty">저장된 실행 계획이 없습니다.</p>}
    </section>

    <section className="phase7Panel">
      <div className="phase7PanelHead"><div><span>CHANGE HISTORY</span><h3>승인·변경·복구 기록</h3></div><small>검증 완료 {number(summary.verified_changes)} · 복구 {number(summary.rolled_back)}</small></div>
      {(execution?.changes||[]).length?<div className="phase7ChangeList">{execution.changes.slice(0,12).map(change=><article key={change.id}><div><span>{changeTypeLabel[change.change_type]||change.change_type}</span><b>{change.target_key}</b><small>{platformLabel[change.platform]||change.platform||'공통'} · {date(change.created_at)}</small></div><strong>{changeStatusLabel[change.status]||change.status}</strong><p>기록 {number(change.audit_count)}개{change.last_event?` · 최근 ${change.last_event}`:''}</p></article>)}</div>:<p className="phase7Empty">승인·변경 기록이 없습니다.</p>}
      <div className="phase7Links"><a href="/approvals">변경승인 열기</a><a href="/diagnoses">저장된 진단 열기</a></div>
    </section>
  </div>;
}

export default function CustomerRetentionValidationCenter({data}){
  const [tab,setTab]=useState('customer');
  if(!data)return <section className="phase7Center"><p className="phase7Empty">고객·실행 검증 자료를 불러오지 못했습니다.</p></section>;
  return <section className="phase7Center">
    <header className="phase7Hero"><div><span>PHASE 7 · CUSTOMER &amp; VALIDATION</span><h1>고객·재구매·실행 검증센터</h1><p>다시 살 고객을 찾고, 실행한 일이 실제 매출과 이익을 개선했는지 확인합니다.</p></div><div className="phase7HeroBadge"><b>7단계</b><small>핵심 계획 마지막 단계</small></div></header>
    <details className="phase7Help"><summary><span><b>이 화면은 뭐예요?</b><small>처음이라면 쉬운 설명과 예시를 열어보세요.</small></span><em>도움말 열기</em></summary><div><p><b>고객·재구매</b>는 같은 고객의 주문 간격을 보고 다시 살 시기와 휴면 가능성을 찾습니다.</p><p><b>실행 결과</b>는 광고·상품 변경 전 기대효과와 위험, 실행 7일·14일 뒤 실제 숫자를 나란히 비교합니다.</p><p><b>예시</b> · 30일 주기 상품을 마지막으로 산 지 28일인 고객은 재구매 예정 후보입니다. 하지만 이력이 9일뿐이면 주기를 단정하지 않고 계산 대기로 둡니다.</p></div></details>
    <nav className="phase7Tabs" aria-label="7단계 화면 선택"><button type="button" className={tab==='customer'?'active':''} onClick={()=>setTab('customer')}>고객·재구매</button><button type="button" className={tab==='execution'?'active':''} onClick={()=>setTab('execution')}>실행 결과</button></nav>
    {tab==='customer'?<CustomerTab customer={data.customer}/>:<ExecutionTab execution={data.execution}/>} 
  </section>;
}
