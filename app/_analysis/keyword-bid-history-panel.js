'use client';

import { useEffect, useState } from 'react';
import HarinIcon from '../_design-system/harin-icon.js';
import './keyword-bid-history-panel.css';

const STATUS={VERIFIED:['반영 확인','verified'],OBSERVED:['관찰만','observed'],BLOCKED:['안전 차단','blocked'],FAILED:['다시 확인','failed'],PLANNED:['계획 기록','planned']};
const actionLabel=value=>value==='RAISE'?'인상':value==='LOWER'?'인하':value==='KEEP'?'유지':'확인';
const won=value=>value==null?'변경 없음':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const time=value=>value?new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'시각 확인 필요';

export default function KeywordBidHistoryPanel({keywordId,adgroupId}){
  const [refreshKey,setRefreshKey]=useState(0);
  const [state,setState]=useState('LOADING');
  const [history,setHistory]=useState(null);

  useEffect(()=>{
    if(!keywordId||!adgroupId){setState('NO_SCOPE');setHistory(null);return undefined;}
    const controller=new AbortController();setState('LOADING');
    const query=`/api/naver/bid-schedules?history=1&ncc_adgroup_id=${encodeURIComponent(adgroupId)}&ncc_keyword_id=${encodeURIComponent(keywordId)}`;
    fetch(query,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'자동입찰 기록을 불러오지 못했습니다.');return data.history;})
      .then(data=>{setHistory(data);setState(data?.entries?.length?'READY':'NO_DATA');})
      .catch(error=>{if(error.name!=='AbortError'){setHistory(null);setState('FAILED');}});
    return ()=>controller.abort();
  },[keywordId,adgroupId,refreshKey]);

  return <section className="keywordBidHistory" aria-label="선택 키워드 자동입찰 기록">
    <header><span><i><HarinIcon name="clock" size={19}/></i><span><b>자동입찰 기록</b><small>관찰·변경·재조회 결과</small></span></span><button type="button" onClick={()=>setRefreshKey(value=>value+1)} disabled={state==='LOADING'} aria-label="자동입찰 기록 새로고침"><HarinIcon name="sync" size={17}/></button></header>
    {state==='LOADING'?<div className="keywordBidHistoryLoading" role="status"><i/><span>이 키워드의 기록을 확인하고 있어요.</span></div>:null}
    {state==='NO_SCOPE'?<div className="keywordBidHistoryEmpty"><b>광고그룹 연결을 확인해주세요</b><p>현재 키워드의 네이버 광고그룹 ID가 준비되면 기록을 불러옵니다.</p></div>:null}
    {state==='NO_DATA'?<div className="keywordBidHistoryEmpty"><b>아직 자동입찰 실행 기록이 없어요</b><p>관찰 또는 자동 적용이 실행되면 변경 전후 값과 결과가 여기에 쌓입니다.</p></div>:null}
    {state==='FAILED'?<div className="keywordBidHistoryEmpty failed"><b>기록을 불러오지 못했어요</b><p>새로고침 버튼으로 이 키워드만 다시 확인해주세요.</p></div>:null}
    {state==='READY'?<><div className="keywordBidHistorySummary"><span><small>전체</small><b>{history.summary.total}회</b></span><span><small>반영 확인</small><b>{history.summary.applied}회</b></span><span><small>관찰</small><b>{history.summary.observed}회</b></span><span className={history.summary.blocked?'warning':''}><small>차단·실패</small><b>{history.summary.blocked}회</b></span></div><div className="keywordBidHistoryList">{history.entries.slice(0,12).map(entry=>{const status=STATUS[entry.status]||['확인 필요','planned'];return <article className={status[1]} key={entry.run_id}><i aria-hidden="true"/><div><header><span>{time(entry.occurred_at)}</span><strong>{status[0]}</strong></header><p><b>{won(entry.before_bid)}</b><em>→</em><strong>{entry.status==='OBSERVED'?'변경 안 함':won(entry.after_bid)}</strong>{entry.action?<small>{actionLabel(entry.action)}</small>:null}</p><footer>{entry.target_rank?<span>{entry.target_rank}위 참고</span>:null}<small>{entry.reason}</small></footer></div></article>;})}</div></>:null}
  </section>;
}
