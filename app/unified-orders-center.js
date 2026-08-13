'use client';

import { useMemo, useState } from 'react';

const STAGE_LABELS={PAID:'결제완료',PREPARING:'준비중',READY_TO_SHIP:'출고대기',SHIPPING:'배송중',DELIVERED:'배송완료'};
const CHANNEL_LABELS={ALL:'전체 채널',NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24'};
const money=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const dateTime=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'주문일 확인 필요';

function ChannelState({ channel }) {
  const label={READY:'정상',FAILED:'수집 실패',SETUP_REQUIRED:'설정 필요',RECONNECT_REQUIRED:'재연결 필요'}[channel.status]||channel.label;
  return <span className={`unifiedChannelState ${String(channel.status||'').toLowerCase()}`}><i/><b>{CHANNEL_LABELS[channel.platform]}</b><em>{label}</em><small>{channel.message}</small></span>;
}

function OrderCard({ order }) {
  return <article className={`unifiedOrderCard${order.cancellationRequested?' cancelWarning':''}`}>
    {order.cancellationRequested?<div className="orderCancelWarning"><b>출고 멈춤 · 취소/반품 요청 확인</b><span>출고 전에 해당 쇼핑몰에서 요청 상태를 먼저 확인하세요.</span></div>:null}
    <header><div><span className={`channelBadge ${order.platform.toLowerCase()}`}>{order.channelLabel}</span>{order.fulfillment==='ROCKET_GROWTH'?<span className="fulfillmentBadge">로켓그로스</span>:null}<strong>{STAGE_LABELS[order.stage]||'상태 확인'}</strong></div><b>{money(order.amount)}</b></header>
    <section><div><span>허브 주문번호</span><b>{order.hubOrderId}</b></div><div><span>쇼핑몰 주문번호</span><b>{order.externalOrderId}</b></div><div><span>주문 시각</span><b>{dateTime(order.orderedAt)}</b></div></section>
    <div className="unifiedOrderProduct"><span><b>{order.productName}</b><small>{order.items?.length?order.items.map(item=>`${item.name}${item.option?` (${item.option})`:''} × ${count(item.quantity)}`).join(' · '):'상품 상세는 다음 수집 때 자동으로 채워집니다.'}</small></span><strong>{order.quantity?`${count(order.quantity)}개`:'-'}</strong></div>
  </article>;
}

export default function UnifiedOrdersCenter({ center, children }) {
  const [platform,setPlatform]=useState('ALL');
  const [stage,setStage]=useState('ALL');
  const [query,setQuery]=useState('');
  const [startDate,setStartDate]=useState('');
  const [endDate,setEndDate]=useState('');
  const [actionOnly,setActionOnly]=useState(false);
  const visible=useMemo(()=>center.orders.filter(order=>{
    const needle=query.trim().toLowerCase();
    if(platform!=='ALL'&&order.platform!==platform)return false;
    if(stage!=='ALL'&&order.stage!==stage)return false;
    if(actionOnly&&!order.actionRequired)return false;
    const date=String(order.orderedAt||'').slice(0,10);
    if(startDate&&date<startDate)return false;
    if(endDate&&date>endDate)return false;
    if(needle&&!`${order.hubOrderId} ${order.externalOrderId} ${order.productName} ${(order.productNames||[]).join(' ')}`.toLowerCase().includes(needle))return false;
    return true;
  }),[center.orders,platform,stage,query,startDate,endDate,actionOnly]);
  const exportParams=new URLSearchParams();
  if(platform!=='ALL')exportParams.set('platform',platform);
  if(stage!=='ALL')exportParams.set('stage',stage);
  if(query.trim())exportParams.set('query',query.trim());
  if(startDate)exportParams.set('start',startDate);
  if(endDate)exportParams.set('end',endDate);
  if(actionOnly)exportParams.set('action','1');
  const exportHref=`/api/orders/export${exportParams.size?`?${exportParams}`:''}`;
  return <section className="unifiedOrdersCenter">
    <section className="unifiedOrdersHero"><div><span>PHASE 11-2 · UNIFIED ORDERS</span><h1>통합 주문센터</h1><p>네이버·쿠팡·Cafe24 주문을 한곳에서 보고, 오늘 출고할 주문부터 처리합니다.</p></div><div><small>지금 처리 필요</small><b>{count(center.summary.actionRequired)}건</b><em>전체 {count(center.summary.total)}건</em></div></section>
    <div className="unifiedChannelStates">{center.channels.map(channel=><ChannelState channel={channel} key={channel.platform}/>)}</div>
    <details className="unifiedOrdersHelp"><summary><span><b>이 화면은 어떻게 쓰나요?</b><small>처음 볼 때만 열어보세요. 쉬운 예시로 설명합니다.</small></span><em>열기</em></summary><div><p><b>1. 위 단계 박스</b>를 누르면 그 단계 주문만 보여요.</p><p><b>2. ‘처리 필요만’</b>을 켜면 포장·출고하거나 취소를 확인할 주문만 남아요.</p><p><b>예시:</b> 취소 경고가 붙은 주문은 송장을 넣기 전에 쇼핑몰에서 취소 요청부터 확인하세요.</p><p>채널 하나가 실패해도 정상 채널 주문은 계속 표시됩니다. 실패 채널은 위 상태 카드에서 따로 알려드립니다.</p></div></details>
    <article className="unifiedProcessPanel"><header><div><span>오늘의 주문 흐름</span><h2>단계를 누르면 바로 걸러집니다</h2></div><button className={stage==='ALL'?'active':''} onClick={()=>setStage('ALL')}>전체 {count(center.summary.total)}건</button></header><div className="unifiedOrderFlow">{center.stages.map((item,index)=><div key={item.id}><button className={stage===item.id?'active':''} onClick={()=>setStage(item.id)}><small>{index+1}. {item.label}</small><b>{count(center.stageCounts[item.id])}건</b><span>{item.description}</span></button>{index<center.stages.length-1?<i>→</i>:null}</div>)}</div></article>
    <article className="unifiedOrderToolbar"><div><label><span>채널</span><select value={platform} onChange={event=>setPlatform(event.target.value)}>{Object.entries(CHANNEL_LABELS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><label><span>주문 상태</span><select value={stage} onChange={event=>setStage(event.target.value)}><option value="ALL">전체 상태</option>{center.stages.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="orderSearch"><span>주문·상품 검색</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="허브번호·쇼핑몰번호·상품명"/></label><label><span>시작일</span><input type="date" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label><label><span>종료일</span><input type="date" value={endDate} onChange={event=>setEndDate(event.target.value)}/></label></div><footer><label className="actionOnly"><input type="checkbox" checked={actionOnly} onChange={event=>setActionOnly(event.target.checked)}/><span>처리 필요만 보기</span></label><strong>{count(visible.length)}건 표시</strong><a href={exportHref}>엑셀 다운로드</a></footer></article>
    {center.summary.cancellations?<div className="unifiedCancelSummary"><b>출고 전에 확인할 취소·반품 요청 {count(center.summary.cancellations)}건</b><span>아래 빨간 경고 주문은 먼저 요청 상태를 확인하세요.</span></div>:null}
    <div className="unifiedOrderList">{visible.length?visible.map(order=><OrderCard order={order} key={`${order.platform}:${order.hubOrderId}`}/>):<div className="unifiedOrdersEmpty"><b>이 조건의 주문이 없습니다.</b><span>검색어나 기간을 지우고 다시 확인해보세요.</span></div>}</div>
    {children?<details className="legacyCoupangOrders"><summary><span><b>쿠팡 배송 처리 상세</b><small>상품준비중 처리·송장 입력 등 쿠팡 작업이 필요할 때 펼치세요.</small></span><em>열기</em></summary><div>{children}</div></details>:null}
  </section>;
}
