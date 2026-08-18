'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import bulkSelectionModule from '../../lib/ui/bulk-selection.js';
import { HarinPictogram } from './harin-ui.js';

const { normalizeIds, reconcileSelection, selectionState, toggleSelection, toggleSelectionScope } = bulkSelectionModule;
const join=(...values)=>values.filter(Boolean).join(' ');
const EMPTY_IDS=Object.freeze([]);

export function useHarinBulkSelection({ allIds=EMPTY_IDS, visibleIds=EMPTY_IDS, filteredIds=EMPTY_IDS } = {}) {
  const [selectedIds,setSelectedIds]=useState([]);
  const normalizedAll=useMemo(()=>normalizeIds(allIds),[allIds]);
  const normalizedVisible=useMemo(()=>normalizeIds(visibleIds),[visibleIds]);
  const normalizedFiltered=useMemo(()=>normalizeIds(filteredIds),[filteredIds]);

  useEffect(()=>{
    setSelectedIds(current=>{
      const next=reconcileSelection(current,normalizedAll);
      return next.length===current.length&&next.every((id,index)=>id===current[index])?current:next;
    });
  },[normalizedAll]);

  const selectedSet=useMemo(()=>new Set(selectedIds),[selectedIds]);
  const visibleState=useMemo(()=>selectionState(selectedIds,normalizedVisible),[selectedIds,normalizedVisible]);
  const filteredState=useMemo(()=>selectionState(selectedIds,normalizedFiltered),[selectedIds,normalizedFiltered]);
  const toggle=useCallback((id,checked)=>setSelectedIds(current=>toggleSelection(current,id,checked)),[]);
  const toggleScope=useCallback((scopeIds,checked)=>setSelectedIds(current=>toggleSelectionScope(current,scopeIds,checked)),[]);
  const clear=useCallback(()=>setSelectedIds([]),[]);

  return {
    selectedIds,
    selectedSet,
    selectedCount:selectedIds.length,
    visibleState,
    filteredState,
    isSelected:useCallback(id=>selectedSet.has(String(id)),[selectedSet]),
    toggle,
    toggleScope,
    clear
  };
}

export function HarinBulkCheckbox({ checked=false, mixed=false, onChange, label='선택', className='', ...props }) {
  const ref=useRef(null);
  useEffect(()=>{if(ref.current)ref.current.indeterminate=Boolean(mixed);},[mixed]);
  return <input ref={ref} className={join('v8BulkCheckbox',className)} type="checkbox" checked={Boolean(checked)} aria-label={label} aria-checked={mixed?'mixed':Boolean(checked)} onChange={onChange} {...props}/>;
}

export function HarinBulkSelectionBar({ selectedCount=0, visibleCount=0, filteredCount=0, visibleState={}, filteredState={}, onToggleVisible, onToggleFiltered, onClear, summary, preview, className='', children }) {
  const active=selectedCount>0;
  return <section className={join('v8BulkSelectionBar',active&&'active',className)} aria-label="일괄 선택 작업" aria-live="polite">
    <header><HarinPictogram icon="checklist" tone="lavender" size={19}/><span><b>{selectedCount}개 선택</b><small>{summary||'목록에서 필요한 항목을 한 번에 선택하세요.'}</small></span></header>
    <div className="v8BulkSelectionScopes">
      <button type="button" className={visibleState.checked?'selected':''} onClick={()=>onToggleVisible?.(!visibleState.checked)} disabled={!visibleCount}>{visibleState.checked?'현재 화면 선택 해제':`현재 화면 ${visibleCount}개 선택`}</button>
      <button type="button" className={filteredState.checked?'selected':''} onClick={()=>onToggleFiltered?.(!filteredState.checked)} disabled={!filteredCount}>{filteredState.checked?'검색 결과 선택 해제':`검색 결과 ${filteredCount}개 선택`}</button>
      {active?<button type="button" className="clear" onClick={onClear}>전체 선택 해제</button>:null}
    </div>
    {children?<div className="v8BulkSelectionActions">{children}</div>:null}
    {preview?<small className="v8BulkSelectionPreview">{preview}</small>:null}
  </section>;
}
