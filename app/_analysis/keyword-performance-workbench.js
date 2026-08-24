'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HarinIcon } from '../_design-system/harin-icon.js';
import styles from './keyword-performance-workbench.module.css';

const text=value=>String(value??'').trim();
const number=value=>{
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const format=(value,{suffix='',digits=0}={})=>value==null?'확인 필요':`${Number(value).toLocaleString('ko-KR',{maximumFractionDigits:digits,minimumFractionDigits:digits})}${suffix}`;
const won=value=>format(value,{suffix:'원'});
const percent=value=>format(value,{suffix:'%',digits:1});
const rank=value=>value==null?'확인 필요':`${Number(value).toFixed(1)}위`;
const RANGE_OPTIONS=[{days:1,label:'1일'},{days:3,label:'3일'},{days:7,label:'7일'}];

function sourceTone(status){return status==='READY'?styles.ready:status==='PARTIAL'?styles.partial:styles.waiting;}

export function RankBidChart({daily=[],target,compact=false}){
  const width=760,height=260,left=52,right=28,top=28,bottom=42;
  const rankValues=daily.map(item=>number(item.average_rank)).filter(value=>value!=null);
  const bidValues=daily.map(item=>number(item.bid)).filter(value=>value!=null);
  const rankMax=Math.max(5,...rankValues.map(value=>Math.ceil(value)));
  const bidMax=Math.max(100,...bidValues);
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const x=index=>left+(daily.length<=1?plotWidth/2:index*plotWidth/(daily.length-1));
  const rankY=value=>top+(Math.max(1,Math.min(rankMax,value))-1)/Math.max(1,rankMax-1)*plotHeight;
  const bidY=value=>top+plotHeight-(value/bidMax)*plotHeight;
  const points=daily.map((item,index)=>number(item.average_rank)==null?null:[x(index),rankY(Number(item.average_rank))]).filter(Boolean);
  const path=points.map((point,index)=>`${index?'L':'M'} ${point[0]} ${point[1]}`).join(' ');
  const targetY=number(target)==null?null:rankY(Number(target));
  return <div className={`${styles.chartWrap} ${compact?styles.compactChartWrap:''}`}>
    <svg className={`${styles.chart} ${compact?styles.compactChart:''}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="실제 평균순위와 입찰가 추이">
      <defs><linearGradient id="rankArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8374c8" stopOpacity=".22"/><stop offset="1" stopColor="#8374c8" stopOpacity="0"/></linearGradient></defs>
      {[1,2,3,4,5].map(step=>{const y=top+(step-1)/4*plotHeight;return <g key={step}><line x1={left} x2={width-right} y1={y} y2={y} className={styles.gridLine}/><text x="8" y={y+4} className={styles.axisLabel}>{Math.round(1+(rankMax-1)*(step-1)/4)}위</text></g>;})}
      {targetY!=null?<g><line x1={left} x2={width-right} y1={targetY} y2={targetY} className={styles.targetLine}/><text x={width-right-4} y={targetY-7} textAnchor="end" className={styles.targetLabel}>목표 {target}위</text></g>:null}
      {daily.map((item,index)=>number(item.bid)==null?null:<rect key={`bid-${item.date}`} x={x(index)-12} y={bidY(Number(item.bid))} width="24" height={top+plotHeight-bidY(Number(item.bid))} rx="8" className={styles.bidBar}/>) }
      {path?<path d={path} className={styles.rankLine}/>:null}
      {points.map((point,index)=><circle key={`${point[0]}-${index}`} cx={point[0]} cy={point[1]} r="5" className={styles.rankPoint}/>) }
      {daily.map((item,index)=><text key={item.date} x={x(index)} y={height-13} textAnchor="middle" className={styles.dateLabel}>{item.date?.slice(5).replace('-','.')}</text>)}
    </svg>
    <div className={styles.legend}><span><i className={styles.rankLegend}/>실제 평균순위</span><span><i className={styles.bidLegend}/>입찰가</span>{target!=null?<span><i className={styles.targetLegend}/>목표순위 기준</span>:null}</div>
  </div>;
}

function MetricCard({icon,label,value,note,tone='lavender'}){
  return <article className={`${styles.metricCard} ${styles[tone]}`}><i><HarinIcon name={icon} size={21}/></i><span><small>{label}</small><b>{value}</b><em>{note}</em></span></article>;
}

function DeviceCard({item}){
  return <article className={`${styles.deviceCard} ${item.key==='MOBILE'?styles.mobile:styles.pc}`}>
    <header><i><HarinIcon name={item.key==='MOBILE'?'mobile':'analysis'} size={21}/></i><b>{item.label}</b><em>{item.available?'실제 집계':'자료 없음'}</em></header>
    <dl><div><dt>평균순위</dt><dd>{rank(item.average_rank)}</dd></div><div><dt>클릭</dt><dd>{format(item.clicks,{suffix:'회'})}</dd></div><div><dt>광고비</dt><dd>{won(item.cost)}</dd></div><div><dt>ROAS</dt><dd>{percent(item.roas)}</dd></div></dl>
  </article>;
}

function HeatCell({item,label,max}){
  const intensity=item.cost==null?0:Math.max(.12,Number(item.cost)/Math.max(1,max));
  return <span className={`${styles.heatCell} ${item.cost==null?styles.emptyHeat:''}`} style={item.cost==null?undefined:{'--heat-alpha':Math.min(.58,.12+intensity*.42)}} title={`${label} · 광고비 ${won(item.cost)} · 평균순위 ${rank(item.average_rank)}`}><b>{label}</b><em>{item.cost==null?'—':won(item.cost)}</em></span>;
}

export default function KeywordPerformanceWorkbench({data={}}){
  const candidates=useMemo(()=>data.naverBidWorkbench?.candidates||[],[data.naverBidWorkbench?.candidates]);
  const [campaignId,setCampaignId]=useState(candidates[0]?.ncc_campaign_id||'');
  const [adgroupId,setAdgroupId]=useState(candidates[0]?.ncc_adgroup_id||'');
  const [keywordId,setKeywordId]=useState(candidates[0]?.ncc_keyword_id||'');
  const [range,setRange]=useState(7);
  const [analysis,setAnalysis]=useState(null);
  const [state,setState]=useState(candidates.length?'loading':'empty');
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);

  const campaigns=useMemo(()=>[...new Map(candidates.map(item=>[text(item.ncc_campaign_id),{id:text(item.ncc_campaign_id),name:text(item.campaign_name)||'캠페인 확인 필요'}])).values()].filter(item=>item.id),[candidates]);
  const campaignCandidates=candidates.filter(item=>!campaignId||text(item.ncc_campaign_id)===campaignId);
  const adgroups=[...new Map(campaignCandidates.map(item=>[text(item.ncc_adgroup_id),{id:text(item.ncc_adgroup_id),name:text(item.adgroup_name)||'광고그룹 확인 필요'}])).values()].filter(item=>item.id);
  const keywordCandidates=campaignCandidates.filter(item=>!adgroupId||text(item.ncc_adgroup_id)===adgroupId);
  const selectedCandidate=candidates.find(item=>text(item.ncc_keyword_id)===keywordId)||null;

  useEffect(()=>{
    if(!keywordId){setState('empty');setAnalysis(null);return;}
    const controller=new AbortController();
    setState('loading');setError('');
    fetch(`/api/naver/bid-performance-analysis?keywordId=${encodeURIComponent(keywordId)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'순위·성과 자료를 불러오지 못했습니다.');return payload.analysis;})
      .then(result=>{setAnalysis(result);setState('ready');})
      .catch(reason=>{if(reason.name==='AbortError')return;setError(reason.message||'순위·성과 자료를 불러오지 못했습니다.');setState('error');});
    return ()=>controller.abort();
  },[keywordId,refreshKey]);

  const chooseCampaign=value=>{
    const nextCandidates=candidates.filter(item=>text(item.ncc_campaign_id)===value),next=nextCandidates[0];
    setCampaignId(value);setAdgroupId(text(next?.ncc_adgroup_id));setKeywordId(text(next?.ncc_keyword_id));
  };
  const chooseAdgroup=value=>{
    const next=candidates.find(item=>text(item.ncc_adgroup_id)===value);
    setAdgroupId(value);setKeywordId(text(next?.ncc_keyword_id));
  };
  const series=(analysis?.daily||[]).slice(-range);
  const rangeMetrics=analysis?.windows?.[String(range)]||{};
  const rankWindow=analysis?.rank?.windows?.[String(range)]||{};
  const competition=rankWindow.competition||{};
  const weekdayMax=Math.max(0,...(analysis?.weekdays||[]).map(item=>Number(item.cost||0)));
  const hourMax=Math.max(0,...(analysis?.hours||[]).map(item=>Number(item.cost||0)));

  return <section className={styles.workbench} aria-labelledby="keyword-performance-title">
    <header className={styles.hero}>
      <div><span><HarinIcon name="growth" size={18}/> NAVER RANK STUDIO</span><h2 id="keyword-performance-title">순위와 입찰가, 성과를 한 시간축에서 봐요</h2><p>실제 평균순위와 목표순위 예상값을 섞지 않고, 선택한 네이버 키워드의 최근 1·3·7일 변화를 비교합니다.</p></div>
      <aside><i><HarinIcon name="shield" size={21}/></i><span><small>읽기 전용 분석</small><b>광고값 변경 없음</b><em>네이버와 쿠팡 자료 분리</em></span></aside>
    </header>

    {candidates.length?<div className={styles.controls}>
      <label><span>캠페인</span><select value={campaignId} onChange={event=>chooseCampaign(event.target.value)}>{campaigns.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span>광고그룹</span><select value={adgroupId} onChange={event=>chooseAdgroup(event.target.value)}>{adgroups.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className={styles.keywordSelect}><span>키워드</span><select value={keywordId} onChange={event=>setKeywordId(event.target.value)}>{keywordCandidates.map(item=><option value={item.ncc_keyword_id} key={item.ncc_keyword_id}>{item.keyword}</option>)}</select></label>
      <button type="button" onClick={()=>setRefreshKey(value=>value+1)} disabled={state==='loading'}><HarinIcon name="sync" size={19}/>{state==='loading'?'불러오는 중':'다시 조회'}</button>
    </div>:<div className={styles.emptyState}><i><HarinIcon name="keyword" size={25}/></i><span><b>분석할 네이버 키워드가 없어요</b><p>데이터수집에서 네이버 광고 키워드를 먼저 받아주세요.</p></span><Link href="/data-collection/naver-api">연결 상태 확인</Link></div>}

    {state==='loading'?<div className={styles.skeleton} role="status" aria-live="polite"><span/><span/><span/><p>선택한 키워드의 실제 평균순위와 성과만 불러오고 있어요.</p></div>:null}
    {state==='error'?<div className={styles.errorState} role="alert"><i><HarinIcon name="warning" size={22}/></i><span><b>순위·성과를 불러오지 못했어요</b><p>{error}</p></span><button type="button" onClick={()=>setRefreshKey(value=>value+1)}>다시 시도</button></div>:null}

    {state==='ready'&&analysis?<>
      <section className={styles.sourceStrip} aria-label="순위 데이터 종류">
        <span className={sourceTone(analysis.status)}><i/><b>{analysis.sources.actual.label}</b><em>{analysis.sources.actual.notice}</em></span>
        <span className={analysis.estimate.status==='READY'?styles.estimateReady:styles.waiting}><i/><b>{analysis.sources.estimate.label}</b><em>{analysis.sources.estimate.notice}</em></span>
      </section>

      <section className={styles.primaryPanel}>
        <header className={styles.panelHeader}><div><small>{selectedCandidate?.campaign_name||'네이버 캠페인'} · {selectedCandidate?.adgroup_name||'광고그룹'}</small><h3>{analysis.scope.keyword}</h3><p>{analysis.period.since} ~ {analysis.period.until} · 현재 입찰가 {won(analysis.scope.current_bid)}</p></div><nav aria-label="성과 기간 선택">{RANGE_OPTIONS.map(({days,label})=><button type="button" className={range===days?styles.activeRange:''} aria-pressed={range===days} onClick={()=>setRange(days)} key={days}>{label}</button>)}</nav></header>
        <div className={styles.metricGrid}>
          <MetricCard icon="growth" label="실제 평균순위" value={rank(rangeMetrics.average_rank)} note={`${rangeMetrics.available_days||0}일 실제 자료`} tone="lavender"/>
          <MetricCard icon="target" label="목표 적중률" value={percent(rankWindow.percent)} note={!analysis.rank.target?'안전설정에서 목표 필요':rankWindow.percent==null?'실제 순위 자료 확인 필요':`${rankWindow.hit_days}/${rankWindow.ranked_days}일 · 목표 ${analysis.rank.target}위 이내`} tone="mint"/>
          <MetricCard icon="speed" label="경쟁 강도" value={competition.label||'확인 필요'} note={competition.volatility==null?'순위 자료 2일 이상 필요':`순위 변동성 ${Number(competition.volatility).toFixed(2)}`} tone="blue"/>
          <MetricCard icon="price" label="현재 입찰가" value={won(analysis.scope.current_bid)} note="그래프 막대 기준" tone="amber"/>
        </div>
        <RankBidChart daily={series} target={analysis.rank.target}/>
        <p className={styles.competitionNotice}>{competition.notice||'경쟁 강도는 실제 평균순위 자료가 쌓인 뒤 표시합니다.'} <b>{competition.action||''}</b></p>
      </section>

      <section className={styles.splitPanel}>
        <div><header className={styles.sectionHeader}><span><i><HarinIcon name="mobile" size={20}/></i><b>PC·모바일 성과</b></span><em>실제 집계 분리</em></header><div className={styles.deviceGrid}>{analysis.devices.map(item=><DeviceCard item={item} key={item.key}/>)}</div></div>
        <div className={styles.estimatePanel}><header className={styles.sectionHeader}><span><i><HarinIcon name="target" size={20}/></i><b>목표순위 예상 입찰가</b></span><em>예상값</em></header><div className={styles.estimateValues}><span><small>PC 예상</small><b>{won(analysis.estimate.pc_bid)}</b></span><span><small>모바일 예상</small><b>{won(analysis.estimate.mobile_bid)}</b></span></div><p>{analysis.estimate.notice}</p><Link href="/keywords/registered?platform=naver">입찰 작업대로 이동 <i>→</i></Link></div>
      </section>

      <section className={styles.heatPanel}>
        <header className={styles.sectionHeader}><span><i><HarinIcon name="clock" size={20}/></i><b>요일·시간 성과 온도</b></span><em>진할수록 광고비가 큼</em></header>
        <div className={styles.heatSection}><h4>요일</h4><div className={styles.weekHeat}>{analysis.weekdays.map(item=><HeatCell item={item} label={item.label} max={weekdayMax} key={item.key}/>)}</div></div>
        <div className={styles.heatSection}><h4>시간</h4><div className={styles.hourHeat}>{analysis.hours.map(item=><HeatCell item={item} label={String(item.hour).padStart(2,'0')} max={hourMax} key={item.hour}/>)}</div></div>
        <p className={styles.heatNote}>요일과 시간은 각각 네이버가 제공한 실제 집계입니다. 교차값이 아니므로 임의로 합쳐 만들지 않습니다.</p>
      </section>

      <section className={styles.financePanel}>
        <header className={styles.sectionHeader}><span><i><HarinIcon name="settlement" size={20}/></i><b>광고비에서 주문·이익까지</b></span><em>최근 {range}일</em></header>
        <div className={styles.financeRail}><span><small>광고비</small><b>{won(rangeMetrics.cost)}</b></span><i>→</i><span><small>주문</small><b>{format(rangeMetrics.orders,{suffix:'건'})}</b></span><i>→</i><span><small>전환매출</small><b>{won(rangeMetrics.revenue)}</b></span><i>→</i><span><small>ROAS</small><b>{percent(rangeMetrics.roas)}</b></span><i>→</i><span className={styles.blockedProfit}><small>실제 이익</small><b>판단 보류</b></span></div>
        <footer><p><HarinIcon name="shield" size={18}/>{rangeMetrics.profit_reason}</p><Link href="/products/profit">상품별 실제 이익 확인</Link></footer>
      </section>
    </>:null}
  </section>;
}
