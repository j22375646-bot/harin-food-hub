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
const count=value=>value==null?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}회`;
const queryCount=(value,status)=>status==='LT_10'?'10회 미만':count(value);
const COMPETITION={high:'높음',medium:'보통',low:'낮음'};

function OfficialBidEvidence({evidence,currentBid,recommendedBid}){
  const market=evidence?.market||{},minimum=evidence?.minimum_exposure||{},target=evidence?.target_position||{};
  const status=evidence?.status||'NO_DATA';
  const statusLabel=status==='READY'?'공식 근거 준비':status==='TARGET_REQUIRED'?'목표순위 설정 필요':status==='PARTIAL'?'일부 확인':'확인 필요';
  const fetched=evidence?.fetched_at?new Date(evidence.fetched_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'확인 필요';
  return <section className={`keywordBidOfficialEvidence ${status.toLowerCase()}`} aria-label="네이버 공식 입찰 근거">
    <header><span><i><HarinIcon name="target" size={19}/></i><span><b>네이버 공식 입찰 근거</b><small>선택한 키워드만 지금 조회 · 읽기 전용</small></span></span><em>{statusLabel}</em></header>
    <div className="keywordBidOfficialGrid">
      <article><small>월간 검색수요</small><b>{count(market.monthly_total_queries)}</b><em>PC {queryCount(market.monthly_pc_queries,market.monthly_pc_queries_status)} · 모바일 {queryCount(market.monthly_mobile_queries,market.monthly_mobile_queries_status)}</em></article>
      <article><small>공식 경쟁 정도</small><b>{COMPETITION[market.competition]||'확인 필요'}</b><em>네이버 키워드 도구 기준</em></article>
      <article><small>최소 노출 참고</small><b>{won(evidence?.reference_band?.low)}</b><em>PC {won(minimum.pc_bid)} · 모바일 {won(minimum.mobile_bid)}</em></article>
      <article><small>목표순위 예상</small><b>{target.target_rank==null?'목표순위 설정 필요':`${target.target_rank}위 · ${won(evidence?.reference_band?.high)}`}</b><em>PC {won(target.pc_bid)} · 모바일 {won(target.mobile_bid)}</em></article>
      <article><small>현재 입찰가</small><b>{won(currentBid)}</b><em>네이버에서 수집한 현재값</em></article>
      <article className={recommendedBid==null?'pending':'recommended'}><small>운영 추천가</small><b>{recommendedBid==null?'판단 보류':won(recommendedBid)}</b><em>원가·ROAS·안전 상한 기준</em></article>
    </div>
    <p><b>서로 다른 근거예요.</b> 공식 예상가는 시장 참고값이고, 운영 추천가는 하린식품의 이익·안전 규칙으로 계산합니다. 공식 예상가를 그대로 자동 적용하지 않습니다.</p>
    <footer><span>{evidence?.notice||'자료가 부족하면 입찰가를 임의로 추천하지 않습니다.'}</span><small>공식 조회 {fetched}</small></footer>
  </section>;
}

export default function KeywordBidInlineTrend({keywordId,currentBid=null,recommendedBid=null}){
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
      <span><i><HarinIcon name="growth" size={19}/></i><span><b>순위·입찰·공식 근거</b><small>실제 평균순위 · 네이버 공식 예상 · 읽기 전용</small></span></span>
      <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'접기':'근거 보기'}<em>{open?'−':'＋'}</em></button>
    </header>
    {open?<div className="keywordBidInlineTrendBody">
      {state==='LOADING'?<div className="keywordBidInlineTrendLoading" role="status"><i/><span>선택한 키워드 자료만 불러오고 있어요.</span></div>:null}
      {state==='FAILED'?<div className="keywordBidInlineTrendEmpty failed" role="alert"><span><b>추이를 불러오지 못했어요</b><small>{message}</small></span><button type="button" onClick={()=>setRefreshKey(value=>value+1)}>다시 조회</button></div>:null}
      {state==='READY'?<OfficialBidEvidence evidence={analysis?.official_bid_evidence} currentBid={currentBid??analysis?.scope?.current_bid} recommendedBid={recommendedBid}/>:null}
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
