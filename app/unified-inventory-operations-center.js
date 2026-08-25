'use client';

import './_operations/harin-operations-v8.css';
import { useDeferredValue, useMemo, useState } from 'react';
import remainingBulkModule from '../lib/operations/remaining-bulk-workflows.js';
import { HarinBulkCheckbox, HarinBulkSelectionBar, useHarinBulkSelection } from './_design-system/harin-bulk-selection.js';
import { HarinIcon } from './_design-system/harin-icon.js';
import { HarinEmptyState, HarinMetricChart, HarinPageAiRegion, HarinPageFrame, HarinPageHeader } from './_design-system/harin-ui.js';
import inventoryLotModule from '../lib/inventory/lot-center.js';

const { replenishmentRows, replenishmentRowsToCsv, replenishmentRowsToText, replenishmentTarget } = remainingBulkModule;
const { summarizeLots, todayKey } = inventoryLotModule;

const WORKSPACES = [
  ['OVERVIEW','판매 상품','지금 운영중'],
  ['RISK','재입고 점검','저재고만'],
  ['REPLENISH','입고 미리보기','목표 보유일 계산'],
  ['EXPIRY','유통기한','입고 LOT 기록'],
  ['HISTORY','수집 기준','SKU별 기준 시각']
];

const FILTERS = [
  ['ALL','판매 상품 전체'],
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
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}`;
}

function itemName(item) {
  return item?.productItem?.item_name||item?.external_sku_id||`SKU ${item?.vendor_item_id||'-'}`;
}

function itemSku(item) {
  return item?.external_sku_id||item?.vendor_item_id||'-';
}

function itemKey(item) {
  return String(item?.vendor_item_id||item?.external_sku_id||'');
}

function LotStatusBadge({ expiry }) {
  return <span className={`inventoryLotStatus ${expiry?.tone||'info'}`}>{expiry?.label||'날짜 확인 필요'}</span>;
}

function InventoryLotWorkbench({ inventory, lots, setLots, onChooseItem }) {
  const [form,setForm]=useState({vendor_item_id:inventory[0]?.vendor_item_id?String(inventory[0].vendor_item_id):'',lot_code:'',received_on:todayKey(),manufactured_on:'',expires_on:'',quantity:'',notes:''});
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const summary=useMemo(()=>summarizeLots(lots,inventory),[lots,inventory]);
  const inventoryMap=useMemo(()=>new Map(inventory.map(item=>[String(item.vendor_item_id),item])),[inventory]);
  const editingExisting=useMemo(()=>lots.some(lot=>String(lot.vendor_item_id)===String(form.vendor_item_id)&&lot.lot_code===form.lot_code),[lots,form.vendor_item_id,form.lot_code]);
  const update=(key,value)=>setForm(current=>({...current,[key]:value}));

  async function saveLot(event) {
    event.preventDefault();
    const selected=inventoryMap.get(String(form.vendor_item_id));
    const label=selected?itemName(selected):'선택 상품';
    if(!window.confirm(`${label}의 LOT ${form.lot_code||'(미입력)'} · 유통기한 ${form.expires_on||'(미입력)'}을 저장할까요?`))return;
    setSaving(true);setMessage('선택한 상품의 입고 LOT를 저장하고 있어요…');
    try{
      const response=await fetch('/api/inventory/lots',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,quantity:Number(form.quantity)})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'LOT 저장 실패');
      setLots(current=>[result.lot,...current.filter(lot=>!(String(lot.vendor_item_id)===String(result.lot.vendor_item_id)&&lot.lot_code===result.lot.lot_code))]);
      setForm(current=>({...current,lot_code:'',manufactured_on:'',expires_on:'',quantity:'',notes:''}));
      setMessage('저장 완료 · 유통기한 위험과 미등록 상품 수를 바로 갱신했습니다.');
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving(false);}
  }

  function chooseItem(item) {
    setForm(current=>({...current,vendor_item_id:String(item.vendor_item_id)}));
    onChooseItem?.();
    requestAnimationFrame(()=>document.querySelector('.inventoryLotForm input[name="lot_code"]')?.focus());
  }

  function editLot(lot) {
    setForm({
      vendor_item_id:String(lot.vendor_item_id),
      lot_code:lot.lot_code||'',
      received_on:lot.received_on||todayKey(),
      manufactured_on:lot.manufactured_on||'',
      expires_on:lot.expires_on||'',
      quantity:String(lot.quantity??''),
      notes:lot.notes||''
    });
    setMessage(`LOT ${lot.lot_code} 내용을 불러왔습니다. 수정한 뒤 저장해 주세요.`);
    requestAnimationFrame(()=>document.querySelector('.inventoryLotForm')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  async function finishLot(lot) {
    const item=inventoryMap.get(String(lot.vendor_item_id));
    if(!window.confirm(`${item?itemName(item):'선택 상품'}의 LOT ${lot.lot_code}를 소진 완료로 처리할까요?`))return;
    setSaving(true);setMessage(`LOT ${lot.lot_code}를 소진 완료로 처리하고 있어요…`);
    try{
      const response=await fetch('/api/inventory/lots',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...lot,status:'USED'})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'LOT 소진 처리 실패');
      setLots(current=>current.map(row=>String(row.vendor_item_id)===String(result.lot.vendor_item_id)&&row.lot_code===result.lot.lot_code?result.lot:row));
      setMessage('소진 완료 · 만료 경고와 활성 LOT 수량에서 바로 제외했습니다.');
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving(false);}
  }

  return <section className="inventoryLotWorkbench" data-inventory-lot-workbench="true">
    <header className="inventoryLotSummaryHeader"><div><span><HarinIcon name="clock" size={20}/><b>입고 LOT와 유통기한</b></span><p>쿠팡 API가 제공하지 않는 유통기한은 실제 입고표를 보고 기록해요. 플랫폼 수집값처럼 표시하지 않습니다.</p></div><small>사장님 기록 · 쿠팡 재고 조회 전용</small></header>
    <div className="inventoryLotKpis">
      <button type="button" onClick={()=>document.querySelector('.inventoryLotList')?.scrollIntoView({behavior:'smooth'})}><small>30일 안 만료</small><b>{count(summary.urgent.length)}건</b><em>기한 지난 LOT 포함</em></button>
      <span><small>31~90일 안 만료</small><b>{count(summary.warning.length)}건</b><em>판매·소진 계획 점검</em></span>
      <span><small>활성 LOT 수량</small><b>{count(summary.activeQuantity)}개</b><em>직접 기록 기준</em></span>
      <button type="button" onClick={()=>document.querySelector('.inventoryLotUnregistered')?.scrollIntoView({behavior:'smooth'})}><small>유통기한 미등록</small><b>{count(summary.unregistered.length)}개</b><em>판매 중 SKU 기준</em></button>
    </div>
    <form className="inventoryLotForm" onSubmit={saveLot}>
      <header><div><span>LOT QUICK ENTRY</span><h2>입고표 한 줄만 기록해요</h2></div><small>저장 전 확인창 1회</small></header>
      <label className="wide"><span>로켓그로스 판매 상품</span><select value={form.vendor_item_id} onChange={event=>update('vendor_item_id',event.target.value)} required>{inventory.map(item=><option value={item.vendor_item_id} key={itemKey(item)}>{itemName(item)} · SKU {itemSku(item)}</option>)}</select></label>
      <label><span>LOT 번호 {editingExisting?<small>수정 중</small>:null}</span><input name="lot_code" value={form.lot_code} onChange={event=>update('lot_code',event.target.value)} placeholder="예: 2026-08-A" maxLength={80} readOnly={editingExisting} required/></label>
      <label><span>입고일</span><input type="date" value={form.received_on} onChange={event=>update('received_on',event.target.value)}/></label>
      <label><span>제조일 <small>선택</small></span><input type="date" value={form.manufactured_on} onChange={event=>update('manufactured_on',event.target.value)}/></label>
      <label><span>유통기한</span><input type="date" value={form.expires_on} onChange={event=>update('expires_on',event.target.value)} required/></label>
      <label><span>입고 수량</span><input type="number" min="0" max="1000000" step="1" inputMode="numeric" value={form.quantity} onChange={event=>update('quantity',event.target.value)} placeholder="0" required/></label>
      <label className="notes"><span>메모 <small>선택</small></span><input value={form.notes} onChange={event=>update('notes',event.target.value)} placeholder="창고 위치·입고처 등" maxLength={500}/></label>
      <button className="primary" type="submit" disabled={saving}><HarinIcon name={saving?'sync':'check'} size={18}/>{saving?'저장 중…':'LOT 저장'}</button>
      {message?<p role="status">{message}</p>:null}
    </form>
    <section className="inventoryLotList"><header><div><span>EXPIRY PRIORITY</span><h2>먼저 확인할 유통기한</h2></div><small>가까운 날짜 순</small></header>{summary.active.length?summary.active.map(lot=>{const item=inventoryMap.get(String(lot.vendor_item_id));return <article className={`priority${lot.expiry.priority}`} key={lot.id||`${lot.vendor_item_id}-${lot.lot_code}`}><LotStatusBadge expiry={lot.expiry}/><div><b>{item?itemName(item):`상품번호 ${lot.vendor_item_id}`}</b><small>LOT {lot.lot_code} · 유통기한 {lot.expires_on}</small></div><span><small>기록 수량</small><b>{count(lot.quantity)}개</b></span><em>{lot.notes||'메모 없음'}</em><nav aria-label={`LOT ${lot.lot_code} 작업`}><button type="button" onClick={()=>editLot(lot)}>수정</button><button type="button" onClick={()=>finishLot(lot)} disabled={saving}>소진 완료</button></nav></article>}):<HarinEmptyState state="uncollected" title="입고 LOT를 아직 기록하지 않았어요" description="실제 입고표의 LOT 번호와 유통기한을 위 입력란에 기록하면 가까운 날짜 순으로 정리합니다."/>}</section>
    <section className="inventoryLotUnregistered"><header><div><span>NOT REGISTERED</span><h2>유통기한을 아직 기록하지 않은 판매 상품</h2></div><small>{count(summary.unregistered.length)}개</small></header>{summary.unregistered.length?<div>{summary.unregistered.map(item=><article key={itemKey(item)}><span><b>{itemName(item)}</b><small>SKU {itemSku(item)} · 판매가능 {count(item.total_orderable_quantity)}개</small></span><button type="button" onClick={()=>chooseItem(item)}>LOT 입력</button></article>)}</div>:<HarinEmptyState state="empty" title="판매 중인 모든 SKU에 활성 LOT가 있어요" description="지금 추가로 기록해야 할 유통기한이 없습니다."/>}</section>
  </section>;
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

function RocketGrowthInventoryRow({ item, compact=false, selected=false, onSelect }) {
  const meta=stockMeta(item);
  const days=item.days_of_stock==null?null:number(item.days_of_stock);
  const marketingAction=item.inventoryMarketing?.action||meta.action;
  return <article className={`inventoryOpsRow rgInventoryRow priority${meta.priority} ${compact?'compact':''} ${selected?'selected':''}`} data-rg-inventory="true">
    <HarinBulkCheckbox checked={selected} onChange={event=>onSelect?.(event.target.checked)} label={`${itemName(item)} 선택`}/>
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

function RocketGrowthReplenishmentCard({ item, targetDays, selected=false, onSelect }) {
  const quantity=Math.max(0,number(item.total_orderable_quantity));
  const daily=number(item.average_daily_sales)||(number(item.sales_last_30_days)/30);
  const targetQuantity=replenishmentTarget(item,targetDays);
  const days=item.days_of_stock==null?null:number(item.days_of_stock);
  return <article className={`inventoryReplenishmentCard ${targetQuantity==null?'check_required':targetQuantity>0?'recommended':'enough'} ${selected?'selected':''}`}>
    <header><HarinBulkCheckbox checked={selected} onChange={event=>onSelect?.(event.target.checked)} label={`${itemName(item)} 선택`}/><div><small>쿠팡 로켓그로스</small><h2>{itemName(item)}</h2></div><em>{targetQuantity==null?'판매 표본 필요':targetQuantity>0?'입고 검토':'현재 재고 충분'}</em></header>
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
  const [filter,setFilter]=useState('ALL');
  const [query,setQuery]=useState('');
  const [visibleCount,setVisibleCount]=useState(24);
  const [targetDays,setTargetDays]=useState(30);
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState('');
  const [bulkMessage,setBulkMessage]=useState('');
  const [lotRecords,setLotRecords]=useState(()=>Array.isArray(coupang.inventoryLots)?coupang.inventoryLots:[]);
  const deferredQuery=useDeferredValue(query);
  const sourceInventory=useMemo(()=>Array.isArray(coupang.rgInventory)?coupang.rgInventory:[],[coupang.rgInventory]);
  const inventory=useMemo(()=>sourceInventory.filter(item=>number(item.sales_last_30_days)>0&&number(item.total_orderable_quantity)>0),[sourceInventory]);
  const lowItems=useMemo(()=>inventory.filter(item=>['CRITICAL','LOW'].includes(String(item.stock_status||'').toUpperCase())),[inventory]);
  const totalOrderable=inventory.reduce((sum,item)=>sum+number(item.total_orderable_quantity),0);
  const salesLast30Days=inventory.reduce((sum,item)=>sum+number(item.sales_last_30_days),0);
  const replenishmentItems=useMemo(()=>[...inventory].sort((a,b)=>number(a.days_of_stock??9999)-number(b.days_of_stock??9999)),[inventory]);
  const lotSummary=useMemo(()=>summarizeLots(lotRecords,inventory),[lotRecords,inventory]);
  const workspaceCounts={
    OVERVIEW:inventory.length,
    RISK:lowItems.length,
    REPLENISH:replenishmentItems.filter(item=>number(item.days_of_stock??9999)<30).length,
    EXPIRY:lotSummary.urgent.length+lotSummary.unregistered.length,
    HISTORY:inventory.filter(item=>item.snapshot_at||item.updated_at).length
  };
  const filtered=useMemo(()=>inventory.filter(item=>{
    const haystack=`${itemName(item)} ${itemSku(item)} ${item.vendor_item_id||''}`.toLowerCase();
    if(deferredQuery&&!haystack.includes(deferredQuery.toLowerCase()))return false;
    const status=String(item.stock_status||'').toUpperCase();
    if(workspace==='RISK'&&!['CRITICAL','LOW'].includes(status))return false;
    if(filter==='LOW')return ['CRITICAL','LOW'].includes(status);
    if(filter==='OVERSTOCK')return status==='OVERSTOCK';
    if(filter==='DATA')return !(item.snapshot_at||item.updated_at);
    return true;
  }),[inventory,deferredQuery,filter,workspace]);
  const visible=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);
  const displayed=workspace==='OVERVIEW'?visible.slice(0,8):visible;
  const bulkFilteredItems=workspace==='REPLENISH'?replenishmentItems:filtered;
  const bulkVisibleItems=workspace==='REPLENISH'?replenishmentItems:displayed;
  const bulkSelection=useHarinBulkSelection({allIds:inventory.map(itemKey),filteredIds:bulkFilteredItems.map(itemKey),visibleIds:bulkVisibleItems.map(itemKey)});
  const selectedItems=useMemo(()=>{const selected=bulkSelection.selectedSet;return inventory.filter(item=>selected.has(itemKey(item)));},[inventory,bulkSelection.selectedSet]);
  const history=useMemo(()=>[...inventory].filter(item=>item.snapshot_at||item.updated_at).sort((a,b)=>Date.parse(b.snapshot_at||b.updated_at)-Date.parse(a.snapshot_at||a.updated_at)),[inventory]);
  const visualInventory=useMemo(()=>[...inventory].sort((a,b)=>number(b.sales_last_30_days)-number(a.sales_last_30_days)).slice(0,6),[inventory]);

  function openWorkspace(id,nextFilter) {
    setWorkspace(id);
    setVisibleCount(24);
    if(nextFilter)setFilter(nextFilter);
    else if(id==='RISK')setFilter('LOW');
    else if(id==='OVERVIEW')setFilter('ALL');
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

  function selectedPlanRows() {
    return replenishmentRows(selectedItems,targetDays);
  }

  async function copySelectedPlan() {
    const rows=selectedPlanRows();
    if(!rows.length)return;
    try {
      await navigator.clipboard.writeText(replenishmentRowsToText(rows));
      setBulkMessage(`선택 ${rows.length}개 로켓그로스 입고 작업표를 복사했습니다.`);
    } catch {
      setBulkMessage('복사 권한을 확인해 주세요. CSV 저장은 바로 사용할 수 있습니다.');
    }
  }

  function downloadSelectedPlan() {
    const rows=selectedPlanRows();
    if(!rows.length)return;
    const blob=new Blob([`\ufeff${replenishmentRowsToCsv(rows)}`],{type:'text/csv;charset=utf-8'});
    const href=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=href;link.download=`harin-rocket-growth-${targetDays}days-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(href);
    setBulkMessage(`선택 ${rows.length}개 입고계획 CSV를 저장했습니다. 쿠팡 재고는 변경하지 않았습니다.`);
  }

  const syncAction=<button className="inventoryRgSyncButton" type="button" onClick={requestSync} disabled={syncing}><HarinIcon name="sync" size={18}/>{syncing?'요청 중…':'로켓그로스 재고 수집'}</button>;
  const bulkBar={OVERVIEW:true,RISK:true,REPLENISH:true}[workspace]?<HarinBulkSelectionBar className="inventoryBulkSelectionBar" selectedCount={bulkSelection.selectedCount} visibleCount={bulkVisibleItems.length} filteredCount={bulkFilteredItems.length} visibleState={bulkSelection.visibleState} filteredState={bulkSelection.filteredState} onToggleVisible={checked=>bulkSelection.toggleScope(bulkVisibleItems.map(itemKey),checked)} onToggleFiltered={checked=>bulkSelection.toggleScope(bulkFilteredItems.map(itemKey),checked)} onClear={bulkSelection.clear} summary="로켓그로스 SKU만 선택해 입고 작업표를 만듭니다." preview={`${targetDays}일 목표 입고량을 계산해 복사·CSV로 저장합니다. 쿠팡 재고와 입고 요청은 변경하지 않습니다.`}><button type="button" className="primary" disabled={!bulkSelection.selectedCount} onClick={copySelectedPlan}>입고 작업표 복사</button><button type="button" disabled={!bulkSelection.selectedCount} onClick={downloadSelectedPlan}>CSV 저장</button></HarinBulkSelectionBar>:null;

  return <HarinPageFrame kind="operations" className="inventoryOpsCenter inventoryOpsV8 inventoryRocketGrowthOnly" data-inventory-scope="coupang-rocket-growth">
    <HarinPageHeader className="inventoryOpsHero" eyebrow="쿠팡 로켓그로스 재고" title="지금 판매 중인 재고" description="최근 30일 판매가 있고 현재 판매가능 수량이 있는 로켓그로스 상품만 바로 보여드려요." icon="inventory" tone="amber" note="판매중단·30일 판매 0개·판매가능 0개 SKU는 운영 화면에서 제외" metrics={[["판매 상품",`${count(inventory.length)}개`],["판매가능 재고",`${count(totalOrderable)}개`],["30일 판매",`${count(salesLast30Days)}개`],["재입고 점검",`${count(workspaceCounts.RISK)}개`]]} actions={syncAction}/>
    {syncMessage?<p className="inventoryRgSyncMessage" role="status">{syncMessage}</p>:null}
    {bulkMessage?<p className="inventoryRgSyncMessage bulk" role="status">{bulkMessage}</p>:null}

    <nav className="phase13WorkspaceNav inventory" aria-label="로켓그로스 재고 작업공간">
      {WORKSPACES.map(([id,label,description])=><button type="button" className={workspace===id?'active':''} onClick={()=>openWorkspace(id)} key={id}><span>{label}</span><small>{description}</small><b>{count(workspaceCounts[id])}</b></button>)}
    </nav>

    {workspace==='OVERVIEW'&&visualInventory.length?<section className="inventoryVisualSummary" data-core-visualization="inventory-stock-sales"><HarinMetricChart kind="bar" title="판매 속도와 현재 재고를 함께 봐요" description="최근 30일 판매량이 큰 상품부터 최대 6개를 비교합니다." labels={visualInventory.map(item=>itemName(item).length>14?`${itemName(item).slice(0,14)}…`:itemName(item))} series={[{label:'판매가능 재고',tone:'primary',values:visualInventory.map(item=>item.total_orderable_quantity)},{label:'최근 30일 판매',tone:'secondary',values:visualInventory.map(item=>item.sales_last_30_days)}]}/></section>:null}

    {['OVERVIEW','RISK'].includes(workspace)?<>
      <section className="inventoryOpsToolbar">
        <nav aria-label="로켓그로스 재고 필터">{FILTERS.map(([id,label])=><button type="button" className={filter===id?'active':''} onClick={()=>{setFilter(id);setVisibleCount(24);}} key={id}>{label}</button>)}</nav>
        <input type="search" aria-label="로켓그로스 상품명 검색" placeholder="상품명·SKU 찾기" value={query} onChange={event=>{setQuery(event.target.value);setVisibleCount(24);}}/>
      </section>
      {bulkBar}
      <section className="inventoryOpsList">{displayed.map(item=><RocketGrowthInventoryRow item={item} selected={bulkSelection.isSelected(itemKey(item))} onSelect={checked=>bulkSelection.toggle(itemKey(item),checked)} key={item.vendor_item_id}/>) }{!filtered.length&&(sourceInventory.length?<HarinEmptyState state="empty" title="이 조건에 해당하는 판매 상품이 없어요" description="판매중단·30일 판매 0개·판매가능 0개 SKU는 운영 화면에서 제외합니다."/>:<HarinEmptyState state="uncollected" title="로켓그로스 재고가 아직 수집되지 않았어요" description="재고 수집 버튼을 누르면 서울 고정 IP 서버에서 판매 중 SKU를 가져옵니다."/>)}</section>
      {workspace!=='OVERVIEW'&&visibleCount<filtered.length?<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(value=>value+24)}>SKU 24개 더 보기 <small>{visible.length}/{filtered.length}</small></button>:null}
    </>:null}

    {workspace==='REPLENISH'?<>
      <section className="inventoryPlannerControls"><div><span><HarinIcon name="sparkles" size={20}/><b>목표 보유일을 골라보세요</b></span><p>로켓그로스 판매가능 수량과 최근 30일 판매속도로 필요한 입고량을 다시 계산합니다.</p></div><nav aria-label="목표 재고 보유일">{[14,30,45,60].map(days=><button type="button" className={targetDays===days?'active':''} onClick={()=>setTargetDays(days)} key={days}>{days}일</button>)}</nav><aside><small>현재 선택</small><b>{targetDays}일분</b><em>미리보기만 제공</em></aside></section>
      {bulkBar}
      <section className="inventoryReplenishmentList">{replenishmentItems.length?replenishmentItems.map(item=><RocketGrowthReplenishmentCard item={item} targetDays={targetDays} selected={bulkSelection.isSelected(itemKey(item))} onSelect={checked=>bulkSelection.toggle(itemKey(item),checked)} key={item.vendor_item_id}/>):<HarinEmptyState state={sourceInventory.length?'empty':'uncollected'} title={sourceInventory.length?'입고량을 계산할 판매 상품이 없어요':'로켓그로스 재고가 아직 수집되지 않았어요'} description="최근 30일 판매와 판매가능 재고가 함께 있는 SKU만 입고 미리보기를 계산합니다."/>}</section>
    </>:null}

    {workspace==='EXPIRY'?<InventoryLotWorkbench inventory={inventory} lots={lotRecords} setLots={setLotRecords}/>:null}

    {workspace==='HISTORY'?<section className="inventoryHistoryList"><header><div><span>ROCKET GROWTH SNAPSHOTS</span><h2>SKU별 최근 재고 기준 시각</h2></div><small>쿠팡 로켓그로스 API 기준</small></header>{history.length?history.map(item=><article key={item.vendor_item_id}><span className={String(item.stock_status||'unknown').toLowerCase()}>RG</span><b>{itemName(item)}</b><small>{dateTime(item.snapshot_at||item.updated_at)}</small></article>):<HarinEmptyState state="uncollected" title="로켓그로스 재고 수집 기록이 없어요" description="최초 수집이 끝나면 SKU별 기준 시각을 여기에 표시합니다."/>}</section>:null}

    <HarinPageAiRegion className="operationsAiSlot inventoryAiSlot" id="page-ai-analysis" title="로켓그로스 재고 AI 분석">{aiPanel}</HarinPageAiRegion>
    <details className="inventoryOpsHelp"><summary>도움말 · 어떤 상품과 날짜를 보나요?</summary><div><p><b>최근 30일 판매와 판매가능 재고가 모두 있는 상품</b>만 표시합니다. 판매중단·판매 0개·판매가능 0개 SKU와 Cafe24·네이버·판매자배송 재고는 섞지 않아요.</p><p><b>유통기한·LOT</b>는 쿠팡 재고 API가 제공하는 값이 아니라 실제 입고표를 보고 사장님이 기록한 운영 자료입니다. 30일 안 만료부터 먼저 확인할 수 있어요.</p></div></details>
  </HarinPageFrame>;
}
