'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { HarinIcon } from './_design-system/harin-icon.js';
import { HarinPageAiRegion, HarinPageFrame, HarinPageHeader } from './_design-system/harin-ui.js';

const CHANNELS = [['CAFE24','Cafe24'],['NAVER','네이버'],['COUPANG','쿠팡']];
const WORKSPACES = [
  ['OVERVIEW','오늘 재고','먼저 볼 일'],
  ['SKU','SKU 재고','판매 상품'],
  ['RISK','위험 재고','품절·저재고'],
  ['REPLENISH','발주 제안','목표 보유일 미리보기'],
  ['HISTORY','갱신 이력','채널 기준 시각']
];

function count(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function quantity(channel) {
  if (channel?.quantity_label) return channel.quantity_label;
  return channel?.quantity == null ? '확인 필요' : `${count(channel.quantity)}개`;
}

function dateTime(value) {
  if (!value) return '기준 시각 없음';
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return '기준 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

function dateOnly(value) {
  if (!value) return '판매속도 확인 필요';
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return '판매속도 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(date);
}

function catalogMeta(item) {
  if (item.catalog_status === 'OUT_OF_STOCK') return { label:'품절 상품', tone:'danger' };
  if (item.catalog_status === 'STOPPED') return { label:'판매중단', tone:'muted' };
  return { label:'판매 중', tone:'selling' };
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

function InventoryRow({ item, compact=false }) {
  const catalog=catalogMeta(item);
  return <article className={`inventoryOpsRow priority${item.priority} ${compact?'compact':''}`}>
    <div className="inventoryOpsIdentity">
      <div className="inventoryCatalogLine"><span className={catalog.tone}>{catalog.label}</span><small>기준 상품</small></div>
      <h2>{item.name}</h2>
      <div>{item.issues?.length?item.issues.map(issue=><em className={issue.level.toLowerCase()} key={issue.code}>{issue.label}</em>):<em className="good">재고 이상 없음</em>}</div>
    </div>
    <div className="inventoryOpsChannels">{CHANNELS.map(([id,label])=><ChannelStock key={id} label={label} channel={item.channels?.[id]}/>)}</div>
  </article>;
}

function ReplenishmentCard({ item, targetDays }) {
  const plan=item.replenishment||{};
  const ready=plan.status!=='CHECK_REQUIRED';
  const targetQuantity=targetDays===30 && plan.recommended_quantity != null
    ? Number(plan.recommended_quantity)
    : ready && plan.average_daily_sales != null && plan.available_quantity != null
      ? Math.max(0,Math.ceil(Number(plan.average_daily_sales)*targetDays-Number(plan.available_quantity)))
      : null;
  return <article className={`inventoryReplenishmentCard ${String(plan.status||'CHECK_REQUIRED').toLowerCase()}`}>
    <header><div><small>판매 중 상품</small><h2>{item.name}</h2></div><em>{targetQuantity==null?'계산 대기':targetQuantity>0?'발주 제안':'현재 재고 충분'}</em></header>
    <div>
      <span><small>가장 적은 채널 재고</small><b>{plan.available_quantity==null?'확인 필요':`${count(plan.available_quantity)}개`}</b></span>
      <span><small>하루 평균 판매</small><b>{plan.average_daily_sales==null?'확인 필요':`${plan.average_daily_sales}개`}</b></span>
      <span><small>예상 품절일</small><b>{dateOnly(plan.stockout_date)}</b><em>{plan.stockout_days==null?'표본 필요':`${plan.stockout_days}일 남음`}</em></span>
      <span className="recommend"><small>{targetDays}일 목표 발주량</small><b>{targetQuantity==null?'확인 필요':`${count(targetQuantity)}개`}</b></span>
    </div>
    <p>{ready?`최근 ${plan.sales_period_days || 7}일 판매속도와 확인 가능한 채널 재고로 계산한 미리보기입니다. 저장하거나 플랫폼 재고를 바꾸지 않습니다.`:'최근 판매량 또는 채널 재고가 확인되어야 안전하게 계산할 수 있습니다. 모르는 수량은 0개로 추정하지 않습니다.'}</p>
  </article>;
}

export default function UnifiedInventoryOperationsCenter({ center = {}, children, aiPanel }) {
  const [workspace,setWorkspace]=useState('OVERVIEW');
  const [filter,setFilter]=useState('ACTION');
  const [query,setQuery]=useState('');
  const [visibleCount,setVisibleCount]=useState(24);
  const [targetDays,setTargetDays]=useState(30);
  const deferredQuery=useDeferredValue(query);
  const items=Array.isArray(center.items)?center.items:[];
  const summary=center.summary||{};
  const sellableItems=useMemo(()=>items.filter(item=>item.is_sellable!==false),[items]);
  const unavailableItems=useMemo(()=>items.filter(item=>item.is_sellable===false),[items]);
  const sellableOutCount=sellableItems.filter(item=>item.issues?.some(issue=>issue.code.endsWith('_OUT'))).length;
  const dataCheckCount=sellableItems.filter(item=>item.issues?.some(issue=>['_STALE','_UNKNOWN','_MISSING'].some(suffix=>issue.code.endsWith(suffix)))).length;
  const workspaceCounts={
    OVERVIEW:sellableItems.filter(item=>item.action_required).length,
    SKU:sellableItems.length,
    RISK:sellableItems.filter(item=>item.priority>=2).length,
    REPLENISH:sellableItems.filter(item=>item.replenishment?.status==='RECOMMENDED').length,
    HISTORY:items.reduce((sum,item)=>sum+Object.values(item.channels||{}).filter(channel=>channel.updated_at).length,0)
  };
  const filtered=useMemo(()=>sellableItems.filter(item=>{
    if(deferredQuery&&!String(item.name||'').toLowerCase().includes(deferredQuery.toLowerCase()))return false;
    if(workspace==='OVERVIEW'&&!item.action_required)return false;
    if(workspace==='RISK'&&item.priority<2)return false;
    if(filter==='ACTION')return item.action_required;
    if(filter==='OUT')return item.issues?.some(issue=>issue.code.endsWith('_OUT'));
    if(filter==='LOW')return item.issues?.some(issue=>issue.code.endsWith('_LOW'));
    if(filter==='DATA')return item.issues?.some(issue=>['_STALE','_UNKNOWN','_MISSING'].some(suffix=>issue.code.endsWith(suffix)));
    return true;
  }),[sellableItems,filter,deferredQuery,workspace]);
  const visible=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);
  const displayed=workspace==='OVERVIEW'?visible.slice(0,8):visible;
  const replenishmentItems=useMemo(()=>sellableItems
    .filter(item=>item.replenishment?.status!=='ENOUGH')
    .sort((a,b)=>(a.replenishment?.stockout_days??9999)-(b.replenishment?.stockout_days??9999)),[sellableItems]);
  const history=useMemo(()=>items.flatMap(item=>CHANNELS.map(([platform,label])=>({
    platform,label,name:item.name,updated_at:item.channels?.[platform]?.updated_at,state:item.channels?.[platform]?.state
  }))).filter(item=>item.updated_at).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,30),[items]);

  function openWorkspace(id,nextFilter) {
    setWorkspace(id);
    setVisibleCount(24);
    if(nextFilter)setFilter(nextFilter);
    else if(id==='SKU')setFilter('ALL');
    else if(id==='RISK'||id==='OVERVIEW')setFilter('ACTION');
  }

  return <HarinPageFrame kind="operations" className="inventoryOpsCenter inventoryOpsV8">
    <HarinPageHeader className="inventoryOpsHero" eyebrow="재고·발주 업무" title="재고·발주 작업센터" description="판매 중인 상품부터 확인하고, 품절 위험과 필요한 발주량을 실제 처리 순서대로 보여드려요." icon="inventory" tone="mint" note="품절·판매중단·사은품·이벤트 상품은 매칭과 발주 계산에서 제외" metrics={[["판매 중 상품",`${count(summary.sellable_products ?? sellableItems.length)}개`],["지금 확인할 상품",`${count(workspaceCounts.OVERVIEW)}개`],["발주 추천",`${count(workspaceCounts.REPLENISH)}개`],["접어둔 상품",`${count(summary.unavailable_products ?? unavailableItems.length)}개`]]}/>

    <section className="inventoryFocusRail" aria-label="오늘의 재고 집중 항목">
      <button type="button" className={sellableOutCount?'danger':''} onClick={()=>openWorkspace('RISK','OUT')}><HarinIcon name="alerts" size={22}/><span><small>먼저 확인</small><b>판매 상품 품절 {count(sellableOutCount)}개</b></span><em>보기</em></button>
      <button type="button" onClick={()=>openWorkspace('REPLENISH')}><HarinIcon name="inventory" size={22}/><span><small>발주 준비</small><b>추천 상품 {count(workspaceCounts.REPLENISH)}개</b></span><em>계산하기</em></button>
      <button type="button" className={dataCheckCount?'notice':''} onClick={()=>openWorkspace('SKU','DATA')}><HarinIcon name="sync" size={22}/><span><small>데이터 상태</small><b>수량·갱신 확인 {count(dataCheckCount)}개</b></span><em>확인하기</em></button>
    </section>

    <nav className="phase13WorkspaceNav inventory" aria-label="재고 작업공간">
      {WORKSPACES.map(([id,label,description])=><button type="button" className={workspace===id?'active':''} onClick={()=>openWorkspace(id)} key={id}><span>{label}</span><small>{description}</small><b>{count(workspaceCounts[id])}</b></button>)}
    </nav>

    {['OVERVIEW','SKU','RISK'].includes(workspace)?<>
      <section className="inventoryOpsToolbar">
        <nav aria-label="통합 재고 필터">{[['ACTION','확인 필요'],['ALL','판매 중 전체'],['OUT','품절'],['LOW','저재고'],['DATA','데이터 확인']].map(([id,label])=><button type="button" className={filter===id?'active':''} onClick={()=>{setFilter(id);setVisibleCount(24);}} key={id}>{label}</button>)}</nav>
        <input type="search" aria-label="재고 상품명 검색" placeholder="판매 상품 찾기" value={query} onChange={event=>{setQuery(event.target.value);setVisibleCount(24);}}/>
      </section>
      <section className="inventoryOpsList">{displayed.map(item=><InventoryRow item={item} key={item.master_product_id}/>) }{!filtered.length&&<div className="inventoryOpsEmpty">이 조건에 해당하는 판매 상품이 없습니다.</div>}</section>
      {workspace!=='OVERVIEW'&&visibleCount<filtered.length?<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(value=>value+24)}>재고 24개 더 보기 <small>{visible.length}/{filtered.length}</small></button>:null}
      {unavailableItems.length?<details className="inventoryUnavailableGroup"><summary><span><HarinIcon name="product" size={20}/><b>품절·판매중단 상품</b><small>현재 매칭·발주 대상에서 제외</small></span><em>{count(unavailableItems.length)}개 보기</em></summary><div>{unavailableItems.map(item=><InventoryRow item={item} compact key={item.master_product_id}/>)}</div></details>:null}
    </>:null}

    {workspace==='REPLENISH'?<>
      <section className="inventoryPlannerControls"><div><span><HarinIcon name="sparkles" size={20}/><b>목표 보유일을 골라보세요</b></span><p>최근 판매속도가 유지된다고 보고 필요한 수량을 즉시 다시 계산합니다.</p></div><nav aria-label="목표 재고 보유일">{[14,30,45,60].map(days=><button type="button" className={targetDays===days?'active':''} onClick={()=>setTargetDays(days)} key={days}>{days}일</button>)}</nav><aside><small>현재 선택</small><b>{targetDays}일분</b><em>미리보기만 제공</em></aside></section>
      <section className="inventoryReplenishmentList">{replenishmentItems.length?replenishmentItems.map(item=><ReplenishmentCard item={item} targetDays={targetDays} key={item.master_product_id}/>):<div className="inventoryOpsEmpty">현재 권장할 발주가 없습니다.</div>}</section>
    </>:null}

    {workspace==='HISTORY'?<section className="inventoryHistoryList"><header><div><span>COLLECTION HISTORY</span><h2>최근 채널 재고 기준 시각</h2></div><small>상품별 최신 30건</small></header>{history.length?history.map((item,index)=><article key={`${item.platform}-${item.name}-${index}`}><span className={String(item.state||'unknown').toLowerCase()}>{item.label}</span><b>{item.name}</b><small>{dateTime(item.updated_at)}</small></article>):<div className="inventoryOpsEmpty">재고 수집 기록이 없습니다.</div>}</section>:null}

    {workspace==='SKU'?<details className="inventoryOpsCoupangDetail"><summary><span><b>쿠팡 로켓그로스 상세 운영표</b><small>재고일수·30일 판매·판매촉진 판단이 필요할 때만 펼쳐보세요.</small></span><em>열기 / 접기</em></summary><div>{children}</div></details>:null}
    {workspace==='OVERVIEW'?<HarinPageAiRegion className="operationsAiSlot inventoryAiSlot" id="page-ai-analysis" title="재고·발주 AI 분석">{aiPanel}</HarinPageAiRegion>:null}
    <details className="inventoryOpsHelp"><summary>도움말 · 재고 화면은 어떤 순서로 보나요?</summary><div><p><b>오늘 재고 → 위험 재고</b> 순서로 품절과 저재고를 먼저 처리합니다. 채널마다 수량과 기준 시각이 함께 표시돼 오래된 수치를 구분할 수 있어요.</p><p><b>발주 미리보기</b>는 최근 7일 판매속도와 가장 적은 채널 재고를 사용합니다. 목표 보유일을 바꿔도 실제 재고나 플랫폼에는 반영되지 않아요.</p></div></details>
  </HarinPageFrame>;
}
