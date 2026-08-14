'use client';

import { useDeferredValue, useMemo, useState } from 'react';

const CHANNELS = [['CAFE24','Cafe24'],['NAVER','네이버'],['COUPANG','쿠팡']];
const WORKSPACES = [
  ['OVERVIEW','운영 요약','오늘 볼 재고'],
  ['SKU','SKU 재고','전체 상품'],
  ['RISK','위험 재고','품절·저재고'],
  ['REPLENISH','발주 제안','30일 보충'],
  ['HISTORY','갱신 이력','채널 기준시각']
];

function quantity(channel) {
  if (channel?.quantity_label) return channel.quantity_label;
  return channel?.quantity == null ? '확인 필요' : `${Number(channel.quantity).toLocaleString('ko-KR')}개`;
}

function dateTime(value) {
  if (!value) return '기준시각 없음';
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

function dateOnly(value) {
  if (!value) return '판매속도 확인 필요';
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return '판매속도 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(date);
}

function ChannelStock({ label, channel }) {
  const state=String(channel?.state||'UNKNOWN').toLowerCase();
  return <div className={`inventoryOpsChannel ${state}`}>
    <header><b>{label}</b><span>{channel?.label||'확인 필요'}</span></header>
    <strong>{quantity(channel)}</strong>
    <p>{channel?.detail||'재고 자료가 없습니다.'}</p>
    <small>{dateTime(channel?.updated_at)} 기준</small>
  </div>;
}

function ReplenishmentCard({ item }) {
  const plan=item.replenishment||{};
  const ready=plan.status!=='CHECK_REQUIRED';
  return <article className={`inventoryReplenishmentCard ${String(plan.status||'CHECK_REQUIRED').toLowerCase()}`}>
    <header><div><small>기준상품</small><h2>{item.name}</h2></div><em>{plan.status==='RECOMMENDED'?'발주 권장':plan.status==='ENOUGH'?'현재 재고 충분':'계산 대기'}</em></header>
    <div>
      <span><small>가장 적은 채널 재고</small><b>{plan.available_quantity==null?'확인 필요':`${Number(plan.available_quantity).toLocaleString('ko-KR')}개`}</b></span>
      <span><small>하루 평균 판매</small><b>{plan.average_daily_sales==null?'확인 필요':`${plan.average_daily_sales}개`}</b></span>
      <span><small>예상 품절일</small><b>{dateOnly(plan.stockout_date)}</b><em>{plan.stockout_days==null?'표본 필요':`${plan.stockout_days}일 남음`}</em></span>
      <span className="recommend"><small>30일 권장 발주</small><b>{plan.recommended_quantity==null?'확인 필요':`${Number(plan.recommended_quantity).toLocaleString('ko-KR')}개`}</b></span>
    </div>
    <p>{ready?plan.basis:'최근 판매 또는 채널 재고가 확인돼야 안전하게 계산합니다. 모르는 수량은 0개로 추정하지 않습니다.'}</p>
  </article>;
}

export default function UnifiedInventoryOperationsCenter({ center = {}, children, aiPanel }) {
  const [workspace,setWorkspace]=useState('OVERVIEW');
  const [filter,setFilter]=useState('ACTION');
  const [query,setQuery]=useState('');
  const [visibleCount,setVisibleCount]=useState(24);
  const deferredQuery=useDeferredValue(query);
  const items=Array.isArray(center.items)?center.items:[];
  const summary=center.summary||{};
  const workspaceCounts={
    OVERVIEW:summary.action_required||0,
    SKU:items.length,
    RISK:items.filter(item=>item.priority>=2).length,
    REPLENISH:summary.replenishment_recommended||0,
    HISTORY:items.reduce((sum,item)=>sum+Object.values(item.channels||{}).filter(channel=>channel.updated_at).length,0)
  };
  const filtered=useMemo(()=>items.filter(item=>{
    if(deferredQuery&&!String(item.name||'').toLowerCase().includes(deferredQuery.toLowerCase()))return false;
    if(workspace==='OVERVIEW'&&!item.action_required)return false;
    if(workspace==='RISK'&&item.priority<2)return false;
    if(filter==='ACTION')return item.action_required;
    if(filter==='OUT')return item.issues?.some(issue=>issue.code.endsWith('_OUT'));
    if(filter==='LOW')return item.issues?.some(issue=>issue.code.endsWith('_LOW'));
    if(filter==='STALE')return item.issues?.some(issue=>issue.code.endsWith('_STALE'));
    if(filter==='UNKNOWN')return item.issues?.some(issue=>issue.code.endsWith('_UNKNOWN')||issue.code.endsWith('_MISSING'));
    return true;
  }),[items,filter,deferredQuery,workspace]);
  const visible=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);
  const displayed=workspace==='OVERVIEW'?visible.slice(0,8):visible;
  const replenishmentItems=useMemo(()=>items
    .filter(item=>item.replenishment?.status!=='ENOUGH')
    .sort((a,b)=>(a.replenishment?.stockout_days??9999)-(b.replenishment?.stockout_days??9999)),[items]);
  const history=useMemo(()=>items.flatMap(item=>CHANNELS.map(([platform,label])=>({
    platform,label,name:item.name,updated_at:item.channels?.[platform]?.updated_at,state:item.channels?.[platform]?.state
  }))).filter(item=>item.updated_at).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,30),[items]);

  function openWorkspace(id) {
    setWorkspace(id);
    setVisibleCount(24);
    if(id==='SKU')setFilter('ALL');
    if(id==='RISK'||id==='OVERVIEW')setFilter('ACTION');
  }

  return <section className="inventoryOpsCenter">
    <section className="inventoryOpsHero">
      <div><span>13-5 · INVENTORY WORKSPACES</span><h1>재고·발주 운영센터</h1><p>전체 SKU를 늘어놓지 않고, 품절 위험과 발주할 상품부터 골라서 보여드립니다.</p></div>
      <aside><small>지금 확인할 상품</small><strong>{Number(summary.action_required||0).toLocaleString('ko-KR')}개</strong><em>발주 권장 {Number(summary.replenishment_recommended||0).toLocaleString('ko-KR')}개 · 모르는 재고는 0개로 계산하지 않습니다.</em></aside>
    </section>
    <details className="inventoryOpsHelp"><summary>도움말 · 재고 화면은 어떤 순서로 보나요?</summary><div><p><b>운영 요약 → 위험 재고</b> 순서로 품절과 저재고를 처리합니다. 상품 하나의 채널별 수량과 기준시각을 함께 보므로 오래된 수치를 바로 구분할 수 있습니다.</p><p><b>발주 제안</b>은 최근 7일 판매속도와 가장 적은 채널 재고를 사용합니다. 예: 하루 2개 판매, 재고 10개면 약 5일 뒤 품절로 보고 30일분에서 부족한 수량을 제안합니다.</p></div></details>
    <nav className="phase13WorkspaceNav inventory" aria-label="재고 작업공간">
      {WORKSPACES.map(([id,label,description])=><button type="button" className={workspace===id?'active':''} onClick={()=>openWorkspace(id)} key={id}><span>{label}</span><small>{description}</small><b>{Number(workspaceCounts[id]||0).toLocaleString('ko-KR')}</b></button>)}
    </nav>
    <section className="inventoryOpsKpis">
      <span><small>기준상품</small><b>{summary.products||0}개</b></span>
      <span><small>품절 포함</small><b>{summary.out_of_stock||0}개</b></span>
      <span><small>저재고 포함</small><b>{summary.low_stock||0}개</b></span>
      <span><small>갱신 필요</small><b>{summary.stale||0}개</b></span>
      <span><small>발주 계산 가능</small><b>{summary.replenishment_ready||0}개</b></span>
    </section>
    {workspace==='OVERVIEW'?aiPanel:null}

    {['OVERVIEW','SKU','RISK'].includes(workspace)?<>
      <section className="inventoryOpsToolbar">
        <nav aria-label="통합 재고 필터">{[['ACTION','확인 필요'],['ALL','전체'],['OUT','품절'],['LOW','저재고'],['STALE','갱신 필요'],['UNKNOWN','미확인·미연결']].map(([id,label])=><button type="button" className={filter===id?'active':''} onClick={()=>{setFilter(id);setVisibleCount(24);}} key={id}>{label}</button>)}</nav>
        <input type="search" aria-label="재고 상품명 검색" placeholder="상품명 검색" value={query} onChange={event=>{setQuery(event.target.value);setVisibleCount(24);}}/>
      </section>
      <section className="inventoryOpsList">{displayed.map(item=><article className={`inventoryOpsRow priority${item.priority}`} key={item.master_product_id}>
        <div className="inventoryOpsIdentity"><small>기준상품</small><h2>{item.name}</h2><div>{item.issues?.length?item.issues.map(issue=><em className={issue.level.toLowerCase()} key={issue.code}>{issue.label}</em>):<em className="good">재고 이상 없음</em>}</div></div>
        <div className="inventoryOpsChannels">{CHANNELS.map(([id,label])=><ChannelStock key={id} label={label} channel={item.channels?.[id]}/>)}</div>
      </article>)}{!filtered.length&&<div className="inventoryOpsEmpty">이 조건에 해당하는 상품이 없습니다.</div>}</section>
      {workspace!=='OVERVIEW'&&visibleCount<filtered.length?<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(count=>count+24)}>재고 24개 더 보기 <small>{visible.length}/{filtered.length}</small></button>:null}
    </>:null}

    {workspace==='REPLENISH'?<section className="inventoryReplenishmentList">{replenishmentItems.length?replenishmentItems.map(item=><ReplenishmentCard item={item} key={item.master_product_id}/>):<div className="inventoryOpsEmpty">현재 권장할 발주가 없습니다.</div>}</section>:null}
    {workspace==='HISTORY'?<section className="inventoryHistoryList"><header><div><span>COLLECTION HISTORY</span><h2>최근 채널 재고 기준시각</h2></div><small>상품별 최신 30건</small></header>{history.length?history.map((item,index)=><article key={`${item.platform}-${item.name}-${index}`}><span className={String(item.state||'unknown').toLowerCase()}>{item.label}</span><b>{item.name}</b><small>{dateTime(item.updated_at)}</small></article>):<div className="inventoryOpsEmpty">재고 수집 이력이 없습니다.</div>}</section>:null}
    {workspace==='SKU'?<details className="inventoryOpsCoupangDetail"><summary><span><b>쿠팡 로켓그로스 상세 운영판</b><small>재고일수·30일 판매·판매촉진 판단이 필요할 때 펼쳐보세요.</small></span><em>열기/접기</em></summary><div>{children}</div></details>:null}
  </section>;
}
