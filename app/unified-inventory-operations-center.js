'use client';

import { useDeferredValue, useMemo, useState } from 'react';

const CHANNELS = [['CAFE24','Cafe24'],['NAVER','네이버'],['COUPANG','쿠팡']];

function quantity(channel) {
  if (channel?.quantity_label) return channel.quantity_label;
  return channel?.quantity == null ? '확인 필요' : `${Number(channel.quantity).toLocaleString('ko-KR')}개`;
}

function dateTime(value) {
  if (!value) return '기준시각 없음';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
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

export default function UnifiedInventoryOperationsCenter({ center = {}, children, aiPanel }) {
  const [filter,setFilter]=useState('ACTION');
  const [query,setQuery]=useState('');
  const [visibleCount,setVisibleCount]=useState(24);
  const deferredQuery=useDeferredValue(query);
  const items=Array.isArray(center.items)?center.items:[];
  const summary=center.summary||{};
  const filtered=useMemo(()=>items.filter(item=>{
    if(deferredQuery&&!String(item.name||'').toLowerCase().includes(deferredQuery.toLowerCase()))return false;
    if(filter==='ACTION')return item.action_required;
    if(filter==='OUT')return item.issues?.some(issue=>issue.code.endsWith('_OUT'));
    if(filter==='LOW')return item.issues?.some(issue=>issue.code.endsWith('_LOW'));
    if(filter==='STALE')return item.issues?.some(issue=>issue.code.endsWith('_STALE'));
    if(filter==='UNKNOWN')return item.issues?.some(issue=>issue.code.endsWith('_UNKNOWN')||issue.code.endsWith('_MISSING'));
    return true;
  }),[items,filter,deferredQuery]);
  const visible=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);

  return <section className="inventoryOpsCenter">
    <section className="inventoryOpsHero">
      <div><span>PHASE 11-6 · INVENTORY OPERATIONS</span><h1>통합 재고 운영센터</h1><p>채널별 판매 가능 수량을 한곳에서 확인하고, 품절과 저재고부터 먼저 처리합니다.</p></div>
      <aside><small>지금 확인할 상품</small><strong>{Number(summary.action_required||0).toLocaleString('ko-KR')}개</strong><em>알 수 없는 재고는 0으로 계산하지 않습니다.</em></aside>
    </section>
    <details className="inventoryOpsHelp"><summary>도움말 · 어떤 재고부터 보면 되나요?</summary><div><p><b>빨간색 품절</b>을 먼저 확인하고, 다음으로 <b>주황색 저재고</b>를 봅니다. 예를 들어 쿠팡 판매자배송 4개와 로켓그로스 6개가 있으면 쿠팡 재고는 10개로 보여주되 두 창고 수량도 따로 표시합니다.</p><p>수량을 받지 못한 채널은 품절 0개가 아니라 <b>확인 필요</b>로 표시합니다. 기준시각이 오래된 자료도 별도로 알려줍니다.</p></div></details>
    <section className="inventoryOpsKpis">
      <span><small>기준상품</small><b>{summary.products||0}개</b></span>
      <span><small>품절 포함</small><b>{summary.out_of_stock||0}개</b></span>
      <span><small>저재고 포함</small><b>{summary.low_stock||0}개</b></span>
      <span><small>갱신 필요</small><b>{summary.stale||0}개</b></span>
      <span><small>3채널 수량 확인</small><b>{summary.fully_known||0}개</b></span>
    </section>
    {aiPanel}
    <section className="inventoryOpsToolbar">
      <nav aria-label="통합 재고 필터">{[['ACTION','확인 필요'],['ALL','전체'],['OUT','품절'],['LOW','저재고'],['STALE','갱신 필요'],['UNKNOWN','미확인·미연결']].map(([id,label])=><button type="button" className={filter===id?'active':''} onClick={()=>{setFilter(id);setVisibleCount(24);}} key={id}>{label}</button>)}</nav>
      <input type="search" aria-label="재고 상품명 검색" placeholder="상품명 검색" value={query} onChange={event=>{setQuery(event.target.value);setVisibleCount(24);}}/>
    </section>
    <section className="inventoryOpsList">{visible.map(item=><article className={`inventoryOpsRow priority${item.priority}`} key={item.master_product_id}>
      <div className="inventoryOpsIdentity"><small>기준상품</small><h2>{item.name}</h2><div>{item.issues?.length?item.issues.map(issue=><em className={issue.level.toLowerCase()} key={issue.code}>{issue.label}</em>):<em className="good">재고 이상 없음</em>}</div></div>
      <div className="inventoryOpsChannels">{CHANNELS.map(([id,label])=><ChannelStock key={id} label={label} channel={item.channels?.[id]}/>)}</div>
    </article>)}{!filtered.length&&<div className="inventoryOpsEmpty">이 조건에 해당하는 상품이 없습니다.</div>}</section>
    {visibleCount<filtered.length&&<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(count=>count+24)}>재고 24개 더 보기 <small>{visible.length}/{filtered.length}</small></button>}
    <details className="inventoryOpsCoupangDetail"><summary><span><b>쿠팡 로켓그로스 상세 운영판</b><small>재고일수·30일 판매·판매촉진 판단이 필요할 때 펼쳐보세요.</small></span><em>열기/접기</em></summary><div>{children}</div></details>
  </section>;
}
