'use client';

import {useMemo,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './insights-page.css';

const STAGE_LABELS=['변화','원인','이익','행동'];
const WORKSPACES=['이번 주','저장 인사이트','채널 비교','수익성'];
const WORKSPACE_IDS=['week','saved','compare','profit'];
const STATUS_LABEL={READY:'READY',CHECK_REQUIRED:'확인 필요',CALCULATED:'계산 완료',NO_DATA:'자료 없음'};
const money=value=>value==null||!Number.isFinite(Number(value))?'판단 보류':`${Number(value)<0?'-':''}₩${Math.abs(Math.round(Number(value))).toLocaleString('ko-KR')}`;
const count=value=>value==null||!Number.isFinite(Number(value))?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}건`;
const rate=value=>value==null||!Number.isFinite(Number(value))?'비교 기준 부족':`${Number(value)>0?'+':''}${Number(value).toFixed(1)}%`;
const time=value=>{if(!value)return '기준시각 확인 필요';const date=new Date(value);return Number.isNaN(date.getTime())?'기준시각 확인 필요':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);};
const period=item=>item?.periodStart&&item?.periodEnd?`${item.periodStart} ~ ${item.periodEnd}`:'기간 확인 필요';
const stageValue=stage=>stage.id==='profit'&&typeof stage.value==='number'?money(stage.value):stage.value;

function ChannelDeck({channels,selectedId,onSelect,schedule}){
  return <section className="inChannelDeck" aria-labelledby="inChannelTitle"><header><div><span>CHANNEL WEEKLY DESK</span><h2 id="inChannelTitle">채널을 섞지 않고 각각의 주간 근거를 봅니다.</h2><p>같은 채널의 직전 보고서만 비교하고, 다른 채널 값으로 빈칸을 채우지 않아요.</p></div><b>{schedule?.label||'매주 월요일 07:30'} 자동 생성</b></header><div className="inChannelSwitch">{channels.map(channel=><button type="button" key={channel.id} data-selected={channel.id===selectedId} aria-pressed={channel.id===selectedId} onClick={()=>onSelect(channel.id)}><Phase28ChannelLogo brand={channel.platform}/><span><strong>{channel.name}</strong><small>{channel.source}</small></span><em data-status={channel.trust?.status}>{STATUS_LABEL[channel.trust?.status]||'확인 필요'}</em></button>)}</div></section>;
}

function SignalTrack({channel}){
  return <section className="inSignalTrack" aria-labelledby="inSignalTitle"><header><div><span>WEEKLY SIGNAL TRACK</span><h2 id="inSignalTitle">{channel?.name||'채널'}에서 달라진 흐름을 한 줄로 이어서 봅니다.</h2></div><strong>{channel?.currentPeriod?.end||'보고서 대기'} 기준</strong></header><div className="inSignalStages">{(channel?.stages||[]).map((stage,index)=><article key={stage.id}><i>{String(index+1).padStart(2,'0')}</i><span>{STAGE_LABELS[index]||stage.label}</span><strong>{stageValue(stage)}</strong><small>{stage.note}</small></article>)}</div></section>;
}

function ThisWeek({channel,onSelectSignal}){
  const signals=channel?.signals||[];
  return <section className="inWeekPanel"><header><div><span>OWNER WEEKLY BRIEF</span><h3>{channel?.name||'선택 채널'}에서 먼저 판단할 변화</h3></div><b>{channel?.currentReportId?`${channel.reportCount}개 보고서 근거`:'보고서 생성 대기'}</b></header><div className="inBriefGrid"><article><span>무엇이 달라졌나요?</span><strong>{channel?.stages?.[0]?.value||'변화 확인 필요'}</strong><small>{channel?.stages?.[0]?.note}</small></article><article><span>왜 달라졌나요?</span><strong>{channel?.cause||'원인 판단 보류'}</strong><small>{channel?.causeNote}</small></article><article><span>그래서 무엇을 할까요?</span><strong>{channel?.action||'다음 행동 확인 필요'}</strong><small>{channel?.actionNote}</small></article></div><div className="inSignals">{signals.map((item,index)=><button type="button" onClick={()=>onSelectSignal(item)} key={item.id} data-tone={item.tone}><b>{String(index+1).padStart(2,'0')}</b><span><strong>{item.title}</strong><small>{item.note}</small></span><em>{item.tone==='danger'||item.tone==='warning'?'우선 확인':item.tone==='hold'?'판단 보류':'근거 보기'}</em></button>)}</div></section>;
}

function DetailFlow({detail}){
  return <div className="inReportDetail" data-detail-state="loaded"><div data-insight-detail-flow><article><span>변화</span><strong>{detail.flow?.change}</strong></article><article><span>원인·이익</span><strong>{detail.flow?.cause}</strong><small>{money(detail.flow?.profit?.value)}</small></article><article><span>다음 행동</span><strong>{detail.flow?.action}</strong></article></div><footer><span data-insight-detail-source>{detail.provenance?.source} · 채널 원천 분리</span><b>{detail.id} · 저장 스냅샷</b></footer>{detail.caveats?.length?<ul>{detail.caveats.map((item,index)=><li key={index}>{item}</li>)}</ul>:null}</div>;
}

function SavedReports({reports,detailCache,detailState,openReport,onToggle}){
  return <section className="inSavedPanel"><header><div><span>SAVED WEEKLY INSIGHTS</span><h3>보고서 상세는 펼칠 때 한 건만 불러옵니다.</h3><p>다시 펼치면 화면 캐시를 사용해 같은 자료를 중복 요청하지 않아요.</p></div><b>{reports.length}건 저장</b></header><div className="inSavedList">{reports.length?reports.map(report=>{const open=openReport===report.id;return <article key={report.id}><button type="button" aria-expanded={open} onClick={()=>onToggle(report.id)}><span><strong>{report.title}</strong><small>{period(report)} · {time(report.createdAt)}</small></span><b>{rate(report.changeRate)}</b><em>{report.status==='FINAL'?'저장 완료':report.status}</em><i>⌄</i></button>{open?<div className="inDetailShell">{detailState[report.id]==='loading'?<div className="inDetailLoading" role="status"><i/><i/><span>저장 인사이트 한 건을 불러오는 중이에요.</span></div>:detailState[report.id]==='error'?<p className="inDetailError">상세를 불러오지 못했습니다. 잠시 뒤 다시 펼쳐주세요.</p>:detailCache[report.id]?<DetailFlow detail={detailCache[report.id]}/>:null}</div>:null}</article>;}):<p className="inEmpty">선택 채널의 저장된 주간 인사이트가 아직 없습니다.</p>}</div></section>;
}

function ChannelCompare({channels}){
  return <section className="inComparePanel"><header><div><span>CHANNEL COMPARISON</span><h3>채널은 합산하지 않고 같은 열에서 나란히 비교합니다.</h3><p>각 값은 채널별 최신 주간 보고서의 독립 근거예요.</p></div></header><div className="inCompareTable"><div><span>채널</span><span>매출 변화</span><span>주문</span><span>공헌이익</span><span>수집 상태</span></div>{channels.map(channel=><article key={channel.id}><span><Phase28ChannelLogo brand={channel.platform} size="compact"/><b>{channel.name}</b></span><strong>{rate(channel.changeRate)}</strong><strong>{count(channel.orders)}</strong><strong>{money(channel.profit)}</strong><em data-status={channel.trust?.status}>{STATUS_LABEL[channel.trust?.status]||'확인 필요'}</em></article>)}</div></section>;
}

function ProfitPanel({channel}){
  const revenue=Number(channel?.revenue)||0,profit=channel?.profit;
  const profitWidth=profit==null?0:Math.min(100,Math.max(5,Math.abs(profit)/(Math.abs(revenue)||1)*100));
  return <section className="inProfitPanel"><header><div><span>CHANNEL PROFIT FLOW</span><h3>{channel?.name} · 확인된 채널 단위 이익 근거</h3><p>통합 공헌이익을 개별 채널 값으로 재사용하지 않습니다.</p></div><b>{channel?.currentPeriod?.end||'기간 확인 필요'}</b></header><div className="inProfitBars"><article><span>채널 매출</span><i><em style={{'--bar':'100%'}}/></i><strong>{money(channel?.revenue)}</strong></article><article data-tone="cost"><span>광고·비용</span><i><em style={{'--bar':channel?.profit==null?'0%':`${Math.max(8,100-profitWidth)}%`}}/></i><strong>{channel?.profit==null?'확인 필요':'계산 포함'}</strong></article><article data-tone="result"><span>공헌이익</span><i><em style={{'--bar':`${profitWidth}%`}}/></i><strong>{money(profit)}</strong></article></div><div className="inProfitCaveat"><HarinIcon name="info" size={20}/><span><strong>{profit==null?'이익 판단 보류':'채널 이익 계산 완료'}</strong><small>{profit==null?'채널 단위 원가·수수료·광고비 근거가 모두 확인되기 전에는 값을 만들지 않습니다.':'저장 보고서의 채널 단위 비용 근거로 계산했습니다.'}</small></span></div></section>;
}

function InsightDesk({channel,selectedSignal,schedule,policy}){
  return <div className="inDecisionDesk"><header><span>WEEKLY INSIGHT DESK</span><h2>{channel?.name||'채널 선택'}</h2><p>{channel?.currentPeriod?`${channel.currentPeriod.start} ~ ${channel.currentPeriod.end}`:'저장 보고서 생성 대기'}</p></header><div className="inDeskStatus"><i data-ready={channel?.trust?.status==='READY'}/><span><small>수집 근거</small><strong>{channel?.trust?.label||'확인 필요'}</strong><em>{time(channel?.trust?.lastSuccessAt)}</em></span></div><section><span>SELECTED SIGNAL</span><strong>{selectedSignal?.title||channel?.action||'확인할 신호를 선택하세요.'}</strong><p>{selectedSignal?.note||channel?.actionNote||'채널별 저장 근거에서 다음 행동을 확인합니다.'}</p></section><div className="inDeskFlow">{(channel?.stages||[]).map(stage=><article key={stage.id}><i/><span><small>{stage.label}</small><strong>{stageValue(stage)}</strong></span></article>)}</div><section className="inDeskAction"><span>NEXT SAFE ACTION</span><strong>{channel?.action||'주간 보고서 생성 상태 확인'}</strong><p>상품·가격·광고를 자동 변경하지 않고 조회와 판단 근거만 제공합니다.</p></section><div className="inDeskPolicy"><h3>자동 인사이트 정책</h3><p><span>생성</span><b>{schedule?.label||'매주 월요일 07:30'}</b></p><p><span>상세</span><b>{policy?.detailLoading==='ON_DEMAND'?'펼칠 때만 조회':'확인 필요'}</b></p><p><span>빈 값</span><b>{policy?.missingAsZero===false?'0 처리 금지':'확인 필요'}</b></p></div></div>;
}

export default function Phase28InsightsPage({model={}}){
  const channels=model.channels||[];
  const [selectedId,setSelectedId]=useState(channels[0]?.id||'naver');
  const initialWorkspace=model.initialWorkspace==='channels'?'compare':model.initialWorkspace==='profitability'?'profit':'week';
  const [workspace,setWorkspace]=useState(initialWorkspace);
  const [selectedSignal,setSelectedSignal]=useState(null);
  const [openReport,setOpenReport]=useState(null);
  const [detailCache,setDetailCache]=useState({});
  const [detailState,setDetailState]=useState({});
  const selected=useMemo(()=>channels.find(channel=>channel.id===selectedId)||channels[0]||null,[channels,selectedId]);
  const reports=model.savedReports?.[selected?.platform]||[];

  async function loadReport(reportId){
    if(detailCache[reportId])return;
    setDetailState(current=>({...current,[reportId]:'loading'}));
    try{
      const response=await fetch(`/api/insights/reports/${encodeURIComponent(reportId)}`);
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||'저장 인사이트를 불러오지 못했습니다.');
      setDetailCache(current=>({...current,[reportId]:payload.detail}));
      setDetailState(current=>({...current,[reportId]:'ready'}));
    }catch{
      setDetailState(current=>({...current,[reportId]:'error'}));
    }
  }

  function toggleReport(reportId){
    if(openReport===reportId){setOpenReport(null);return;}
    setOpenReport(reportId);
    loadReport(reportId);
  }

  function selectChannel(id){setSelectedId(id);setSelectedSignal(null);setOpenReport(null);}
  const hero=model.hero||{};
  return <main className="p28Insights" data-phase28-root="true" data-phase28-page="insights" aria-label="이번 주 먼저 볼 인사이트">
    <div className="inIntro"><Phase28PageHeading context={`주간 자동 생성 · 채널 분리 · 저장 보고서 ${model.reportCount||0}건`} title="이번 주 먼저 볼 " accent="인사이트" suffix={` ${hero.count||0}건이 있어요.`} summary={hero.summary||'주간 변화와 원인, 이익, 다음 행동을 채널별 저장 근거로 이어서 봅니다.'}/><div className="inIntroStatus"><HarinIcon name="analysis" size={23}/><span><small>다음 자동 생성</small><strong>{model.schedule?.label||'매주 월요일 07:30'}</strong><em>상세 지연 로딩 · 서버 저장</em></span></div></div>
    <ChannelDeck channels={channels} selectedId={selectedId} onSelect={selectChannel} schedule={model.schedule}/>
    <SignalTrack channel={selected}/>
    <nav className="inWorkspaceTabs" aria-label="인사이트 작업 보기" role="tablist">{WORKSPACES.map((label,index)=><button type="button" role="tab" key={WORKSPACE_IDS[index]} aria-selected={workspace===WORKSPACE_IDS[index]} onClick={()=>setWorkspace(WORKSPACE_IDS[index])}>{label}</button>)}</nav>
    <Phase28RightRailLayout label="주간 인사이트 판단석" rail={<InsightDesk channel={selected} selectedSignal={selectedSignal} schedule={model.schedule} policy={model.policy}/>}>{workspace==='week'?<ThisWeek channel={selected} onSelectSignal={setSelectedSignal}/>:workspace==='saved'?<SavedReports reports={reports} detailCache={detailCache} detailState={detailState} openReport={openReport} onToggle={toggleReport}/>:workspace==='compare'?<ChannelCompare channels={channels}/>:<ProfitPanel channel={selected}/>}</Phase28RightRailLayout>
  </main>;
}
