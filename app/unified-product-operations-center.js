'use client';

import { useDeferredValue, useMemo, useState } from 'react';

const CHANNELS = [
  ['CAFE24','Cafe24'],
  ['NAVER','네이버'],
  ['COUPANG','쿠팡']
];

function won(value) {
  return value == null ? '가격 확인 필요' : `${Number(value).toLocaleString('ko-KR')}원`;
}

function ProductChannel({ label, channel }) {
  const state = String(channel?.state || 'MISSING').toLowerCase();
  return <div className={`productOpsChannel ${state}`}>
    <header><b>{label}</b><span>{channel?.label || '미연결'}</span></header>
    <strong>{channel?.name || '연결된 상품 없음'}</strong>
    <small>{channel?.detail || '상품 연결 필요'}</small>
    <em>{won(channel?.price)}</em>
  </div>;
}

export default function UnifiedProductOperationsCenter({ center = {} }) {
  const [filter, setFilter] = useState('ACTION');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const items = Array.isArray(center.items) ? center.items : [];
  const summary = center.summary || {};
  const filtered = useMemo(() => items.filter(item => {
    if (deferredQuery && !String(item.name || '').toLowerCase().includes(deferredQuery.toLowerCase())) return false;
    if (filter === 'ACTION') return item.action_required;
    if (filter === 'PRICE') return item.issues?.some(issue => issue.code === 'PRICE_GAP');
    if (filter === 'STOCK') return item.issues?.some(issue => issue.level === 'DANGER');
    if (filter === 'UNLINKED') return item.connected_channels < 3;
    return true;
  }), [items, filter, deferredQuery]);

  const scrollToMapping = () => document.querySelector('.productMappingWorkbench')?.scrollIntoView({ behavior:'smooth', block:'start' });
  return <section className="productOpsCenter">
    <div className="productOpsHero">
      <div><span className="eyebrow">PHASE 11-5 · PRODUCT OPERATIONS</span><h1>통합 상품 운영센터</h1><p>같은 상품의 판매상태·가격·재고·연결 이상을 채널별로 한눈에 확인합니다.</p></div>
      <aside><small>지금 확인할 상품</small><strong>{Number(summary.action_required || 0).toLocaleString('ko-KR')}개</strong><button type="button" onClick={scrollToMapping}>상품 연결 검토</button></aside>
    </div>
    <details className="productOpsHelp"><summary>이 화면은 어떻게 쓰나요?</summary><p><b>예:</b> Cafe24에서는 판매 중인데 쿠팡이 품절이면 해당 상품에 ‘쿠팡 품절’이 표시됩니다. 먼저 빨간 표시를 확인하고, 가격차나 미연결 상품을 이어서 검토하세요. 네이버 광고그룹은 스마트스토어 실상품으로 계산하지 않습니다.</p></details>
    <div className="productOpsKpis">
      <span><small>기준상품</small><b>{summary.master_products || 0}개</b></span>
      <span><small>3채널 실상품 연결</small><b>{summary.all_channels_connected || 0}개</b></span>
      <span><small>판매중지·품절</small><b>{summary.stopped_or_out || 0}개</b></span>
      <span><small>가격차 10% 이상</small><b>{summary.price_gap || 0}개</b></span>
      <span><small>네이버 실상품</small><b>{summary.naver_real_products || 0}개</b></span>
    </div>
    <div className="productOpsToolbar">
      <nav aria-label="상품 운영 필터">{[['ACTION','확인 필요'],['ALL','전체'],['STOCK','품절·중지'],['PRICE','가격차'],['UNLINKED','미연결']].map(([id,label]) => <button type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id)} key={id}>{label}</button>)}</nav>
      <input aria-label="상품명 검색" placeholder="상품명 검색" value={query} onChange={event => setQuery(event.target.value)}/>
    </div>
    <div className="productOpsList">{filtered.map(item => <article className="productOpsRow" key={item.master_product_id}>
      <div className="productOpsIdentity"><small>기준상품</small><h2>{item.name}</h2><span>기준가 {won(item.base_price)}</span><div>{item.issues?.length ? item.issues.map(issue => <em className={issue.level.toLowerCase()} key={issue.code}>{issue.label}</em>) : <em className="good">이상 없음</em>}</div></div>
      <div className="productOpsChannels">{CHANNELS.map(([id,label]) => <ProductChannel key={id} label={label} channel={item.channels?.[id]}/>)}</div>
    </article>)}{!filtered.length && <div className="productOpsEmpty">이 조건에서 확인할 상품이 없습니다.</div>}</div>
    <p className="productOpsLock">실제 가격·판매상태 변경은 자동 실행하지 않습니다. 변경승인에서 검토한 뒤 실행하도록 잠겨 있습니다.</p>
  </section>;
}
