'use client';

import {useEffect,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './insights-page.css';

const WORKSPACES=['사장님 브리프','저장 주간 진단','누적 주간 진단'];
const WORKSPACE_IDS=['week','saved','diagnostics'];
const WORKSPACE_HREF={week:'/insights/overview',saved:'/insights/saved',diagnostics:'/insights/diagnostics'};
const STATUS_LABEL={READY:'정상',FAILED:'실패',RUNNING:'진행 중',CHECK_REQUIRED:'확인 필요'};
const money=value=>value==null||!Number.isFinite(Number(value))?'확인 필요':`${Number(value)<0?'-':''}₩${Math.abs(Math.round(Number(value))).toLocaleString('ko-KR')}`;
const count=value=>value==null||!Number.isFinite(Number(value))?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}건`;
const rate=value=>value==null||!Number.isFinite(Number(value))?'확인 필요':`${Number(value)>0?'+':''}${Number(value).toFixed(1)}%`;
const metricValue=item=>item?.unit==='KRW'?money(item.value):item?.unit==='PERCENT'?rate(item.value):item?.unit==='COUNT'?count(item.value):item?.value??'확인 필요';
const time=value=>{if(!value)return '기준시각 확인 필요';const date=new Date(value);return Number.isNaN(date.getTime())?'기준시각 확인 필요':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);};
const period=item=>item?.periodStart&&item?.periodEnd?`${item.periodStart} ~ ${item.periodEnd}`:'기간 확인 필요';

function NaverFocus({channel,schedule}){
  return <section className="inChannelDeck inNaverFocus" aria-labelledby="inChannelTitle"><header><div><span>NAVER WEEKLY PILOT</span><h2 id="inChannelTitle">네이버 주간 인사이트부터 깊게 자동화합니다.</h2><p>검색광고 API의 캠페인·키워드·전환 근거만 사용하고, 채널 전체 매출이나 실제 이익으로 과장하지 않습니다.</p></div><b>{schedule?.label||'매주 월요일 07:30'} 자동 생성</b></header><div className="inNaverSource"><Phase28ChannelLogo brand="NAVER"/><span><strong>네이버 검색광고</strong><small>{channel?.source||'검색광고 API · 캠페인 · 키워드'}</small></span><em data-status={channel?.trust?.status}>{STATUS_LABEL[channel?.trust?.status]||'확인 필요'}</em><p><b>{channel?.currentPeriod?.end||'보고서 대기'}</b><small>최신 주간 스냅샷</small></p></div></section>;
}
function FindingList({title,items=[],empty,tone}){
  return <article className="inFindingCard" data-tone={tone}><header><span>{title}</span><b>{items.length}건</b></header><div>{items.length?items.map(item=><section key={item.id}><strong>{item.title}</strong><p>{item.body||item.reason}</p>{item.expected?<small>기대: {item.expected}</small>:null}</section>):<p className="inOwnerEmpty">{empty}</p>}</div></article>;
}

function Scorecard({items=[]}){
  return <div className="inOwnerScore" role="group" aria-label="광고 효율 핵심 수치">{items.map(item=><article key={item.id}><span>{item.label}</span><strong>{metricValue(item)}</strong><small>{item.target!=null?`목표 ${rate(item.target)}`:item.changeRate!=null?`직전 주 대비 ${rate(item.changeRate)}`:'저장 스냅샷 기준'}</small>{item.target!=null&&item.changeRate!=null?<em>직전 주 대비 {rate(item.changeRate)}</em>:null}</article>)}</div>;
}

function LeverBoard({items=[]}){
  return <section className="inOwnerSection inLeverBoard"><header><div><span>OWNER GROWTH LEVERS</span><h4>세 가지 지렛대를 따로 봅니다.</h4><p>ROAS 한 숫자만 보지 않고 객단가·구매 전환율·클릭 비용 중 어디가 막혔는지 역산합니다.</p></div><b>ROAS = AOV × CVR ÷ CPC</b></header><div className="inLeverGrid">{items.map(item=><article key={item.id} data-state={item.state}><header><span>{item.label}</span><em>{item.state==='GOOD'?'범위 충족':item.state==='RISK'?'개선 필요':'확인 필요'}</em></header><strong>{metricValue(item)}</strong><small>{item.targetLabel}</small><b>{item.target==null?'확인 필요':metricValue({...item,value:item.target})}</b><p>{item.diagnosis}</p><footer>{item.action}</footer></article>)}</div></section>;
}

function BottleneckBoard({items=[]}){
  return <section className="inOwnerSection inBottleneckBoard"><header><div><span>SEVEN-STAGE BOTTLENECK</span><h4>병목 진단은 노출부터 재구매까지 이어서 봅니다.</h4><p>앞 단계가 비어 있으면 뒤 단계의 숫자를 확정 판단하지 않습니다.</p></div><b>{items.filter(item=>item.state==='RISK'||item.state==='BLOCKED').length}개 우선 확인</b></header><div className="inBottleneckGrid" role="group" aria-label="7단계 매출 병목 흐름" tabIndex={0}>{items.map(item=><article key={item.id} data-state={item.state}><i>{item.step}</i><span><small>{item.question}</small><strong>{item.label}</strong></span><em>{item.state==='GOOD'?'정상':item.state==='RISK'?'병목':item.state==='BLOCKED'?'판단 차단':'확인 필요'}</em><p>{item.evidence}</p><footer>{item.next}</footer></article>)}</div></section>;
}

function EconomicsBoard({items=[]}){
  return <section className="inOwnerSection inEconomicsBoard"><header><div><span>MONEY EVIDENCE</span><h4>매출과 이익을 섞지 않습니다.</h4><p>광고 귀속 매출, 스토어 전체 매출, 정산 대조, 공헌이익은 서로 다른 근거로 표시합니다.</p></div><b>중복 합산 금지</b></header><div className="inEconomicsGrid">{items.map(item=><article key={item.id} data-state={item.state}><span>{item.label}</span><strong>{metricValue(item)}</strong><small>{item.source}</small><p>{item.note}</p></article>)}</div></section>;
}

function VerificationBoard({items=[]}){
  const blocked=items.filter(item=>item.state==='BLOCKED'||item.state==='CHECK_REQUIRED').length;
  return <section className="inOwnerSection inVerificationBoard"><header><div><span>DECISION CHECKLIST</span><h4>판단 근거 체크</h4><p>매출을 늘리기 전에 수집·귀속·원가·재고 근거가 실제로 준비됐는지 확인합니다.</p></div><b>{blocked?`${blocked}개 확인 필요`:'판단 근거 준비'}</b></header><div className="inVerificationGrid">{items.map(item=><article key={item.id} data-state={item.state}><i aria-hidden="true">{item.state==='READY'?'✓':'!'}</i><span><strong>{item.label}</strong><small>{item.evidence}</small></span><p>{item.action}</p></article>)}</div></section>;
}

function CampaignTable({campaigns=[]}){
  return <section className="inOwnerSection"><header><div><span>CAMPAIGN DECISION</span><h4>캠페인별로 유지·감액·관찰을 나눕니다.</h4><p>표본이 부족하거나 학습 중이면 성과가 낮아도 바로 중단하지 않습니다.</p></div><b>{campaigns.length}개 확인</b></header>{campaigns.length?<div className="inCampaignTable" role="region" aria-label="캠페인별 주간 판단 표" tabIndex={0}><div><span>캠페인</span><span>광고비</span><span>전환매출</span><span>ROAS</span><span>구매</span><span>사장님 판단</span></div>{campaigns.map(item=><article key={item.id}><span><strong>{item.name}</strong><small>{item.category} · 신뢰도 {item.confidence}</small></span><b>{money(item.adSpend)}</b><b>{money(item.attributedRevenue)}</b><b>{rate(item.paidRoas)}</b><b>{count(item.conversions)}</b><em data-decision={item.decision}>{item.decision}</em></article>)}</div>:<p className="inOwnerEmpty">캠페인별 성과가 아직 준비되지 않았습니다.</p>}</section>;
}

function KeywordPanel({keywords={}}){
  const waste=keywords.waste||[],growth=keywords.growth||[];
  return <section className="inOwnerSection"><header><div><span>KEYWORD MONEY MAP</span><h4>돈이 새는 검색어와 검증된 수요를 분리합니다.</h4><p>무전환 비용은 우선 검토하되, 신뢰도가 낮은 키워드는 자동 중단하지 않습니다.</p></div><b>무전환 {money(keywords.wasteCost)}</b></header><div className="inKeywordGrid"><article data-tone="risk"><header><strong>위험 신호 · 무전환</strong><b>{waste.length}개</b></header>{waste.length?waste.map(item=><section key={item.id}><span><strong>{item.keyword}</strong><small>신뢰도 {item.confidence}</small></span><b>{money(item.adSpend)}</b></section>):<p className="inOwnerEmpty">확인된 무전환 키워드가 없습니다.</p>}</article><article data-tone="growth"><header><strong>기회 신호 · 전환 확인</strong><b>{growth.length}개</b></header>{growth.length?growth.map(item=><section key={item.id}><span><strong>{item.keyword}</strong><small>ROAS {rate(item.paidRoas)}</small></span><b>{money(item.attributedRevenue)}</b></section>):<p className="inOwnerEmpty">전환이 확인된 성장 키워드를 수집 중입니다.</p>}</article></div></section>;
}

function ActionPlan({actions={}}){
  const now=actions.now||[],sevenDays=actions.sevenDays||[];
  return <section className="inOwnerSection inActionPlan"><header><div><span>OWNER ACTION LOOP</span><h4>오늘 한 변수만 검토하고, 7일 뒤 성공기준으로 다시 봅니다.</h4></div><b>자동 변경 없음</b></header><div><article><span>01 · 지금 확인</span>{now.length?now.map(item=><section key={item.id}><strong>{item.title}</strong><p>{item.reason}</p><small>사장님 질문 · {item.ownerQuestion}</small></section>):<p className="inOwnerEmpty">즉시 변경할 항목 없이 수집 상태를 확인합니다.</p>}</article><article><span>02 · 성공기준</span>{sevenDays.length?sevenDays.map(item=><section key={item.id}><strong>{item.successMetric}</strong><p>{item.review}</p><small>주의 · {item.risk}</small></section>):<p className="inOwnerEmpty">7일 뒤 비교할 행동 근거가 아직 없습니다.</p>}</article><article data-tone="guard"><span>03 · 안전장치</span><strong>{actions.guardrail||'사장님 확인 전에는 광고·상품을 변경하지 않습니다.'}</strong></article></div></section>;
}

function OwnerBrief({brief,embedded=false}){
  if(!brief)return <section className="inWeekPanel"><p className="inOwnerEmpty">네이버 주간 보고서 생성 대기 중입니다. 수집 상태와 월요일 자동 실행을 확인해주세요.</p></section>;
  const diagnosis=brief.diagnosis||{};
  return <section className={embedded?'inOwnerBrief inOwnerBriefEmbedded':'inOwnerBrief'} data-owner-brief-version={brief.snapshotVersion}><header className="inOwnerDecision"><div><span>사장님 주간 판단</span><h3>{brief.headline}</h3><p>{brief.decision?.reason}</p></div><em data-tone={brief.decision?.tone}><small>이번 주 결정</small><strong>{brief.decision?.label||'판단 보류'}</strong></em></header><section className="inOwnerSection"><header><div><span>WEEKLY SCORECARD</span><h4>광고 효율을 목표와 직전 주에 함께 대조합니다.</h4></div><b>신뢰도 {brief.confidence?.label||'확인 필요'}</b></header><Scorecard items={brief.scorecard}/></section><LeverBoard items={brief.levers}/><BottleneckBoard items={brief.bottleneck}/><EconomicsBoard items={brief.economics}/><section className="inDiagnosisGrid"><FindingList title="잘된 점" items={diagnosis.strengths} empty="확정할 긍정 신호가 아직 없습니다." tone="good"/><FindingList title="위험 신호" items={diagnosis.risks} empty="우선 확인할 위험 신호가 없습니다." tone="risk"/><FindingList title="기회·다음 검토" items={diagnosis.opportunities} empty="추가 검토 기회를 계산 중입니다." tone="opportunity"/></section><CampaignTable campaigns={brief.campaigns}/><KeywordPanel keywords={brief.keywords}/><VerificationBoard items={brief.verification}/><ActionPlan actions={brief.actions}/><footer className="inEvidenceBar"><span><b>근거</b> {brief.evidence?.source} · {brief.evidence?.coverageLabel} · {brief.evidence?.standardVersion}</span><span><b>판정식</b> 서버 {brief.evidence?.formulaVersion} · 목표 ROAS {rate(brief.evidence?.targetRoas)}</span></footer>{brief.caveats?.length?<ul className="inOwnerCaveats">{brief.caveats.map((item,index)=><li key={index}>{item}</li>)}</ul>:null}</section>;
}

function DetailFlow({detail}){
  return <div className="inReportDetail" data-detail-state="loaded"><div data-insight-detail-flow><OwnerBrief brief={detail.ownerBrief} embedded/></div><footer><span data-insight-detail-source>{detail.provenance?.source} · 네이버 원천 분리</span><b>{detail.id} · 저장 스냅샷</b></footer></div>;
}

function SavedReports({reports,detailCache,detailState,openReport,onToggle}){
  return <section className="inSavedPanel"><header><div><span>SAVED NAVER WEEKLY</span><h3>저장된 네이버 주간 진단을 사장님 관점으로 다시 엽니다.</h3><p>기존 스냅샷도 캠페인·키워드·행동 근거까지 재구성하며, 상세는 펼친 한 건만 불러옵니다.</p></div><b>{reports.length}건 저장</b></header><div className="inSavedList">{reports.length?reports.map(report=>{const open=openReport===report.id;return <article key={report.id}><button type="button" aria-expanded={open} onClick={()=>onToggle(report.id)}><span><strong><em>주간</em>{report.title}</strong><small>{period(report)} · {time(report.createdAt)}</small></span><b>{rate(report.changeRate)}</b><em>{report.status==='FINAL'?'저장 완료':report.status}</em><i>⌄</i></button>{open?<div className="inDetailShell">{detailState[report.id]==='loading'?<div className="inDetailLoading" role="status"><i/><i/><span>네이버 주간 판단 근거를 불러오는 중입니다.</span></div>:detailState[report.id]==='error'?<p className="inDetailError">상세를 불러오지 못했습니다. 잠시 뒤 다시 펼쳐주세요.</p>:detailCache[report.id]?<DetailFlow detail={detailCache[report.id]}/>:null}</div>:null}</article>}):<p className="inEmpty">저장된 네이버 주간 진단이 아직 없습니다.</p>}</div></section>;
}

function DiagnosticsPanel({diagnostics,state,detailCache,detailState,openReport,onToggle,automation}){
  const items=(diagnostics?.items||[]).filter(item=>item.platform==='NAVER'&&item.reportType==='WEEKLY');
  if(state==='loading')return <section className="inDiagnosticsPanel"><div className="inDiagnosticsLoading" role="status"><i/><i/><i/><span>네이버 누적 주간 진단을 불러오는 중입니다.</span></div></section>;
  if(state==='error')return <section className="inDiagnosticsPanel"><p className="inDiagnosticsError">누적 주간 진단을 불러오지 못했습니다. 잠시 뒤 다시 열어주세요.</p></section>;
  return <section className="inDiagnosticsPanel"><header><div><span>ACCUMULATED NAVER WEEKLY</span><h3>네이버 주간 자동진단만 시간순으로 쌓습니다.</h3><p>수시·월간·다른 플랫폼 진단은 이번 파일럿 화면에 섞지 않습니다.</p></div><b>{items.length}건 저장</b></header><div className="inAutomationStrip">{(automation?.items||[]).map(item=><article key={item.id} data-state={item.state}><i/><span><strong>{item.label}</strong><small>{item.schedule}</small></span><em>{STATUS_LABEL[item.state]||'확인 필요'}<small>{time(item.lastRunAt)}</small></em></article>)}</div><article className="inDiagnosticGroup"><header><div><Phase28ChannelLogo brand="NAVER"/><span><strong>네이버 주간 진단</strong><small>검색광고 API · 주간 스냅샷</small></span></div><b>{items.length}건</b></header><div className="inDiagnosticList">{items.length?items.map(item=>{const open=openReport===item.id;return <article key={item.id}><div><span>주간 진단 · {item.stateLabel}</span><strong>{item.title}</strong><small>{item.periodLabel} · {item.lastCalculatedLabel}</small></div><button type="button" aria-expanded={open} onClick={()=>onToggle(item.id)}>{open?'접기':'상세보기'}</button>{open?<div className="inDiagnosticDetail">{detailState[item.id]==='loading'?<div className="inDetailLoading" role="status"><i/><i/><span>저장 진단 한 건을 불러오는 중입니다.</span></div>:detailState[item.id]==='error'?<p className="inDetailError">상세 근거를 불러오지 못했습니다.</p>:detailCache[item.id]?<DetailFlow detail={detailCache[item.id]}/>:null}</div>:null}</article>}):<p>저장된 네이버 주간 진단이 아직 없습니다.</p>}</div></article></section>;
}

function InsightDesk({channel,schedule,policy,automation}){
  const brief=channel?.ownerBrief;
  return <div className="inDecisionDesk"><header><span>NAVER OWNER DESK</span><h2>네이버 주간 판단</h2><p>{channel?.currentPeriod?`${channel.currentPeriod.start} ~ ${channel.currentPeriod.end}`:'저장 보고서 생성 대기'}</p></header><div className="inDeskStatus"><i data-ready={channel?.trust?.status==='READY'}/><span><small>수집 근거</small><strong>{channel?.trust?.label||'확인 필요'}</strong><em>{time(channel?.trust?.lastSuccessAt)}</em></span></div><section><span>이번 주 결정</span><strong>{brief?.decision?.label||'판단 보류'}</strong><p>{brief?.decision?.reason||'네이버 주간 성과가 준비되면 판단 근거를 표시합니다.'}</p></section><section><span>가장 먼저 볼 신호</span><strong>{brief?.headline||'주간 진단 생성 대기'}</strong><p>{brief?.confidence?.reason||'표본과 수집 기간을 함께 확인합니다.'}</p></section><div className="inDeskAutomation"><h3>주간 자동화 상태</h3>{(automation?.items||[]).map(item=><p key={item.id} data-state={item.state}><span><i/>{item.label}</span><b>{STATUS_LABEL[item.state]||'확인 필요'}</b></p>)}</div><div className="inDeskPolicy"><h3>판단 안전장치</h3><p><span>생성</span><b>{schedule?.label||'매주 월요일 07:30'}</b></p><p><span>빈 값</span><b>{policy?.missingAsZero===false?'0 처리 금지':'확인 필요'}</b></p><p><span>실행</span><b>{policy?.automaticWrites===false?'사장님 확인 후':'확인 필요'}</b></p></div></div>;
}

export default function Phase28InsightsPage({model={}}){
  const channel=model.channels?.[0]||null;
  const initialWorkspace=model.initialWorkspace==='saved'?'saved':model.initialWorkspace==='diagnostics'?'diagnostics':'week';
  const [workspace,setWorkspace]=useState(initialWorkspace);
  const [openReport,setOpenReport]=useState(null);
  const [detailCache,setDetailCache]=useState({});
  const [detailState,setDetailState]=useState({});
  const [diagnostics,setDiagnostics]=useState(null);
  const [diagnosticsState,setDiagnosticsState]=useState('idle');
  const reports=model.savedReports?.NAVER||[];

  useEffect(()=>setWorkspace(initialWorkspace),[initialWorkspace]);
  useEffect(()=>{
    function restoreLocalWorkspace(){const path=window.location.pathname;setWorkspace(Object.entries(WORKSPACE_HREF).find(([,href])=>href===path)?.[0]||'week');}
    window.addEventListener('popstate',restoreLocalWorkspace);
    return ()=>window.removeEventListener('popstate',restoreLocalWorkspace);
  },[]);
  useEffect(()=>{if(workspace==='diagnostics')loadDiagnostics();},[workspace]);

  function workspaceHref(id){return `${WORKSPACE_HREF[id]||WORKSPACE_HREF.week}?platform=naver`;}
  function syncBrowserUrl(id){const href=workspaceHref(id);const current=`${window.location.pathname}${window.location.search}`;if(current!==href)window.history.pushState(null,'',href);}
  async function loadDiagnostics(){
    if(diagnostics||diagnosticsState==='loading')return;
    setDiagnosticsState('loading');
    try{const response=await fetch('/api/insights/diagnostics');const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'누적 진단을 불러오지 못했습니다.');setDiagnostics(payload.diagnostics);setDiagnosticsState('ready');}
    catch{setDiagnosticsState('error');}
  }
  function openWorkspace(id){setWorkspace(id);syncBrowserUrl(id);if(id==='diagnostics')loadDiagnostics();}
  async function loadReport(reportId){
    if(detailCache[reportId])return;
    setDetailState(current=>({...current,[reportId]:'loading'}));
    try{const response=await fetch(`/api/insights/reports/${encodeURIComponent(reportId)}`);const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'저장 인사이트를 불러오지 못했습니다.');setDetailCache(current=>({...current,[reportId]:payload.detail}));setDetailState(current=>({...current,[reportId]:'ready'}));}
    catch{setDetailState(current=>({...current,[reportId]:'error'}));}
  }
  function toggleReport(reportId){if(openReport===reportId){setOpenReport(null);return;}setOpenReport(reportId);loadReport(reportId);}
  const hero=model.hero||{};
  return <section className="p28Insights" data-phase28-root="true" data-phase28-page="insights" aria-label="네이버 주간 인사이트">
    <div className="inIntro"><Phase28PageHeading context={`네이버 주간 자동진단 · 저장 보고서 ${model.reportCount||0}건`} title="네이버 주간 " accent="인사이트" suffix={` ${hero.count||0}건을 봅니다.`} summary={hero.summary||'네이버 광고 성과를 사장님 관점의 결정과 7일 확인으로 이어서 봅니다.'}/><div className="inIntroStatus"><HarinIcon name="analysis" size={23}/><span><small>다음 자동 생성</small><strong>{model.schedule?.label||'매주 월요일 07:30'}</strong><em>서버 계산 · 자동 변경 없음</em></span></div></div>
    <NaverFocus channel={channel} schedule={model.schedule}/>
    <nav className="inWorkspaceTabs" aria-label="인사이트 작업 보기" role="tablist">{WORKSPACES.map((label,index)=><button type="button" role="tab" key={WORKSPACE_IDS[index]} aria-selected={workspace===WORKSPACE_IDS[index]} onClick={()=>openWorkspace(WORKSPACE_IDS[index])}>{label}</button>)}</nav>
    <Phase28RightRailLayout label="네이버 주간 사장님 판단석" rail={<InsightDesk channel={channel} schedule={model.schedule} policy={model.policy} automation={model.automation}/>}>{workspace==='week'?<OwnerBrief brief={channel?.ownerBrief}/>:workspace==='saved'?<SavedReports reports={reports} detailCache={detailCache} detailState={detailState} openReport={openReport} onToggle={toggleReport}/>:<DiagnosticsPanel diagnostics={diagnostics} state={diagnosticsState} detailCache={detailCache} detailState={detailState} openReport={openReport} onToggle={toggleReport} automation={model.automation}/>}</Phase28RightRailLayout>
  </section>;
}
