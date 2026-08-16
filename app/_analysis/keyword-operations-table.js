'use client';

import { useEffect, useMemo, useState } from 'react';
import keywordOperationsModule from '../../lib/marketing/keyword-operations.js';
import { useStoredState } from '../use-hub-preference.js';

const {normalizeKeywordRows,filterKeywordRows,paginateKeywordRows,keywordOperationSummary}=keywordOperationsModule;
const PLATFORM_LABEL={NAVER:'네이버',COUPANG:'쿠팡'};
const DECISION_LABEL={LOWER:'감액 검토',RAISE:'확대 검토',KEEP:'유지',BLOCKED:'판단 보류',WATCH:'관찰',NEGATIVE_REVIEW:'제외 검토',SEPARATE:'분리 운영',LANDING_REVIEW:'랜딩 점검',NEW_KEYWORD:'신규 등록',CONTENT_FAQ:'콘텐츠 보강',OBSERVE:'관찰'};
const WORKSPACE_COPY={
  registered:['KEYWORD OPERATIONS','플랫폼별 광고 키워드를 각각 운영해요','네이버와 쿠팡은 별도 표로 열리며, 네이버는 입찰 초안·쿠팡은 WING 수동 적용 목록으로 관리합니다.'],
  'search-terms':['ACTUAL SEARCH TERMS','고객이 실제 입력한 검색어를 표로 비교해요','등록 키워드와 섞지 않고 제외·신규 등록·콘텐츠 후보를 빠르게 찾습니다.'],
  diagnosis:['SAVING & GROWTH','절감·확대 후보만 모아 우선순위를 정해요','광고비 손실, 목표 ROAS 미달, 확대 후보를 실제 근거와 함께 봅니다.'],
  history:['CHANGE HISTORY','변경 기록과 검증 결과를 한곳에서 확인해요','실행 전후 값과 상태를 보존하며, 기록이 없으면 빈 결과를 그대로 표시합니다.']
};
const number=value=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const won=value=>value==null?'판단 보류':`${Math.round(value).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const percent=value=>value==null?'판단 보류':`${Number(value).toFixed(0)}%`;
const clamp=(value,min,max)=>Math.min(max??value,Math.max(min??value,value));

function KeywordPictogram(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14M5 12h8M5 17.5h5"/><circle cx="17" cy="15.5" r="3.5"/><path d="m19.5 18 2 2"/></svg>;}

function StatusPill({row}){
  const label=row.applicationMode==='MANUAL_REQUIRED'?'수동 적용 필요':row.canDraft?'변경안 작성 가능':DECISION_LABEL[row.decision]||row.status||'확인 필요';
  const tone=row.applicationMode==='MANUAL_REQUIRED'?'manual':row.canDraft?'ready':row.status==='HISTORY'?'history':'blocked';
  return <span className={`keywordOpsStatus ${tone}`}>{label}</span>;
}

export default function KeywordOperationsTable({workspace='registered',platform='all',data={}}){
  const [query,setQuery]=useState('');
  const [settings,setSettings]=useStoredState('keyword-operations-view',{quickFilter:'ALL',sort:'COST_DESC',pageSize:25});
  const quickFilter=['ALL','NO_ORDER_COST','LOW_ROAS','READY','MANUAL'].includes(settings?.quickFilter)?settings.quickFilter:'ALL';
  const sort=['COST_DESC','CLICKS_DESC','ROAS_DESC','KEYWORD_ASC'].includes(settings?.sort)?settings.sort:'COST_DESC';
  const pageSize=[25,50,100].includes(Number(settings?.pageSize))?Number(settings.pageSize):25;
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState([]);
  const [drafts,setDrafts]=useState({});
  const [detailId,setDetailId]=useState('');
  const copy=WORKSPACE_COPY[workspace]||WORKSPACE_COPY.registered;
  const sourceRows=useMemo(()=>normalizeKeywordRows({naverBidWorkbench:data.naverBidWorkbench,searchTermCenter:data.naver?.searchTermCenter,coupang:data.coupang,actions:data.actions,workspace,platform}),[data.naverBidWorkbench,data.naver?.searchTermCenter,data.coupang,data.actions,workspace,platform]);
  const rows=useMemo(()=>filterKeywordRows(sourceRows,{query,quickFilter,sort}),[sourceRows,query,quickFilter,sort]);
  const pagination=useMemo(()=>paginateKeywordRows(rows,page,pageSize),[rows,page,pageSize]);
  const summary=useMemo(()=>keywordOperationSummary(sourceRows),[sourceRows]);
  const visibleIds=pagination.items.map(item=>item.id);
  const visibleSelected=visibleIds.length>0&&visibleIds.every(id=>selected.includes(id));
  const selectedRows=sourceRows.filter(item=>selected.includes(item.id));
  const draftableSelected=selectedRows.filter(item=>item.canDraft);
  const changedRows=draftableSelected.filter(item=>number(drafts[item.id])!=null&&number(drafts[item.id])!==item.currentBid);
  const detail=sourceRows.find(item=>item.id===detailId)||null;
  const currentTotal=changedRows.reduce((sum,item)=>sum+Number(item.currentBid||0),0);
  const draftTotal=changedRows.reduce((sum,item)=>sum+Number(drafts[item.id]||0),0);

  useEffect(()=>{setPage(1);setSelected([]);setDrafts({});setDetailId('');},[workspace,platform]);
  useEffect(()=>{setPage(1);},[query,quickFilter,sort,pageSize]);

  function saveSettings(next){setSettings({...settings,...next});}
  function toggle(id){setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);}
  function toggleVisible(){setSelected(current=>visibleSelected?current.filter(id=>!visibleIds.includes(id)):[...new Set([...current,...visibleIds])]);}
  function setDraft(row,value){
    if(!row.canDraft)return;
    if(value===''){setDrafts(current=>({...current,[row.id]:''}));return;}
    const parsed=number(value);if(parsed==null)return;
    setDrafts(current=>({...current,[row.id]:Math.round(parsed/10)*10}));
  }
  function applyRecommended(){setDrafts(current=>{const next={...current};for(const row of draftableSelected)if(row.recommendedBid!=null)next[row.id]=row.recommendedBid;return next;});}
  function applyPercent(rate){setDrafts(current=>{const next={...current};for(const row of draftableSelected){const base=number(current[row.id])??row.currentBid;if(base!=null)next[row.id]=Math.round(clamp(base*(1+rate),row.minimumBid,row.maximumBid)/10)*10;}return next;});}

  return <section className="keywordOps" id="keyword-operations-table">
    <header className="keywordOpsHeader"><div><span>{copy[0]}</span><div><i><KeywordPictogram/></i><section><h2>{copy[1]}</h2><p>{copy[2]}</p><small className="keywordOpsSeparation">네이버와 쿠팡은 서로 섞지 않고 현재 선택한 플랫폼만 표시합니다.</small></section></div></div><aside><small>표시 데이터</small><strong>{count(sourceRows.length)}개</strong><em>{PLATFORM_LABEL[String(platform).toUpperCase()]}</em></aside></header>
    <div className="keywordOpsSummary"><span><small>운영 대상</small><b>{count(summary.total)}개</b><em>현재 선택 범위</em></span><span><small>네이버 변경안 가능</small><b>{count(summary.ready)}개</b><em>승인 전 실행 안 함</em></span><span className={summary.noOrderCost>0?'danger':''}><small>무주문 광고비</small><b>{won(summary.noOrderCost)}</b><em>절감 우선 확인</em></span><span><small>쿠팡 수동 적용</small><b>{count(summary.manual)}개</b><em>자동반영으로 표시 안 함</em></span></div>
    <div className="keywordOpsToolbar">
      <label className="keywordOpsSearch"><span>키워드·캠페인·상품 찾기</span><div><i aria-hidden="true">⌕</i><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: 작두콩차, 티백, 캠페인명"/></div></label>
      <label><span>빠른 보기</span><select value={quickFilter} onChange={event=>saveSettings({quickFilter:event.target.value})}><option value="ALL">전체 보기</option><option value="NO_ORDER_COST">광고비 사용·주문 0</option><option value="LOW_ROAS">ROAS 700% 미만</option><option value="READY">네이버 변경안 가능</option><option value="MANUAL">쿠팡 수동 적용</option></select></label>
      <label><span>정렬</span><select value={sort} onChange={event=>saveSettings({sort:event.target.value})}><option value="COST_DESC">광고비 높은 순</option><option value="CLICKS_DESC">클릭 많은 순</option><option value="ROAS_DESC">ROAS 높은 순</option><option value="KEYWORD_ASC">키워드 이름 순</option></select></label>
      <label><span>한 페이지</span><select value={pageSize} onChange={event=>saveSettings({pageSize:Number(event.target.value)})}><option value="25">25개</option><option value="50">50개</option><option value="100">100개</option></select></label>
    </div>
    <div className={`keywordOpsBatch ${selected.length?'active':''}`}>
      <span><b>{selected.length}개 선택</b><small>네이버 초안 가능 {draftableSelected.length}개 · 변경값 입력 {changedRows.length}개</small></span>
      <div><button type="button" onClick={applyRecommended} disabled={!draftableSelected.length}>추천가 채우기</button><button type="button" onClick={()=>applyPercent(-.1)} disabled={!draftableSelected.length}>10% 인하</button><button type="button" onClick={()=>applyPercent(.1)} disabled={!draftableSelected.length}>10% 인상</button><button type="button" className="review" onClick={()=>changedRows[0]&&setDetailId(changedRows[0].id)} disabled={!changedRows.length}>변경 전 검토</button></div>
      {changedRows.length?<small className="keywordOpsPreview">현재 합계 {won(currentTotal)} → 초안 합계 {won(draftTotal)} · 실제 반영은 15-5 승인 단계에서만 가능합니다.</small>:null}
    </div>
    <div className={`keywordOpsLayout ${detail?'hasDetail':''}`}>
      <div className="keywordOpsTableWrap">
        <div className="keywordOpsTable" role="table" aria-label="네이버 쿠팡 키워드 통합 운영표">
          <div className="keywordOpsRow head" role="row"><span><input type="checkbox" aria-label="현재 페이지 전체 선택" checked={visibleSelected} onChange={toggleVisible}/></span><span>키워드·플랫폼</span><span>캠페인·상품</span><span>현재 입찰가</span><span>추천 입찰가</span><span>변경 입찰가</span><span>클릭</span><span>광고비</span><span>주문</span><span>ROAS</span><span>실제 이익</span><span>상태</span></div>
          {pagination.items.map(row=>{const changed=number(drafts[row.id])!=null&&number(drafts[row.id])!==row.currentBid;return <div className={`keywordOpsRow ${selected.includes(row.id)?'selected':''} ${changed?'changed':''}`} role="row" key={row.id} onClick={()=>setDetailId(row.id)}>
            <span onClick={event=>event.stopPropagation()}><input type="checkbox" aria-label={`${row.keyword} 선택`} checked={selected.includes(row.id)} onChange={()=>toggle(row.id)}/></span>
            <span className="keywordOpsName"><i className={row.platform.toLowerCase()}>{row.platform==='NAVER'?'N':'C'}</i><b>{row.keyword}</b><small>{PLATFORM_LABEL[row.platform]} · {row.source==='SEARCH_TERM'?'실제 검색어':row.source==='HISTORY'?'변경 기록':'광고 키워드'}</small></span>
            <span className="keywordOpsScope"><b>{row.campaign}</b><small>{row.product}</small></span>
            <span><b>{won(row.currentBid)}</b></span><span className="recommended"><b>{won(row.recommendedBid)}</b></span>
            <span className="keywordOpsDraft" onClick={event=>event.stopPropagation()}>{row.canDraft?<input type="number" step="10" min={row.minimumBid??100} max={row.maximumBid??100000} value={drafts[row.id]??''} placeholder={row.recommendedBid??'-'} aria-label={`${row.keyword} 변경 입찰가`} onChange={event=>setDraft(row,event.target.value)} onBlur={()=>{const value=number(drafts[row.id]);if(value!=null)setDraft(row,clamp(value,row.minimumBid,row.maximumBid));}}/>:<em>{row.applicationMode==='MANUAL_REQUIRED'?'WING':'-'}</em>}</span>
            <span>{count(row.clicks)}</span><span><b>{won(row.cost)}</b></span><span>{count(row.orders)}</span><span>{percent(row.roas)}</span><span className="blockedValue">판단 보류</span><span><StatusPill row={row}/></span>
          </div>;})}
          {!pagination.items.length?<div className="keywordOpsEmpty"><i><KeywordPictogram/></i><b>{workspace==='history'?'아직 표시할 키워드 변경 기록이 없어요':'조건에 맞는 키워드가 없어요'}</b><p>{workspace==='history'?'15-5에서 승인·실행한 변경은 이 화면에서 성과검증까지 연결됩니다.':'검색어나 빠른 보기를 바꾸면 원본 데이터를 다시 확인할 수 있습니다.'}</p></div>:null}
        </div>
        <footer className="keywordOpsPagination"><span>전체 {count(pagination.total)}개 · {pagination.page}/{pagination.totalPages}쪽</span><div><button type="button" disabled={pagination.page<=1} onClick={()=>setPage(value=>value-1)}>이전</button><button type="button" disabled={pagination.page>=pagination.totalPages} onClick={()=>setPage(value=>value+1)}>다음</button></div></footer>
      </div>
      {detail?<aside className="keywordOpsDetail" aria-label="선택 키워드 상세"><header><span>KEYWORD DETAIL</span><button type="button" onClick={()=>setDetailId('')} aria-label="상세 닫기">×</button></header><div className="keywordOpsDetailTitle"><i className={detail.platform.toLowerCase()}>{detail.platform==='NAVER'?'N':'C'}</i><span><b>{detail.keyword}</b><small>{PLATFORM_LABEL[detail.platform]} · {detail.campaign}</small></span></div><dl><div><dt>광고비</dt><dd>{won(detail.cost)}</dd></div><div><dt>주문·전환</dt><dd>{count(detail.orders)}건</dd></div><div><dt>ROAS</dt><dd>{percent(detail.roas)}</dd></div><div><dt>최신 기준</dt><dd>{detail.freshness||'확인 필요'}</dd></div></dl><section><b>판단 근거</b>{detail.reasons.length?<ul>{detail.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>:<p>서버 계산 결과 추가 차단 사유가 없습니다.</p>}</section><section className="keywordOpsDetailSafety"><b>{detail.applicationMode==='MANUAL_REQUIRED'?'쿠팡 적용 방법':'변경 안전장치'}</b><p>{detail.applicationMode==='MANUAL_REQUIRED'?'현재는 WING에서 직접 적용해야 하며, 허브는 성공으로 표시하지 않습니다.':'여기서 만든 값은 초안입니다. 승인·실행·재조회는 다음 단계에서 분리해 연결합니다.'}</p></section></aside>:null}
    </div>
    {selected.length?<div className="keywordOpsMobileAction"><span><b>선택 {selected.length}개</b><small>변경 초안 {changedRows.length}개</small></span><button type="button" onClick={applyRecommended} disabled={!draftableSelected.length}>추천가 채우기</button></div>:null}
  </section>;
}
