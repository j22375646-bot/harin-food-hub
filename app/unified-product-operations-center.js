'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import HarinIcon from './_design-system/harin-icon.js';

const CHANNELS = [
  ['CAFE24','Cafe24','cafe24'],
  ['NAVER','네이버','naver'],
  ['COUPANG','쿠팡','coupang']
];

const KPI_ITEMS = [
  ['product','기준상품','master_products'],
  ['link','3채널 실상품 연결','all_channels_connected'],
  ['warning','판매중지·품절','stopped_or_out'],
  ['price','가격차 10% 이상','price_gap'],
  ['naver','네이버 실상품','naver_real_products']
];

const FILTERS = [
  ['ACTION','checklist','확인 필요'],['ALL','product','전체'],['STOCK','warning','품절·중지'],
  ['PRICE','price','가격차'],['UNLINKED','link','미연결']
];

function won(value) {
  return value == null ? '가격 확인 필요' : `${Number(value).toLocaleString('ko-KR')}원`;
}

function ProductChannel({ label, icon, channel }) {
  const state = String(channel?.state || 'MISSING').toLowerCase();
  return <div className={`productOpsChannel ${state}`}>
    <header><b><i><HarinIcon name={icon} size={16}/></i>{label}</b><span>{channel?.label || '미연결'}</span></header>
    <strong>{channel?.name || '연결된 상품 없음'}</strong>
    <small>{channel?.detail || '상품 연결 필요'}</small>
    <em>{won(channel?.price)}</em>
  </div>;
}

export default function UnifiedProductOperationsCenter({ center = {} }) {
  const [filter, setFilter] = useState('ACTION');
  const [query, setQuery] = useState('');
  const [visibleCount,setVisibleCount]=useState(24);
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
  const visible=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);

  return <section className="productOpsCenter">
    <div className="productOpsHero">
      <div className="productOpsHeroCopy"><span className="eyebrow">채널 상품 운영</span><div><i><HarinIcon name="product" size={28}/></i><span><h2>통합 상품 운영센터</h2><p>같은 상품의 판매상태·가격·재고·연결 이상을 채널별로 한눈에 확인합니다.</p></span></div></div>
      <aside><span><HarinIcon name="checklist" size={18}/>지금 확인할 상품</span><strong>{Number(summary.action_required || 0).toLocaleString('ko-KR')}개</strong><Link href="/products/mappings"><HarinIcon name="link" size={16}/>쿠팡 상품 연결 검토</Link></aside>
    </div>
    <details className="productOpsHelp"><summary>이 화면은 어떻게 쓰나요?</summary><p><b>예:</b> Cafe24에서는 판매 중인데 쿠팡이 품절이면 해당 상품에 ‘쿠팡 품절’이 표시됩니다. 먼저 빨간 표시를 확인하고, 가격차나 미연결 상품을 이어서 검토하세요. 네이버 광고그룹은 스마트스토어 실상품으로 계산하지 않습니다.</p></details>
    <div className="productOpsKpis">
      {KPI_ITEMS.map(([icon,label,key])=><span key={key}><i><HarinIcon name={icon} size={18}/></i><small>{label}</small><b>{summary[key] || 0}개</b></span>)}
    </div>
    <div className="productOpsToolbar">
      <nav aria-label="상품 운영 필터">{FILTERS.map(([id,icon,label]) => <button type="button" className={filter === id ? 'active' : ''} onClick={() => {setFilter(id);setVisibleCount(24);}} key={id}><HarinIcon name={icon} size={15}/>{label}</button>)}</nav>
      <label><HarinIcon name="search" size={17}/><input aria-label="상품명 검색" placeholder="상품명 검색" value={query} onChange={event => {setQuery(event.target.value);setVisibleCount(24);}}/></label>
    </div>
    <div className="productOpsList">{visible.map(item => <article className="productOpsRow" key={item.master_product_id}>
      <div className="productOpsIdentity"><i><HarinIcon name="product" size={21}/></i><small>기준상품</small><h2>{item.name}</h2><span>기준가 {won(item.base_price)}</span><div>{item.issues?.length ? item.issues.map(issue => <em className={issue.level.toLowerCase()} key={issue.code}>{issue.label}</em>) : <em className="good">이상 없음</em>}</div></div>
      <div className="productOpsChannels">{CHANNELS.map(([id,label,icon]) => <ProductChannel key={id} label={label} icon={icon} channel={item.channels?.[id]}/>)}</div>
    </article>)}{!filtered.length && <div className="productOpsEmpty">이 조건에서 확인할 상품이 없습니다.</div>}</div>
    {visibleCount<filtered.length&&<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(count=>count+24)}>상품 24개 더 보기 <small>{visible.length}/{filtered.length}</small></button>}
    <p className="productOpsLock"><HarinIcon name="shield" size={17}/>실제 가격·판매상태 변경은 자동 실행하지 않습니다. 변경승인에서 검토한 뒤 실행하도록 잠겨 있습니다.</p>
  </section>;
}
