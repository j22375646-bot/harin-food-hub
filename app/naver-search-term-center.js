'use client';

import { useMemo, useState } from 'react';

const LABELS={BRAND:'브랜드',GENERAL_PURCHASE:'일반 구매',PRODUCT_DETAIL:'상품 형태·수량',PROBLEM_SITUATION:'문제·상황',INFORMATION:'정보 탐색',IRRELEVANT:'무관'};
const ACTION_LABELS={NEGATIVE_REVIEW:'제외 검토',SEPARATE:'별도 운영',LANDING_REVIEW:'랜딩 점검',NEW_KEYWORD:'신규 등록',CONTENT_FAQ:'콘텐츠·FAQ',OBSERVE:'관찰'};
const CATEGORIES=Object.keys(LABELS);
const won=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');

export default function NaverSearchTermCenter({initialData}) {
  const source=initialData||{status:'COLLECTION_PENDING',summary:{},items:[]};
  const [items,setItems]=useState(source.items||[]),[filter,setFilter]=useState('ALL'),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
  const visible=useMemo(()=>items.filter(item=>filter==='ALL'||item.classification===filter).slice(0,100),[items,filter]);
  const summary=source.summary||{};
  async function collect(){
    setBusy('collect');setMessage('네이버 쇼핑검색광고의 최근 30일 실제 검색어를 가져오는 중이에요…');
    try{const response=await fetch('/api/naver/search-terms',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'검색어 수집 실패');setMessage(`수집 완료 · 실제 검색어 ${count(result.rows)}개 · 광고그룹 ${count(result.successfulGroups)}개`);setTimeout(()=>window.location.reload(),900);}
    catch(error){setMessage(`수집 확인 필요 · ${error.message}`);setBusy('');}
  }
  async function correct(item,classification){
    setBusy(item.id);setMessage(`‘${item.search_term}’ 분류를 저장하는 중이에요…`);
    try{const response=await fetch('/api/naver/search-terms',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,classification})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'분류 저장 실패');setItems(current=>current.map(row=>row.id===item.id?{...row,classification,classification_override:classification,recommended_action:result.item.recommended_action,action_label:ACTION_LABELS[result.item.recommended_action],action_reason:result.item.action_reason,action_status:'REVIEWED'}:row));setMessage(`저장 완료 · ‘${item.search_term}’ → ${LABELS[classification]}`);}
    catch(error){setMessage(`저장 확인 필요 · ${error.message}`);}finally{setBusy('');}
  }
  return <section className="searchTermCenter">
    <article className="searchTermHero">
      <div><span className="eyebrow">PHASE 12-2 · ACTUAL SEARCH TERMS</span><h2>실제 검색어 운영센터</h2><p>고객이 실제로 검색한 말을 보고 제외·분리·랜딩 조치를 결정합니다. 등록 키워드와 섞지 않습니다.</p></div>
      <button onClick={collect} disabled={Boolean(busy)}>{busy==='collect'?'수집 중…':'최근 30일 검색어 수집'}</button>
    </article>
    <details className="searchTermHelp"><summary>이 기능은 뭐예요?</summary><div><p><b>예시</b> 등록 키워드가 ‘작두콩차’여도 고객은 ‘환절기 목관리 티백’을 검색해 들어올 수 있습니다.</p><p><b>보는 순서</b> 무관 검색어는 제외 검토, 브랜드는 별도 운영, 정보 검색은 FAQ, 구매 검색은 신규 키워드나 랜딩 점검 후보로 봅니다.</p><p><b>주의</b> 여기서는 검토 후보만 만듭니다. 네이버 광고를 자동 중지하거나 입찰가를 바꾸지 않습니다.</p></div></details>
    {message&&<div className="syncToast searchTermMessage">{message}</div>}
    <div className="searchTermSummary">
      <article><span>실제 검색어</span><strong>{count(summary.total)}개</strong><small>최근 30일 쇼핑검색광고</small></article>
      <article><span>미등록 후보</span><strong>{count(summary.unregistered)}개</strong><small>신규 키워드 검토</small></article>
      <article className="danger"><span>제외 검토</span><strong>{count(summary.negative_candidates)}개</strong><small>무관·과소비 후보</small></article>
      <article><span>콘텐츠 후보</span><strong>{count(summary.content_candidates)}개</strong><small>FAQ·상세페이지 보강</small></article>
    </div>
    {source.status!=='READY'?<div className={`searchTermEmpty ${source.status==='COLLECTION_ERROR'?'error':''}`}><b>{source.status==='COLLECTION_ERROR'?'검색어 수집을 다시 확인해주세요':'아직 실제 검색어를 수집하지 않았습니다'}</b><p>{source.last_error||'위의 ‘최근 30일 검색어 수집’을 누르면 네이버 쇼핑검색광고 원본을 가져옵니다.'}</p></div>:<>
      <div className="searchTermTabs"><button className={filter==='ALL'?'active':''} onClick={()=>setFilter('ALL')}>전체 {count(items.length)}</button>{CATEGORIES.map(category=><button className={filter===category?'active':''} onClick={()=>setFilter(category)} key={category}>{LABELS[category]} {count(source.classification_counts?.[category])}</button>)}</div>
      <div className="searchTermTable"><div className="searchTermTableHead"><span>실제 검색어·분류</span><span>최근 30일 성과</span><span>추천 조치</span></div>{visible.map(item=><article key={item.id} className="searchTermRow"><div><strong>{item.search_term}</strong><select aria-label={`${item.search_term} 분류`} value={item.classification} disabled={busy===item.id} onChange={event=>correct(item,event.target.value)}>{CATEGORIES.map(category=><option value={category} key={category}>{LABELS[category]}</option>)}</select>{item.classification_override&&<small>직접 수정됨</small>}</div><div><b>{won(item.cost)}</b><small>노출 {count(item.impressions)} · 클릭 {count(item.clicks)} · 전환 {count(item.conversions)}</small><small>CPC {won(item.cpc)} · ROAS {Number(item.roas||0).toFixed(0)}%</small></div><div><span className={`searchTermAction ${item.recommended_action==='NEGATIVE_REVIEW'?'danger':''}`}>{ACTION_LABELS[item.recommended_action]||item.action_label}</span><p>{item.action_reason}</p>{item.is_registered_exact&&<small>정확히 등록된 키워드</small>}</div></article>)}{!visible.length&&<div className="searchTermEmpty"><b>이 분류에 해당하는 검색어가 없습니다.</b></div>}</div>
      <p className="searchTermFootnote">기간 {source.period?.period_start} ~ {source.period?.period_end} · 쇼핑검색광고 실제 검색어만 포함 · 총 광고비 {won(summary.cost)}</p>
    </>}
  </section>;
}
