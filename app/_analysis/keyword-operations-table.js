'use client';

import { useEffect, useMemo, useState } from 'react';
import keywordOperationsModule from '../../lib/marketing/keyword-operations.js';
import coupangWingWorklistModule from '../../lib/marketing/coupang-wing-worklist.js';
import { useStoredState } from '../use-hub-preference.js';
import { HarinBulkCheckbox, HarinBulkSelectionBar, useHarinBulkSelection } from '../_design-system/harin-bulk-selection.js';
import KeywordBidRulePanel from './keyword-bid-rule-panel.js';
import KeywordBidSchedulePanel from './keyword-bid-schedule-panel.js';

const {DEFAULT_KEYWORD_VIEW,KEYWORD_PAGE_SIZES,KEYWORD_SORT_OPTIONS,normalizeKeywordView,describeKeywordView,nextKeywordSort,normalizeKeywordRows,filterKeywordRows,paginateKeywordRows,buildNaverAdgroupWorkspace}=keywordOperationsModule;
const {COUPANG_AD_CAPABILITY,ACTION_LABELS,buildCoupangWingWorklist,coupangWingCsv,coupangWingClipboard}=coupangWingWorklistModule;
const PLATFORM_LABEL={NAVER:'네이버',COUPANG:'쿠팡'};
const DECISION_LABEL={LOWER:'감액 검토',RAISE:'확대 검토',KEEP:'유지',BLOCKED:'판단 보류',WATCH:'관찰',NEGATIVE_REVIEW:'제외 검토',SEPARATE:'분리 운영',LANDING_REVIEW:'랜딩 점검',NEW_KEYWORD:'신규 등록',CONTENT_FAQ:'콘텐츠 보강',OBSERVE:'관찰'};
const HISTORY_STATUS={PREVIEWED:'확인 대기',APPROVED:'실행 대기',EXECUTING:'반영 중',EXECUTED:'재조회 대기',VERIFIED:'반영 확인',VERIFICATION_FAILED:'재조회 불일치',FAILED:'실행 실패',STALE:'새 변경안 필요',EXPIRED:'변경안 만료',REJECTED:'취소',ROLLED_BACK:'원래 값 복구'};
const WORKSPACE_COPY={
  registered:['KEYWORD OPERATIONS','플랫폼별 광고 키워드를 각각 운영해요','네이버와 쿠팡은 서로 섞지 않고 별도 표로 열리며, 네이버는 입찰 직접 변경·쿠팡은 WING 수동 적용 목록으로 관리합니다.'],
  'search-terms':['ACTUAL SEARCH TERMS','고객이 실제 입력한 검색어를 표로 비교해요','등록 키워드와 섞지 않고 제외·신규 등록·콘텐츠 후보를 빠르게 찾습니다.'],
  diagnosis:['SAVING & GROWTH','절감·확대 후보만 모아 우선순위를 정해요','광고비 손실, 목표 ROAS 미달, 확대 후보를 실제 근거와 함께 봅니다.'],
  history:['CHANGE HISTORY','변경 기록과 검증 결과를 한곳에서 확인해요','실행 전후 값과 상태를 보존하며, 기록이 없으면 빈 결과를 그대로 표시합니다.']
};
const number=value=>{if(value===null||value===undefined||value==='')return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;};
const won=value=>value==null?'판단 보류':`${Math.round(value).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const percent=value=>value==null?'판단 보류':`${Number(value).toFixed(0)}%`;
const clamp=(value,min,max)=>Math.min(max??value,Math.max(min??value,value));

function KeywordPictogram(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h14M5 12h8M5 17.5h5"/><circle cx="17" cy="15.5" r="3.5"/><path d="m19.5 18 2 2"/></svg>;}

function KeywordSortHeader({field,label,sort,onChange,disabled=false}){
  if(disabled)return <span role="columnheader">{label}</span>;
  const active=sort.startsWith(`${field}_`);
  const direction=active&&sort.endsWith('_ASC')?'ascending':active?'descending':'none';
  return <span role="columnheader" aria-sort={direction}><button type="button" className={`keywordOpsSortButton ${active?'active':''}`} onClick={()=>onChange(nextKeywordSort(sort,field))} title={`${label} 정렬 방향 바꾸기`}><b>{label}</b><i aria-hidden="true">{direction==='ascending'?'↑':direction==='descending'?'↓':'↕'}</i></button></span>;
}

function StatusPill({row,mutationState}){
  if(mutationState==='APPLYING')return <span className="keywordOpsStatus history">적용 중</span>;
  if(mutationState==='APPLIED')return <span className="keywordOpsStatus ready">반영 완료</span>;
  if(mutationState==='FAILED')return <span className="keywordOpsStatus blocked">다시 확인</span>;
  if(row.adCategoryState==='INACTIVE')return <span className="adCategoryBadge inactive">사용중지</span>;
  const label=row.applicationMode==='MANUAL_REQUIRED'?'수동 적용 필요':row.applicationMode==='HISTORY'?(HISTORY_STATUS[row.status]||row.status||'기록 확인'):row.manualDecreaseOnly?'직접 감액 가능':row.canDraft?'직접 변경 가능':DECISION_LABEL[row.decision]||row.status||'확인 필요';
  const tone=row.applicationMode==='MANUAL_REQUIRED'?'manual':row.canDraft?'ready':row.applicationMode==='HISTORY'?'history':'blocked';
  return <span className={`keywordOpsStatus ${tone}`}>{label}</span>;
}

export default function KeywordOperationsTable({workspace='registered',platform='naver',data={}}){
  const [query,setQuery]=useState('');
  const isCoupang=platform==='coupang';
  const sortOptions=KEYWORD_SORT_OPTIONS.filter(option=>!option.naverOnly||!isCoupang);
  const [settings,setSettings]=useStoredState(`keyword-operations-view-${platform}`,DEFAULT_KEYWORD_VIEW);
  const [groupSettings,setGroupSettings]=useStoredState('naver-keyword-group-workspace',{campaignId:'ALL',adgroupId:'ALL'});
  const [wingDrafts,setWingDrafts]=useStoredState('coupang-wing-keyword-worklist',{});
  const viewSettings=normalizeKeywordView(platform,settings);
  const {quickFilter,sort,pageSize}=viewSettings;
  const [page,setPage]=useState(1);
  const [drafts,setDrafts]=useState({});
  const [instantRows,setInstantRows]=useState({});
  const [mutationStates,setMutationStates]=useState({});
  const [detailId,setDetailId]=useState('');
  const [reviewOpen,setReviewOpen]=useState(false);
  const [working,setWorking]=useState(false);
  const [proposalResult,setProposalResult]=useState(null);
  const [wingOpen,setWingOpen]=useState(false);
  const [wingPage,setWingPage]=useState(1);
  const [wingNotice,setWingNotice]=useState('');
  const [bidRules,setBidRules]=useState([]);
  const [bidRuleLoadState,setBidRuleLoadState]=useState('IDLE');
  const copy=WORKSPACE_COPY[workspace]||WORKSPACE_COPY.registered;
  const rawSourceRows=useMemo(()=>normalizeKeywordRows({naverBidWorkbench:data.naverBidWorkbench,searchTermCenter:data.naver?.searchTermCenter,coupang:data.coupang,financialChanges:data.financialChanges,workspace,platform}),[data.naverBidWorkbench,data.naver?.searchTermCenter,data.coupang,data.financialChanges,workspace,platform]);
  const sourceRows=useMemo(()=>rawSourceRows.map(row=>instantRows[row.id]?{...row,...instantRows[row.id]}:row),[rawSourceRows,instantRows]);
  const groupEnabled=!isCoupang&&['registered','diagnosis'].includes(workspace);
  const naverGroupCatalog=useMemo(()=>buildNaverAdgroupWorkspace(sourceRows),[sourceRows]);
  const campaignId=groupEnabled&&naverGroupCatalog.campaigns.some(item=>item.id===groupSettings?.campaignId)?groupSettings.campaignId:'ALL';
  const campaignWorkspace=useMemo(()=>buildNaverAdgroupWorkspace(sourceRows,{campaignId}),[sourceRows,campaignId]);
  const adgroupId=groupEnabled&&campaignWorkspace.adgroups.some(item=>item.id===groupSettings?.adgroupId)?groupSettings.adgroupId:'ALL';
  const naverGroupWorkspace=useMemo(()=>buildNaverAdgroupWorkspace(sourceRows,{campaignId,adgroupId}),[sourceRows,campaignId,adgroupId]);
  const tableSourceRows=groupEnabled?naverGroupWorkspace.filteredRows:sourceRows;
  const rows=useMemo(()=>filterKeywordRows(tableSourceRows,{query,quickFilter,sort}),[tableSourceRows,query,quickFilter,sort]);
  const selectedCampaign=campaignId==='ALL'?null:naverGroupCatalog.campaigns.find(item=>item.id===campaignId)||null;
  const selectedAdgroup=adgroupId==='ALL'?null:campaignWorkspace.adgroups.find(item=>item.id===adgroupId)||null;
  const selectedCampaignName=selectedCampaign?.name||'';
  const selectedAdgroupName=selectedAdgroup?.name||'';
  const viewState=describeKeywordView({platform,query,quickFilter,sort,pageSize,campaignName:selectedCampaignName,adgroupName:selectedAdgroupName,filteredCount:rows.length});
  const pagination=useMemo(()=>paginateKeywordRows(rows,page,pageSize),[rows,page,pageSize]);
  const allIds=useMemo(()=>tableSourceRows.filter(item=>item.adCategoryState!=='INACTIVE').map(item=>item.id),[tableSourceRows]);
  const filteredIds=useMemo(()=>rows.filter(item=>item.adCategoryState!=='INACTIVE').map(item=>item.id),[rows]);
  const visibleIds=useMemo(()=>pagination.items.filter(item=>item.adCategoryState!=='INACTIVE').map(item=>item.id),[pagination.items]);
  const selection=useHarinBulkSelection({allIds,filteredIds,visibleIds});
  const selectedRows=sourceRows.filter(item=>selection.selectedSet.has(String(item.id)));
  const naverRuleSelected=selectedRows.filter(item=>item.platform==='NAVER'&&item.source==='REGISTERED');
  const draftableSelected=selectedRows.filter(item=>item.canDraft);
  const recommendedSelected=draftableSelected.filter(item=>item.recommendedBid!=null);
  const increasableSelected=draftableSelected.filter(item=>item.maximumBid!=null&&item.currentBid!=null&&item.maximumBid>item.currentBid);
  const coupangSelected=selectedRows.filter(item=>item.platform==='COUPANG'&&item.applicationMode==='MANUAL_REQUIRED');
  const changedRows=draftableSelected.filter(item=>number(drafts[item.id])!=null&&number(drafts[item.id])!==item.currentBid);
  const wingItems=useMemo(()=>buildCoupangWingWorklist(coupangSelected,wingDrafts),[coupangSelected,wingDrafts]);
  const wingPagination=useMemo(()=>paginateKeywordRows(wingItems,wingPage,KEYWORD_PAGE_SIZES[0]),[wingItems,wingPage]);
  const bidRuleMap=useMemo(()=>new Map(bidRules.map(item=>[String(item.ncc_keyword_id),item])),[bidRules]);
  const detail=sourceRows.find(item=>item.id===detailId)||null;
  const currentTotal=changedRows.reduce((sum,item)=>sum+Number(item.currentBid||0),0);
  const draftTotal=changedRows.reduce((sum,item)=>sum+Number(drafts[item.id]||0),0);

  useEffect(()=>{setPage(1);selection.clear();setDrafts({});setInstantRows({});setMutationStates({});setDetailId('');setReviewOpen(false);setProposalResult(null);setWingOpen(false);setWingPage(1);setWingNotice('');},[workspace,platform]);
  useEffect(()=>{setPage(1);},[query,quickFilter,sort,pageSize]);
  useEffect(()=>{
    if(isCoupang||!groupEnabled){setBidRules([]);setBidRuleLoadState('IDLE');return undefined;}
    const controller=new AbortController();
    setBidRuleLoadState('LOADING');
    fetch('/api/naver/bid-rules',{cache:'no-store',signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'입찰 안전설정을 불러오지 못했습니다.');return result.rules||[];})
      .then(result=>{setBidRules(result);setBidRuleLoadState('READY');})
      .catch(error=>{if(error.name!=='AbortError'){setBidRules([]);setBidRuleLoadState('FAILED');}});
    return ()=>controller.abort();
  },[platform,workspace,isCoupang,groupEnabled]);

  function saveSettings(next){setSettings({...viewSettings,...next});}
  function resetView(){
    setQuery('');setSettings({...DEFAULT_KEYWORD_VIEW});setPage(1);setDetailId('');selection.clear();
    if(groupEnabled)setGroupSettings({campaignId:'ALL',adgroupId:'ALL'});
  }
  function selectCampaign(next){setGroupSettings({campaignId:next,adgroupId:'ALL'});setPage(1);selection.clear();}
  function selectAdgroup(next){setGroupSettings({campaignId,adgroupId:next});setPage(1);selection.clear();}
  function setDraft(row,value){
    if(!row.canDraft)return;
    if(value===''){setDrafts(current=>({...current,[row.id]:''}));return;}
    const parsed=number(value);if(parsed==null)return;
    setDrafts(current=>({...current,[row.id]:Math.round(parsed/10)*10}));
  }
  function applyRecommended(){setDrafts(current=>{const next={...current};for(const row of recommendedSelected)next[row.id]=row.recommendedBid;return next;});}
  function applyPercent(rate){setDrafts(current=>{const next={...current};for(const row of draftableSelected){if(rate>0&&!(row.maximumBid>row.currentBid))continue;const base=number(current[row.id])??row.currentBid;if(base!=null)next[row.id]=Math.round(clamp(base*(1+rate),row.minimumBid,row.maximumBid)/10)*10;}return next;});}
  function applyRuleDrafts(items){
    setDrafts(current=>{const next={...current};for(const item of items){if(item?.row?.canDraft&&item?.preview?.proposed_bid!=null)next[item.row.id]=item.preview.proposed_bid;}return next;});
  }
  function setWingDraft(id,field,value){
    setWingDrafts(current=>({...current,[id]:{...(current?.[id]||{}),[field]:value}}));
  }
  function setDetailDraft(row,value){selection.toggle(row.id,true);setDraft(row,value);}
  function openWingWorklist(){if(isCoupang&&coupangSelected.length){setWingNotice('');setWingPage(1);setWingOpen(true);}}
  async function copyWingWorklist(){
    if(!wingItems.length)return;
    try{await navigator.clipboard.writeText(coupangWingClipboard(wingItems));setWingNotice('작업표를 복사했습니다. 아직 쿠팡에는 반영되지 않았습니다.');}
    catch{setWingNotice('복사 권한을 사용할 수 없습니다. CSV 내려받기를 이용해주세요.');}
  }
  function downloadWingWorklist(){
    if(!wingItems.length)return;
    const blob=new Blob([coupangWingCsv(wingItems)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const anchor=document.createElement('a');
    anchor.href=url;anchor.download=`coupang-wing-keywords-${new Date().toISOString().slice(0,10)}.csv`;anchor.click();
    URL.revokeObjectURL(url);setWingNotice('CSV를 내려받았습니다. WING에서 직접 반영한 뒤 결과를 다시 확인해주세요.');
  }
  async function applyConfirmedChanges(){
    if(platform!=='naver'||!changedRows.length||working)return;
    setWorking(true);setProposalResult(null);
    const applied=[],failed=[];
    for(const row of changedRows){
      const desired=number(drafts[row.id]);
      setMutationStates(current=>({...current,[row.id]:'APPLYING'}));
      if(!row.snapshotToken||desired==null){failed.push({id:row.id,keyword:row.keyword,error:'서버 미리보기를 새로 받아주세요.'});setMutationStates(current=>({...current,[row.id]:'FAILED'}));continue;}
      const snapshotKey=String(row.snapshotToken).slice(-20).replace(/[^A-Za-z0-9._:-]/g,'');
      const idempotencyKey=`kwbid:${row.id}:${desired}:${snapshotKey}`.slice(0,128);
      try{
        const response=await fetch('/api/naver/bid-proposals',{method:'POST',headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify({snapshot_token:row.snapshotToken,owner_desired_bid:desired})});
        const result=await response.json();
        if(!response.ok||!result.ok)throw new Error(result.error||'변경안을 만들지 못했습니다.');
        const requestId=result.request?.id;
        if(!requestId)throw new Error('변경 기록 ID를 받지 못했습니다.');
        const executeResponse=await fetch(`/api/financial-changes/${requestId}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CONFIRM_EXECUTE',confirm:true,note:'키워드 운영표에서 사장님 확인 후 즉시 실행'})});
        const executed=await executeResponse.json();
        if(!executeResponse.ok||!executed.ok)throw new Error(executed.error||'네이버에 반영하지 못했습니다.');
        if(executed.blocked||executed.applied===false)throw new Error(executed.request?.error_message||'현재값이 달라져 실행을 멈췄습니다.');
        if(!executed.verified)throw new Error(executed.request?.error_message||'반영 후 현재값이 일치하지 않습니다.');
        applied.push({id:row.id,keyword:row.keyword,requestId,reused:executed.reused===true,desired});
        setInstantRows(current=>({...current,[row.id]:{currentBid:desired,observedBid:desired,canDraft:false,status:'VERIFIED',decision:'WATCH',reasons:['네이버 반영 후 현재값 재조회까지 완료했습니다.']}}));
        setMutationStates(current=>({...current,[row.id]:'APPLIED'}));
      }catch(error){failed.push({id:row.id,keyword:row.keyword,error:error.message||'변경 실행 실패'});setMutationStates(current=>({...current,[row.id]:'FAILED'}));}
    }
    setProposalResult({applied,failed});setWorking(false);
    if(applied.length){
      const appliedIds=applied.map(item=>item.id);
      const appliedIdSet=new Set(appliedIds.map(String));
      selection.toggleScope(appliedIds,false);
      setDrafts(current=>Object.fromEntries(Object.entries(current).filter(([id])=>!appliedIdSet.has(String(id)))));
    }
  }

  return <section className={`keywordOps workspace-${workspace} platform-${platform}`} id="keyword-operations-table">
    <div className="keywordOpsContextStrip">
      <span><b>{copy[1]}</b><small>{copy[2]}</small></span>
      <em>{PLATFORM_LABEL[String(platform).toUpperCase()]} · 표시 데이터 {count(sourceRows.length)}개</em>
      <small className="keywordOpsSeparation">네이버와 쿠팡은 서로 섞지 않고 별도 작업대로 운영합니다.</small>
    </div>
    {isCoupang?<div className="keywordOpsCapability"><i>C</i><span><b>쿠팡 광고 입찰은 WING 수동 적용이에요</b><small>공개 Seller Open API 문서에서 광고 키워드 입찰 쓰기를 확인하지 못했습니다. 자동반영을 잠갔으며 광고 성과는 WING 파일 기준입니다.</small></span><a href={COUPANG_AD_CAPABILITY.docsUrl} target="_blank" rel="noreferrer">공식 문서 <em>↗</em></a><strong>2026. 8. 16. 확인</strong></div>:null}
    {groupEnabled?<section className="keywordOpsAdgroupWorkspace" aria-label="네이버 캠페인과 광고그룹 선택">
      <header><span><i aria-hidden="true"><KeywordPictogram/></i><span><b>광고그룹별 입찰 작업대</b><small>이미 수집된 네이버 캠페인·광고그룹을 기준으로 키워드를 좁혀요.</small></span></span><dl><div><dt>캠페인</dt><dd>{count(naverGroupWorkspace.summary.campaigns)}개</dd></div><div><dt>광고그룹</dt><dd>{count(naverGroupWorkspace.summary.adgroups)}개</dd></div><div><dt>키워드</dt><dd>{count(naverGroupWorkspace.summary.keywords)}개</dd></div><div><dt>광고비</dt><dd>{won(naverGroupWorkspace.summary.cost)}</dd></div></dl></header>
      <div className="keywordOpsCampaignFilter"><label><span className="keywordOpsCampaignLabel">캠페인{selectedCampaign?.operationalState==='INACTIVE'?<strong className="adCategoryBadge inactive">사용중지</strong>:null}</span><select value={campaignId} onChange={event=>selectCampaign(event.target.value)}><option value="ALL">전체 캠페인</option>{naverGroupCatalog.campaigns.map(item=><option key={item.id} value={item.id}>{item.name} · {count(item.keywordCount)}개{item.operationalState==='INACTIVE'?' · 사용중지':''}</option>)}</select></label><span><small>선택 범위 ROAS</small><b>{percent(naverGroupWorkspace.summary.roas)}</b></span></div>
      <div className="keywordOpsAdgroupRail" role="list" aria-label="광고그룹 빠른 필터"><button type="button" className={adgroupId==='ALL'?'active':''} onClick={()=>selectAdgroup('ALL')}><i>ALL</i><span><b>전체 광고그룹</b><small>{count(campaignWorkspace.summary.keywords)}개 키워드 · {won(campaignWorkspace.summary.cost)}</small></span></button>{campaignWorkspace.adgroups.map(item=><button type="button" role="listitem" className={`${adgroupId===item.id?'active':''} ${item.operationalState==='INACTIVE'?'inactive':''}`} key={item.id} onClick={()=>selectAdgroup(item.id)}><i>G</i><span><b>{item.name}</b>{item.operationalState==='INACTIVE'?<strong className="adCategoryBadge inactive">사용중지</strong>:null}<small>{count(item.keywordCount)}개 키워드 · {won(item.cost)}</small></span><em>{percent(item.roas)}</em></button>)}</div>
      {!isCoupang&&groupEnabled&&adgroupId!=='ALL'?(selectedAdgroup?.operationalState==='INACTIVE'?<p className="keywordOpsInactiveNotice"><strong className="adCategoryBadge inactive">사용중지</strong><span>중지된 광고 카테고리는 기록만 확인할 수 있고, 입찰가 변경과 자동입찰 예약에서는 제외됩니다.</span></p>:<KeywordBidSchedulePanel adgroupId={adgroupId} adgroupName={selectedAdgroup?.name||''} rules={bidRules}/>):null}
    </section>:null}
    <div className="keywordOpsToolbar">
      <label className="keywordOpsSearch"><span>키워드·캠페인·상품 찾기</span><div><i aria-hidden="true">⌕</i><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="예: 작두콩차, 티백, 캠페인명"/></div></label>
      <label><span>빠른 보기</span><select value={quickFilter} onChange={event=>saveSettings({quickFilter:event.target.value})}><option value="ALL">{isCoupang?'전체 보기':'전체 · 운영 중 우선'}</option>{!isCoupang?<><option value="ACTIVE_ADS">운영 중 광고</option><option value="INACTIVE_ADS">사용중지 광고</option></>:null}<option value="NO_ORDER_COST">광고비 사용·주문 0</option><option value="LOW_ROAS">ROAS 700% 미만</option>{isCoupang?<option value="MANUAL">WING 수동 적용</option>:<option value="READY">네이버 변경안 가능</option>}</select></label>
      <label><span>정렬</span><select value={sort} onChange={event=>saveSettings({sort:event.target.value})}>{sortOptions.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      <label><span>한 페이지</span><select value={pageSize} onChange={event=>saveSettings({pageSize:Number(event.target.value)})}>{KEYWORD_PAGE_SIZES.map(size=><option value={size} key={size}>{size}개</option>)}</select></label>
    </div>
    <div className={`keywordOpsViewState ${viewState.activeCount?'active':''}`} role="status" aria-live="polite">
      <i aria-hidden="true"><KeywordPictogram/></i>
      <span><b>{viewState.headline}</b><small>{viewState.description}</small></span>
      <em>{viewState.activeCount?`${viewState.activeCount}개 보기 조건 적용`:'정리된 기본 화면'}</em>
      <button type="button" onClick={resetView} disabled={!viewState.activeCount} aria-label="현재 보기 초기화">기본 보기로</button>
    </div>
    <HarinBulkSelectionBar className="keywordOpsBulkBar" selectedCount={selection.selectedCount} visibleCount={visibleIds.length} filteredCount={filteredIds.length} visibleState={selection.visibleState} filteredState={selection.filteredState} onToggleVisible={checked=>selection.toggleScope(visibleIds,checked)} onToggleFiltered={checked=>selection.toggleScope(filteredIds,checked)} onClear={selection.clear} summary={isCoupang?`쿠팡 WING 작업 대상 ${coupangSelected.length}개`:`네이버 직접 변경 가능 ${draftableSelected.length}개 · 변경값 입력 ${changedRows.length}개`} preview={isCoupang&&coupangSelected.length?'선택 항목만 쿠팡 전용 작업표에 들어갑니다. 작업표를 내려받아도 쿠팡에는 자동 반영되지 않습니다.':changedRows.length?`현재 합계 ${won(currentTotal)} → 변경 합계 ${won(draftTotal)} · 마지막 확인 뒤 네이버 반영과 재조회까지 한 번에 끝냅니다.`:''}>
      {isCoupang?<button type="button" className="review" onClick={openWingWorklist} disabled={!coupangSelected.length}>WING 작업표 열기</button>:<>{!isCoupang&&groupEnabled?<KeywordBidRulePanel selectedRows={naverRuleSelected} savedRules={bidRules} onRulesChange={setBidRules} onApplyDrafts={applyRuleDrafts}/>:null}<button type="button" onClick={applyRecommended} disabled={!recommendedSelected.length}>추천가 채우기</button><button type="button" onClick={()=>applyPercent(-.1)} disabled={!draftableSelected.length}>10% 인하</button><button type="button" onClick={()=>applyPercent(.1)} disabled={!increasableSelected.length}>10% 인상</button><button type="button" className="review" onClick={()=>setReviewOpen(true)} disabled={!changedRows.length}>변경 전 확인</button></>}
    </HarinBulkSelectionBar>
    {!isCoupang&&groupEnabled&&bidRuleLoadState==='FAILED'?<p className="bidRuleLoadWarning" role="status">입찰 안전설정 저장소를 확인해야 해요. 현재 입찰 조회·직접 변경 기능은 그대로 사용할 수 있습니다.</p>:null}
    <div className={`keywordOpsLayout ${detail?'hasDetail':''}`}>
      <div className="keywordOpsTableWrap">
        <div className="keywordOpsTable" role="table" aria-label={`${PLATFORM_LABEL[String(platform).toUpperCase()]} 키워드 운영표`}>
          <div className="keywordOpsRow head" role="row"><span><HarinBulkCheckbox label="현재 페이지 전체 선택" checked={selection.visibleState.checked} mixed={selection.visibleState.mixed} onChange={event=>selection.toggleScope(visibleIds,event.target.checked)}/></span><KeywordSortHeader field="KEYWORD" label="키워드·플랫폼" sort={sort} onChange={value=>saveSettings({sort:value})}/><span>{isCoupang?'캠페인·상품':'캠페인·광고그룹·상품'}</span><KeywordSortHeader field="CURRENT_BID" label={workspace==='history'?'변경 전':isCoupang?'WING 현재가':'현재 입찰가'} sort={sort} onChange={value=>saveSettings({sort:value})} disabled={isCoupang}/><KeywordSortHeader field="RECOMMENDED_BID" label={workspace==='history'?'변경 값':isCoupang?'권장 조치':'추천 입찰가'} sort={sort} onChange={value=>saveSettings({sort:value})} disabled={isCoupang}/><span>{workspace==='history'?'현재 확인':isCoupang?'작업표':'변경 입찰가'}</span><KeywordSortHeader field="CLICKS" label="클릭" sort={sort} onChange={value=>saveSettings({sort:value})}/><KeywordSortHeader field="COST" label="광고비" sort={sort} onChange={value=>saveSettings({sort:value})}/><KeywordSortHeader field="ORDERS" label="주문" sort={sort} onChange={value=>saveSettings({sort:value})}/><KeywordSortHeader field="ROAS" label="ROAS" sort={sort} onChange={value=>saveSettings({sort:value})}/><span>실제 이익</span><span>상태</span></div>
          {pagination.items.map(row=>{const changed=number(drafts[row.id])!=null&&number(drafts[row.id])!==row.currentBid;const bidRule=bidRuleMap.get(String(row.id).replace(/^NAVER:/,''));return <div className={`keywordOpsRow ${selection.selectedSet.has(String(row.id))?'selected':''} ${changed?'changed':''}`} role="row" tabIndex="0" aria-label={`${row.keyword} 상세 보기`} key={row.id} onClick={()=>setDetailId(row.id)} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();setDetailId(row.id);}}}>
            <span onClick={event=>event.stopPropagation()}><HarinBulkCheckbox label={row.adCategoryState==='INACTIVE'?`${row.keyword} 사용중지`:`${row.keyword} 선택`} checked={selection.selectedSet.has(String(row.id))} disabled={row.adCategoryState==='INACTIVE'} onChange={event=>selection.toggle(row.id,event.target.checked)}/></span>
            <span className="keywordOpsName"><i className={row.platform.toLowerCase()}>{row.platform==='NAVER'?'N':'C'}</i><b>{row.keyword}</b><small>{PLATFORM_LABEL[row.platform]} · {row.source==='SEARCH_TERM'?'실제 검색어':row.source==='HISTORY'?'변경 기록':'광고 키워드'}</small></span>
            <span className="keywordOpsScope"><b>{row.campaignName||row.campaign}</b>{row.adgroupName?<em>{row.adgroupName}</em>:null}{row.adCategoryState==='INACTIVE'?<strong className="adCategoryBadge inactive">사용중지</strong>:null}<small>{row.product}</small>{bidRule?<strong className="bidRuleBadge">안전설정 · {bidRule.target_rank?`${bidRule.target_rank}위 참고`:'순위 미지정'}</strong>:null}</span>
            <span><b>{row.applicationMode==='MANUAL_REQUIRED'?'WING 확인':won(row.currentBid)}</b></span><span className="recommended"><b>{row.applicationMode==='MANUAL_REQUIRED'?(DECISION_LABEL[row.decision]||'관찰'):won(row.recommendedBid)}</b></span>
            <span className="keywordOpsDraft" onClick={event=>event.stopPropagation()}>{row.canDraft?<input type="number" inputMode="numeric" step="10" min={row.minimumBid??70} max={row.maximumBid??100000} value={drafts[row.id]??''} placeholder="직접 입력" aria-label={`${row.keyword} 변경 입찰가`} onFocus={()=>selection.toggle(row.id,true)} onChange={event=>setDetailDraft(row,event.target.value)} onBlur={()=>{const value=number(drafts[row.id]);if(value!=null)setDetailDraft(row,clamp(value,row.minimumBid,row.maximumBid));}}/>:<em>{row.applicationMode==='MANUAL_REQUIRED'?'작업표 입력':row.applicationMode==='HISTORY'?(row.observedBid==null?'재조회 전':won(row.observedBid)):'-'}</em>}</span>
            <span>{count(row.clicks)}</span><span><b>{won(row.cost)}</b></span><span>{count(row.orders)}</span><span>{percent(row.roas)}</span><span className="blockedValue">판단 보류</span><span><StatusPill row={row} mutationState={mutationStates[row.id]}/></span>
          </div>;})}
          {!pagination.items.length?<div className="keywordOpsEmpty"><i><KeywordPictogram/></i><b>{workspace==='history'?'아직 표시할 키워드 변경 기록이 없어요':'조건에 맞는 키워드가 없어요'}</b><p>{workspace==='history'?'확인 후 실행한 변경은 이 화면에서 성과검증까지 연결됩니다.':'검색어나 빠른 보기를 바꾸면 원본 데이터를 다시 확인할 수 있습니다.'}</p></div>:null}
        </div>
        <footer className="keywordOpsPagination"><span>전체 {count(pagination.total)}개 · {pagination.page}/{pagination.totalPages}쪽</span><div><button type="button" disabled={pagination.page<=1} onClick={()=>setPage(value=>value-1)}>이전</button><button type="button" disabled={pagination.page>=pagination.totalPages} onClick={()=>setPage(value=>value+1)}>다음</button></div></footer>
      </div>
      {detail?<aside className="keywordOpsDetail" aria-label="선택 키워드 상세"><header><span>KEYWORD DETAIL</span><button type="button" onClick={()=>setDetailId('')} aria-label="상세 닫기">×</button></header><div className="keywordOpsDetailTitle"><i className={detail.platform.toLowerCase()}>{detail.platform==='NAVER'?'N':'C'}</i><span><b>{detail.keyword}</b><small>{PLATFORM_LABEL[detail.platform]} · {detail.campaignName||detail.campaign}{detail.adgroupName?` · ${detail.adgroupName}`:''}</small></span></div><dl><div><dt>광고비</dt><dd>{won(detail.cost)}</dd></div><div><dt>주문·전환</dt><dd>{count(detail.orders)}건</dd></div><div><dt>ROAS</dt><dd>{percent(detail.roas)}</dd></div><div><dt>최신 기준</dt><dd>{detail.freshness||'확인 필요'}</dd></div></dl>{detail.canDraft?<section className="keywordOpsDetailBid"><b>네이버 변경 입찰가</b><p>현재 {won(detail.currentBid)} · 추천 {won(detail.recommendedBid)}</p><div><input type="number" step="10" min={detail.minimumBid??70} max={detail.maximumBid??100000} value={drafts[detail.id]??''} placeholder="직접 입력" aria-label={`${detail.keyword} 변경 입찰가`} onChange={event=>setDetailDraft(detail,event.target.value)} onBlur={()=>{const value=number(drafts[detail.id]);if(value!=null)setDetailDraft(detail,clamp(value,detail.minimumBid,detail.maximumBid));}}/><button type="button" disabled={detail.recommendedBid==null} onClick={()=>setDetailDraft(detail,detail.recommendedBid)}>추천가</button></div><small>{detail.manualDecreaseOnly?'추천 근거가 준비되기 전에는 현재가보다 낮은 값만 직접 적용할 수 있어요.':'이 키워드가 자동 선택되며, 상단의 변경 전 확인에서 마지막으로 확인합니다.'}</small></section>:null}<section><b>판단 근거</b>{detail.reasons.length?<ul>{detail.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>:<p>서버 계산 결과 추가 차단 사유가 없습니다.</p>}</section><section className="keywordOpsDetailSafety"><b>{detail.applicationMode==='MANUAL_REQUIRED'?'쿠팡 적용 방법':detail.applicationMode==='HISTORY'?'실행·재조회 상태':'변경 안전장치'}</b><p>{detail.applicationMode==='MANUAL_REQUIRED'?'현재는 WING에서 직접 적용해야 하며, 허브는 성공으로 표시하지 않습니다.':detail.applicationMode==='HISTORY'?'변경 전·후 값과 네이버 재조회 결과를 보존합니다. 불일치하면 성공으로 표시하지 않습니다.':'마지막 확인을 누르면 네이버 현재값을 다시 읽고, 반영 뒤 한 번 더 재조회합니다. 오래된 값이나 쓰기 잠금은 자동 차단됩니다.'}</p></section></aside>:null}
    </div>
    {wingOpen?<div className="keywordOpsReviewBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setWingOpen(false);}}><section className="keywordOpsReview keywordOpsWing" role="dialog" aria-modal="true" aria-labelledby="coupang-wing-title"><header><div><span>COUPANG WING WORKLIST</span><h2 id="coupang-wing-title">쿠팡에서 직접 반영할 작업만 정리했어요</h2><p>네이버 변경안과 분리된 쿠팡 전용 작업표입니다. 허브가 쿠팡 반영 성공으로 표시하지 않습니다.</p></div><button type="button" onClick={()=>setWingOpen(false)} aria-label="WING 작업표 닫기">×</button></header><div className="keywordOpsReviewSafety"><span><b>1</b><small>광고 성과 확인</small></span><i>→</i><span><b>2</b><small>WING 현재가 입력</small></span><i>→</i><span><b>3</b><small>WING 직접 반영</small></span><i>→</i><span><b>4</b><small>다음 자료로 확인</small></span></div><div className="keywordOpsWingNotice"><b>자동 입찰 API 잠금</b><span>공개 Seller Open API 문서에서 광고 입찰 쓰기 엔드포인트를 확인하지 못했습니다.</span><em>{COUPANG_AD_CAPABILITY.verifiedAt}</em></div><div className="keywordOpsWingList">{wingPagination.items.map(item=><article key={item.id}><header><span><i>C</i><b>{item.keyword}</b><small>{item.campaign} · {item.product}</small></span><em>{item.orders<=0&&item.cost>0?'무주문 광고비':'성과 확인'}</em></header><div><label><span>할 일</span><select value={item.action} onChange={event=>setWingDraft(item.id,'action',event.target.value)}>{Object.entries(ACTION_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label><span>WING 현재 입찰가</span><input type="number" inputMode="numeric" min="1" value={wingDrafts?.[item.id]?.currentBid??''} placeholder="직접 확인" onChange={event=>setWingDraft(item.id,'currentBid',event.target.value)}/></label><label><span>WING 적용 입찰가</span><input type="number" inputMode="numeric" min="1" value={wingDrafts?.[item.id]?.targetBid??''} placeholder="적용할 금액" onChange={event=>setWingDraft(item.id,'targetBid',event.target.value)}/></label><label className="memo"><span>메모</span><input value={wingDrafts?.[item.id]?.memo??''} maxLength="120" placeholder="예: 무주문 비용 확인 후 감액" onChange={event=>setWingDraft(item.id,'memo',event.target.value)}/></label></div><footer><span>광고비 <b>{won(item.cost)}</b></span><span>주문 <b>{count(item.orders)}건</b></span><span>ROAS <b>{percent(item.roas)}</b></span><strong>{item.status==='READY_FOR_WING'?'WING 반영 대기':'입찰가 확인 필요'}</strong></footer></article>)}</div><div className="keywordOpsWingPager"><span>선택 {wingPagination.total}개 · {wingPagination.page}/{wingPagination.totalPages}쪽</span><div><button type="button" disabled={wingPagination.page<=1} onClick={()=>setWingPage(value=>value-1)}>이전</button><button type="button" disabled={wingPagination.page>=wingPagination.totalPages} onClick={()=>setWingPage(value=>value+1)}>다음</button></div></div>{wingNotice?<p className="keywordOpsWingResult" aria-live="polite">{wingNotice}</p>:null}<footer><a className="secondary" href="https://wing.coupang.com/" target="_blank" rel="noreferrer">쿠팡 WING 열기 ↗</a><button type="button" className="secondary" onClick={copyWingWorklist}>전체 작업표 복사</button><button type="button" className="primary" onClick={downloadWingWorklist}>전체 CSV 내려받기</button></footer><small className="keywordOpsReviewFoot">현재가나 적용가를 비우면 0원이 아니라 빈칸·확인 필요로 내보냅니다.</small></section></div>:null}
    {reviewOpen?<div className="keywordOpsReviewBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!working)setReviewOpen(false);}}><section className="keywordOpsReview" role="dialog" aria-modal="true" aria-labelledby="keyword-review-title"><header><div><span>NAVER BID CONFIRM</span><h2 id="keyword-review-title">네이버 입찰 변경 전 마지막으로 확인해요</h2><p>아래 버튼을 누르면 현재값 재확인, 네이버 반영, 결과 재조회까지 한 번에 진행됩니다.</p></div><button type="button" onClick={()=>setReviewOpen(false)} disabled={working} aria-label="검토 닫기">×</button></header><div className="keywordOpsReviewSafety"><span><b>1</b><small>변경값 확인</small></span><i>→</i><span><b>2</b><small>현재값 재확인</small></span><i>→</i><span><b>3</b><small>네이버 반영</small></span><i>→</i><span><b>4</b><small>결과 재조회</small></span></div><div className="keywordOpsReviewList">{changedRows.map(row=>{const desired=number(drafts[row.id]);const delta=desired==null||row.currentBid==null?null:(desired-row.currentBid)/Math.max(1,row.currentBid)*100;return <article key={row.id}><span><i>N</i><b>{row.keyword}</b><small>{row.campaign}</small></span><em>{won(row.currentBid)}</em><i>→</i><strong>{won(desired)}</strong><small className={delta!=null&&delta>0?'up':'down'}>{delta==null?'확인 필요':`${delta>0?'+':''}${delta.toFixed(1)}%`}</small></article>;})}</div>{proposalResult?<div className={`keywordOpsProposalResult ${proposalResult.failed.length?'warning':'success'}`}><b>{proposalResult.applied.length}건 변경·재확인 완료{proposalResult.failed.length?` · ${proposalResult.failed.length}건 확인 필요`:''}</b>{proposalResult.failed.map(item=><small key={item.id}>{item.keyword} · {item.error}</small>)}</div>:null}<footer><button type="button" className="secondary" onClick={()=>setReviewOpen(false)} disabled={working}>계속 수정</button><button type="button" className="primary" onClick={applyConfirmedChanges} disabled={working||!changedRows.length}>{working?'네이버 반영·확인 중…':`${changedRows.length}건 지금 변경하기`}</button></footer><small className="keywordOpsReviewFoot">쿠팡 항목은 이 흐름에 들어오지 않으며 WING 수동 적용 목록으로만 관리됩니다.</small></section></div>:null}
  </section>;
}
