'use client';

import { useEffect, useMemo, useState } from 'react';
import trendModule from '../../lib/naver/bid-keyword-trend-view.js';
import HarinIcon from '../_design-system/harin-icon.js';
import { RankBidChart } from './keyword-performance-workbench.js';
import './keyword-bid-inline-trend.css';

const RANGES=[1,3,7];
const rank=value=>value==null?'확인 필요':`${Number(value).toFixed(1)}위`;
const won=value=>value==null?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const rankChange=value=>value==null?'비교 근거 없음':value>0?`+${Number(value).toFixed(1)}위 개선`:value<0?`${Math.abs(Number(value)).toFixed(1)}위 하락`:'변화 없음';
const bidChange=value=>value==null?'변경 근거 없음':value>0?`+${Math.round(Number(value)).toLocaleString('ko-KR')}원`:value<0?`${Math.round(Number(value)).toLocaleString('ko-KR')}원`:'변화 없음';
const percent=value=>value==null?'확인 필요':`${Number(value).toFixed(1)}%`;

export default function KeywordBidInlineTrend({keywordId}){
  const [open,setOpen]=useState(false);
  const [range,setRange]=useState(7);
  const [state,setState]=useState('IDLE');
  const [analysis,setAnalysis]=useState(null);
  const [message,setMessage]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const request=useMemo(()=>trendModule.buildBidKeywordTrendRequest({open,platform:'NAVER',keywordId}),[open,keywordId]);
  const view=useMemo(()=>trendModule.buildBidKeywordTrendView({analysis,days:range}),[analysis,range]);

  useEffect(()=>{
    if(!request)return undefined;
    const controller=new AbortController();
    setState('LOADING');setMessage('');
    fetch(request,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'순위·입찰가 추이를 불러오지 못했습니다.');return payload.analysis;})
      .then(result=>{setAnalysis(result);setState('READY');})
      .catch(error=>{if(error.name!=='AbortError'){setAnalysis(null);setMessage(error.message||'순위·입찰가 추이를 불러오지 못했습니다.');setState('FAILED');}});
    return ()=>controller.abort();
  },[request,refreshKey]);

  return <section className={`keywordBidInlineTrend ${open?'open':''}`} aria-label="선택 키워드 순위와 입찰가 추이">
    <header>
      <span><i><HarinIcon name="growth" size={19}/></i><span><b>순위·입찰가 미니 추이</b><small>실제 평균순위 · 읽기 전용</small></span></span>
      <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'접기':'1·3·7일 보기'}<em>{open?'−':'＋'}</em></button>
    </header>
    {open?<div className="keywordBidInlineTrendBody">
      {state==='LOADING'?<div className="keywordBidInlineTrendLoading" role="status"><i/><span>선택한 키워드 자료만 불러오고 있어요.</span></div>:null}
      {state==='FAILED'?<div className="keywordBidInlineTrendEmpty failed" role="alert"><span><b>추이를 불러오지 못했어요</b><small>{message}</small></span><button type="button" onClick={()=>setRefreshKey(value=>value+1)}>다시 조회</button></div>:null}
      {state==='READY'&&view.status==='NO_DATA'?<div className="keywordBidInlineTrendEmpty"><span><b>비교할 순위 자료가 아직 없어요</b><small>없는 순위와 입찰가를 0으로 만들지 않습니다.</small></span><button type="button" onClick={()=>setRefreshKey(value=>value+1)}>다시 조회</button></div>:null}
      {state==='READY'&&['READY','PARTIAL'].includes(view.status)?<>
        <nav aria-label="순위 추이 기간 선택">{RANGES.map(days=><button type="button" aria-pressed={range===days} className={range===days?'active':''} onClick={()=>setRange(days)} key={days}>{days}일</button>)}</nav>
        <div className="keywordBidInlineTrendMetrics">
          <span><small>기간 평균순위</small><b>{rank(view.summary.average_rank)}</b></span>
          <span><small>최근 평균순위</small><b>{rank(view.summary.latest_rank)}</b></span>
          <span className={view.summary.rank_improvement>0?'good':view.summary.rank_improvement<0?'warning':''}><small>순위 변화</small><b>{rankChange(view.summary.rank_improvement)}</b></span>
          <span><small>최근 입찰가</small><b>{won(view.summary.latest_bid)}</b><em>{bidChange(view.summary.bid_change)}</em></span>
          <span className={view.summary.hit_rate_percent>=70?'good':view.summary.hit_rate_percent==null?'':view.summary.hit_rate_percent<40?'warning':''}><small>목표 적중률</small><b>{percent(view.summary.hit_rate_percent)}</b><em>{!view.summary.target_rank?'목표순위 설정 필요':view.summary.hit_rate_percent==null?'실제 순위 자료 확인 필요':`${view.summary.hit_days}/${view.summary.ranked_days}일 · 목표 ${view.summary.target_rank}위 이내`}</em></span>
          <span className={view.summary.competition?.level==='LOW'?'good':view.summary.competition?.level==='HIGH'?'warning':''}><small>경쟁 강도</small><b>{view.summary.competition?.label||'확인 필요'}</b><em>{view.summary.competition?.volatility==null?'순위 자료 2일 이상 필요':`순위 변동성 ${Number(view.summary.competition.volatility).toFixed(2)}`}</em></span>
        </div>
        <RankBidChart daily={view.daily} target={view.summary.target_rank} compact/>
        <p className="keywordBidInlineTrendNotice">{view.summary.competition?.notice||'경쟁 강도는 네이버 실제 평균순위 변동 자료가 쌓인 뒤 표시합니다.'}</p>
        <footer><span>{view.summary.competition?.action||'순간 검색순위가 아닌 네이버 실제 집계 평균순위입니다.'}</span><button type="button" onClick={()=>setRefreshKey(value=>value+1)} disabled={state==='LOADING'}><HarinIcon name="sync" size={16}/> 다시 조회</button></footer>
      </>:null}
    </div>:null}
  </section>;
}
