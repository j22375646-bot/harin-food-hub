'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { HarinIcon } from './_design-system/harin-icon.js';
import { HarinPageAiRegion, HarinPageFrame, HarinPageHeader } from './_design-system/harin-ui.js';

const WORKSPACES = [
  ['OVERVIEW','오늘 재고','먼저 볼 위험'],
  ['SKU','전체 SKU','판매·품절 상품'],
  ['RISK','재입고 위험','품절·저재고'],
  ['REPLENISH','입고 미리보기','목표 보유일 계산'],
  ['HISTORY','수집 기준','SKU별 기준 시각']
];

const FILTERS = [
  ['ACTION','재입고 필요'],
  ['ALL','판매가능 전체'],
  ['OUT','판매가능 0개'],
  ['LOW','저재고'],
  ['OVERSTOCK','판매촉진'],
  ['DATA','수집 확인']
];

const count=value=>Number(value||0).toLocaleString('ko-KR');
const number=value=>Number.isFinite(Number(value))?Number(value):0;

function dateTime(value) {
  if (!value) return '기준 시각 없음';
  const date=new Date(value);
  if (Number.isNaN(date.getTime())) return '기준 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

function itemName(item) {
  return item?.productItem?.item_name||item?.external_sku_id||`SKU ${item?.vendor_item_id||'-'}`;
}

function itemSku(item) {
  return item?.external_sku_id||item?.vendor_item_id||'-';
}

function stockMeta(item) {
  const status=String(item?.stock_status||'UNKNOWN').toUpperCase();
  if (status==='OUT_OF_STOCK') return { label:'판매가능 0개', issue:'품절', tone:'danger', priority:3, action:'재입고 최우선' };
  if (status==='CRITICAL') return { label:'7일 미만', issue:'재고 매우 부족', tone:'danger', priority:3, action:'입고 일정 확인' };
  if (status==='LOW') return { label:'14일 미만', issue:'저재고', tone:'warn', priority:2, action:'재입고 검토' };
  if (status==='OVERSTOCK') return { label:'판매촉진', issue:'재고 소진 필요', tone:'info', priority:1, action:'쿠폰·묶음 검토' };
  if (status==='HEALTHY') return { label:'안정', issue:'재고 이상 없음', tone:'good', priority:0, action:'판매 유지' };
  return { label:'확인 필요', issue:'수집 상태 확인', tone:'info', priority:1, action:'재고 다시 수집' };
}

function RocketGrowthInventoryRow({ item, compact=false }) {
  const meta=stockMeta(item);
  const days=item.days_of_stock==null?null:number(item.days_of_stock);
  const marketingAction=item.inventoryMarketing?.action||meta.action;
  return <article className={`inventoryOpsRow rgInventoryRow priority${meta.priority} ${compact?'compact':''}`} data-rg-inventory="true">
    <div className="inventoryOpsIdentity">
      <div className="inventoryCatalogLine"><span className={meta.tone}>{meta.label}</span><small>쿠팡 로켓그로스</small></div>
      <h2>{itemName(item)}</h2>
      <p>SKU {itemSku(item)} · 상품번호 {item.vendor_item_id||'-'}</p>
      <div><em className={meta.tone}>{meta.issue}</em><em className="good">조회 전용</em></div>
    </div>
    <div className="rgInventoryMetrics">
      <span className="primary"><small>판매가능 재고</small><b>{count(item.total_orderable_quantity)}개</b><em>{days==null?'판매 이력 없음':`${days.toFixed(1)}일분`}</em></span>
      <span><small>최근 30일 판매</small><b>{count(item.sales_last_30_days)}개</b><em>하루 평균 {number(item.average_daily_sales).toFixed(1)}개</em></span>
      <span><small>재고 판단</small><b>{marketingAction}</b><em>{dateTime(item.snapshot_at||item.updated_at)} 기준</em></span>
    </div>
  </article>;
}

function RocketGrowthReplenishmentCard({ item, targetDays }) {
  const quantity=Math.max(0,number(item.total_orderable_quantity));
  const daily=number(item.average_daily_sales)||(number(item.sales_last_30_days)/30);
  const targetQuantity=daily>0?Math.max(0,Math.ceil(daily*targetDays-quantity)):null;
  const days=item.days_of_stock==null?null:number(item.days_of_stock);
  return <article className={`inventoryReplenishmentCard ${targetQuantity==null?'check_required':targetQuantity>0?'recommended':'enough'}`}>
    <header><div><small>쿠팡 로켓그로스</small><h2>{itemName(item)}</h2></div><em>{targetQuantity==null?'판매 표본 필요':targetQuantity>0?'입고 검토':'현재 재고 충분'}</em></header>
    <div>
      <span><small>판매가능 재고</small><b>{count(quantity)}개</b></span>
      <span><small>하루 평균 판매</small><b>{daily>0?`${daily.toFixed(1)}개`:'확인 필요'}</b></span>
      <span><small>현재 재고일수</small><b>{days==null?'판매 이력 없음':`${days.toFixed(1)}일`}</b><em>최근 30일 기준</em></span>
      <span className="recommend"><small>{targetDays}일 목표 입고량</small><b>{targetQuantity==null?'판단 보류':`${count(targetQuantity)}개`}</b></span>
    </div>
    <p>로켓그로스 판매가능 수량과 최근 30일 판매속도로 계산한 미리보기입니다. 실제 쿠팡 재고나 입고 요청은 변경하지 않습니다.</p>
  </article>;
}

export default function UnifiedInventoryOperationsCenter({ coupang = {}, aiPanel }) {
  const [workspace,setWorkspace]=useState('OVERVIEW');
  const [filter,setFilter]=useState('ACTION');
  const [query,setQuery]=useState('');
  const [visibleCount,setVisibleCount]=useState(24);
  const [targetDays,setTargetDays]=useState(30);
  const [outOpen,setOutOpen]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState('');
  const deferredQuery=useDeferredValue(query);
  const inventory=useMemo(()=>Array.isArray(coupang.rgInventory)?coupang.rgInventory:[],[coupang.rgInventory]);
  const availableItems=useMemo(()=>inventory.filter(item=>number(item.total_orderable_quantity)>0),[inventory]);
  const zeroStockItems=useMemo(()=>inventory.filter(item=>number(item.total_orderable_quantity)<=0).sort((a,b)=>number(b.sales_last_30_days)-number(a.sales_last_30_days)),[inventory]);
  const lowItems=useMemo(()=>availableItems.filter(item=>['CRITICAL','LOW'].includes(String(item.stock_status||'').toUpperCase())),[availableItems]);
  const overstockItems=useMemo(()=>availableItems.filter(item=>String(item.stock_status||'').toUpperCase()==='OVERSTOCK'),[availableItems]);
  const dataCheckItems=useMemo(()=>inventory.filter(item=>!(item.snapshot_at||item.updated_at)),[inventory]);
  const latestSnapshot=useMemo(()=>inventory.map(item=>item.snapshot_at||item.updated_at).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null,[inventory]);
  const totalOrderable=availableItems.reduce((sum,item)=>sum+number(item.total_orderable_quantity),0);
  const salesLast30Days=inventory.reduce((sum,item)=>sum+number(item.sales_last_30_days),0);
  const replenishmentItems=useMemo(()=>inventory.filter(item=>number(item.sales_last_30_days)>0).sort((a,b)=>number(a.days_of_stock??9999)-number(b.days_of_stock??9999)),[inventory]);
  const workspaceCounts={
    OVERVIEW:lowItems.length+zeroStockItems.length,
    SKU:inventory.length,
    RISK:lowItems.length+zeroStockItems.length,
    REPLENISH:replenishmentItems.filter(item=>number(item.days_of_stock??9999)<30).length,
    HISTORY:inventory.filter(item=>item.snapshot_at||item.updated_at).length
  };
  const filtered=useMemo(()=>availableItems.filter(item=>{
    const haystack=`${itemName(item)} ${itemSku(item)} ${item.vendor_item_id||''}`.toLowerCase();
    if(deferredQuery&&!haystack.includes(deferredQuery.toLowerCase()))return false;
    const status=String(item.stock_status||'').toUpperCase();
    if(workspace==='OVERVIEW'&&!['CRITICAL','LOW'].includes(status))return false;
    if(workspace==='RISK'&&!['CRITICAL','LOW'].includes(status))return false;
    if(filter==='ACTION')return ['CRITICAL','LOW'].includes(status);
    if(filter==='LOW')return ['CRITICAL','LOW'].includes(status);
    if(filter==='OVERSTOCK')return status==='OVERSTOCK';
    if(filter==='DATA')return !(item.snapshot_at||item.updated_at);
    return filter!=='OUT';
  }),[availableItems,deferredQuery,filter,workspace]);
  const visible=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);
  const displayed=workspace==='OVERVIEW'?visible.slice(0,8):visible;
  const history=useMemo(()=>[...inventory].filter(item=>item.snapshot_at||item.updated_at).sort((a,b)=>Date.parse(b.snapshot_at||b.updated_at)-Date.parse(a.snapshot_at||a.updated_at)),[inventory]);

  function openWorkspace(id,nextFilter) {
    setWorkspace(id);
    setVisibleCount(24);
    if(nextFilter)setFilter(nextFilter);
    else if(id==='SKU')setFilter('ALL');
    else if(id==='RISK'||id==='OVERVIEW')setFilter('ACTION');
  }

  function showOutOfStock() {
    openWorkspace('RISK','OUT');
    setOutOpen(true);
  }

  async function requestSync() {
    setSyncing(true);
    setSyncMessage('서울 고정 IP 서버에 로켓그로스 재고 수집을 요청하고 있어요…');
    try {
      const response=await fetch('/api/coupang/rg-inventory/sync',{method:'POST'});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'수집 요청 실패');
      setSyncMessage('수집 요청 완료 · 고정 IP 서버가 최신 로켓그로스 재고를 가져옵니다.');
    } catch(error) {
      setSyncMessage(`확인 필요 · ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  const syncAction=<button className="inventoryRgSyncButton" type="button" onClick={requestSync} disabled={syncing}><HarinIcon name="sync" size={18}/>{syncing?'요청 중…':'로켓그로스 재고 수집'}</button>;

  return <HarinPageFrame kind="operations" className="inventoryOpsCenter inventoryOpsV8 inventoryRocketGrowthOnly" data-inventory-scope="coupang-rocket-growth">
    <HarinPageHeader className="inventoryOpsHero" eyebrow="쿠팡 로켓그로스 재고" title="로켓그로스 재고관리" description="쿠팡이 배송하는 로켓그로스 상품만 모아 판매가능 수량, 최근 판매속도와 재입고 순서를 보여드려요." icon="inventory" tone="amber" note="Cafe24·네이버·판매자배송 재고는 이 화면에 표시하지 않음" metrics={[["로켓그로스 SKU",`${count(inventory.length)}개`],["판매가능 재고",`${count(totalOrderable)}개`],["30일 판매",`${count(salesLast30Days)}개`],["재입고 위험",`${count(workspaceCounts.RISK)}개`]]} actions={syncAction}/>
    {syncMessage?<p className="inventoryRgSyncMessage" role="status">{syncMessage}</p>:null}

    <section className="inventoryFocusRail" aria-label="오늘의 로켓그로스 재고 집중 항목">
      <button type="button" className={zeroStockItems.length?'danger':''} onClick={showOutOfStock}><HarinIcon name="alerts" size={22}/><span><small>먼저 확인</small><b>판매가능 0개 {count(zeroStockItems.length)}개</b></span><em>펼쳐보기</em></button>
      <button type="button" className={lowItems.length?'notice':''} onClick={()=>openWorkspace('RISK','LOW')}><HarinIcon name="inventory" size={22}/><span><small>재입고 준비</small><b>저재고 {count(lowItems.length)}개</b></span><em>확인하기</em></button>
      <button type="button" onClick={()=>openWorkspace('SKU','OVERSTOCK')}><HarinIcon name="sparkles" size={22}/><span><small>판매 촉진</small><b>과잉재고 {count(overstockItems.length)}개</b></span><em>후보 보기</em></button>
      <button type="button" className={dataCheckItems.length?'notice':''} onClick={requestSync} disabled={syncing}><HarinIcon name="sync" size={22}/><span><small>최근 수집</small><b>{dateTime(latestSnapshot)}</b></span><em>{syncing?'요청 중':'새로 수집'}</em></button>
    </section>

    <nav className="phase13WorkspaceNav inventory" aria-label="로켓그로스 재고 작업공간">
      {WORKSPACES.map(([id,label,description])=><button type="button" className={workspace===id?'active':''} onClick={()=>openWorkspace(id)} key={id}><span>{label}</span><small>{description}</small><b>{count(workspaceCounts[id])}</b></button>)}
    </nav>

    {['OVERVIEW','SKU','RISK'].includes(workspace)?<>
      <section className="inventoryOpsToolbar">
        <nav aria-label="로켓그로스 재고 필터">{FILTERS.map(([id,label])=><button type="button" className={filter===id?'active':''} onClick={()=>{setFilter(id);setVisibleCount(24);if(id==='OUT')setOutOpen(true);}} key={id}>{label}</button>)}</nav>
        <input type="search" aria-label="로켓그로스 상품명 검색" placeholder="상품명·SKU 찾기" value={query} onChange={event=>{setQuery(event.target.value);setVisibleCount(24);}}/>
      </section>
      {filter!=='OUT'?<section className="inventoryOpsList">{displayed.map(item=><RocketGrowthInventoryRow item={item} key={item.vendor_item_id}/>) }{!filtered.length&&<div className="inventoryOpsEmpty">이 조건에 해당하는 로켓그로스 SKU가 없습니다.</div>}</section>:null}
      {workspace!=='OVERVIEW'&&filter!=='OUT'&&visibleCount<filtered.length?<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(value=>value+24)}>SKU 24개 더 보기 <small>{visible.length}/{filtered.length}</small></button>:null}
      {zeroStockItems.length?<details className="inventoryUnavailableGroup rgZeroStockGroup" open={outOpen} onToggle={event=>setOutOpen(event.currentTarget.open)}><summary><span><HarinIcon name="alerts" size={20}/><b>판매가능 0개 SKU</b><small>판매가능 목록과 분리하고 필요할 때만 펼쳐봐요.</small></span><em>{count(zeroStockItems.length)}개 보기</em></summary><div>{zeroStockItems.map(item=><RocketGrowthInventoryRow item={item} compact key={item.vendor_item_id}/>)}</div></details>:null}
    </>:null}

    {workspace==='REPLENISH'?<>
      <section className="inventoryPlannerControls"><div><span><HarinIcon name="sparkles" size={20}/><b>목표 보유일을 골라보세요</b></span><p>로켓그로스 판매가능 수량과 최근 30일 판매속도로 필요한 입고량을 다시 계산합니다.</p></div><nav aria-label="목표 재고 보유일">{[14,30,45,60].map(days=><button type="button" className={targetDays===days?'active':''} onClick={()=>setTargetDays(days)} key={days}>{days}일</button>)}</nav><aside><small>현재 선택</small><b>{targetDays}일분</b><em>미리보기만 제공</em></aside></section>
      <section className="inventoryReplenishmentList">{replenishmentItems.length?replenishmentItems.map(item=><RocketGrowthReplenishmentCard item={item} targetDays={targetDays} key={item.vendor_item_id}/>):<div className="inventoryOpsEmpty">판매 표본이 있는 로켓그로스 SKU가 없습니다.</div>}</section>
    </>:null}

    {workspace==='HISTORY'?<section className="inventoryHistoryList"><header><div><span>ROCKET GROWTH SNAPSHOTS</span><h2>SKU별 최근 재고 기준 시각</h2></div><small>쿠팡 로켓그로스 API 기준</small></header>{history.length?history.map(item=><article key={item.vendor_item_id}><span className={String(item.stock_status||'unknown').toLowerCase()}>RG</span><b>{itemName(item)}</b><small>{dateTime(item.snapshot_at||item.updated_at)}</small></article>):<div className="inventoryOpsEmpty">로켓그로스 재고 수집 기록이 없습니다.</div>}</section>:null}

    <HarinPageAiRegion className="operationsAiSlot inventoryAiSlot" id="page-ai-analysis" title="로켓그로스 재고 AI 분석">{aiPanel}</HarinPageAiRegion>
    <details className="inventoryOpsHelp"><summary>도움말 · 로켓그로스 재고는 어떤 순서로 보나요?</summary><div><p><b>오늘 재고 → 재입고 위험</b> 순서로 판매가능 0개와 14일 미만 상품을 먼저 확인합니다. 이 화면에는 Cafe24·네이버·쿠팡 판매자배송 재고가 섞이지 않아요.</p><p><b>입고 미리보기</b>는 현재 판매가능 수량과 최근 30일 판매속도를 사용합니다. 목표 보유일을 바꿔도 쿠팡 재고나 입고 요청에는 반영되지 않습니다.</p></div></details>
  </HarinPageFrame>;
}
