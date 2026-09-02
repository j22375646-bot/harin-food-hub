'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import {pushPhase28Route} from '../phase28-navigation-feedback.js';
import './settlement-page.css';

const CHANNEL_ORDER=['NAVER','CAFE24','COUPANG','COUPANG_RG'];
const AUTO_REFRESH_MS=5*60*1000;
const WORKSPACES=[
  {id:'payouts',label:'지급 내역'},
  {id:'variance',label:'차이'},
  {id:'costs',label:'비용 근거'},
  {id:'naver-ads',label:'네이버 광고비'},
  {id:'history',label:'대조 이력'}
];

function money(value,{signed=false}={}){
  if(value==null||!Number.isFinite(Number(value)))return '확인 필요';
  const amount=Math.round(Number(value));
  if(amount===0)return signed?'일치':'₩0';
  return `${amount<0?'-':signed&&amount>0?'+':''}₩${Math.abs(amount).toLocaleString('ko-KR')}`;
}
function dateLabel(value){
  if(!value)return '날짜 확인 필요';
  const date=new Date(`${String(value).slice(0,10)}T00:00:00+09:00`);
  if(Number.isNaN(date.getTime()))return '날짜 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric'}).format(date);
}
function referenceTime(value){
  if(!value)return '기준시각 확인 필요';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '기준시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}
function count(value,suffix='건'){return value==null?'확인 필요':`${Number(value).toLocaleString('ko-KR')}${suffix}`;}
function platformLabel(platform){return platform==='NAVER'?'네이버':platform==='CAFE24'?'Cafe24':platform==='COUPANG_RG'?'쿠팡 로켓그로스':platform==='COUPANG_COMBINED'?'쿠팡 통합 지급':'쿠팡';}
function platformBrand(platform){return platform==='COUPANG_COMBINED'?'COUPANG':platform;}

function collectionSummary(result={}){
  const jobs=Array.isArray(result.jobs)?result.jobs:[];
  const queued=jobs.filter(job=>job.status==='RUNNING').length;
  const attention=jobs.filter(job=>job.degraded||!job.ok||['PARTIAL','FAILED','SETUP_REQUIRED','APPROVAL_REQUIRED'].includes(job.status)).length;
  if(queued)return `${queued}개 고정 IP 수집을 시작했습니다.${attention?` ${attention}개 경로는 확인이 필요합니다.`:''}`;
  if(attention)return `${attention}개 수집 경로는 확인이 필요하고, 나머지는 최신 자료로 갱신했습니다.`;
  return '연결된 채널의 정산 자료를 최신 상태로 갱신했습니다.';
}

function waterfallLayout(items){
  const safeValue=value=>value==null||!Number.isFinite(Number(value))?null:Math.max(0,Math.abs(Number(value)));
  const values=Object.fromEntries(items.map(item=>[item.id,safeValue(item.value)]));
  const max=Math.max(1,...Object.values(values).filter(value=>value!=null));
  const layout={gross:{height:values.gross||0,bottom:0,connector:values.gross||0}};
  let running=values.gross||0;
  let chainKnown=values.gross!=null;
  for(const id of ['refunds','fees','logistics','advertising']){
    const value=values[id];
    const connected=chainKnown&&value!=null;
    if(connected)running=Math.max(0,running-value);
    layout[id]={height:value||0,bottom:connected?running:0,connector:connected?running:0};
    chainKnown=connected;
  }
  layout.expected={height:values.expected||0,bottom:0,connector:values.expected||0};
  layout.actual={height:values.actual||0,bottom:0,connector:values.actual||0};
  return Object.fromEntries(Object.entries(layout).map(([id,item])=>[id,{
    '--bar-height':`${Math.max(item.height?5:0,item.height/max*100)}%`,
    '--bar-bottom':`${Math.max(0,item.bottom/max*100)}%`,
    '--connector-bottom':`${Math.min(98,Math.max(1,item.connector/max*100))}%`
  }]));
}

function RocketGrowthFlow({flow}){
  const gross=flow?.gross;
  const net=flow?.net;
  const netWidth=gross>0&&net!=null?Math.max(4,Math.min(100,net/gross*100)):0;
  return <section className="spRocketGrowthFlow" data-ready={gross!=null} aria-labelledby="spRocketGrowthTitle">
    <header><div><span>ROCKET GROWTH · SEPARATE LEDGER</span><h3 id="spRocketGrowthTitle">로켓그로스 매출 반영</h3></div><em>{flow?.includedInTotalGross?'총매출에 한 번만 포함':'매출 근거 확인 필요'}</em></header>
    {flow?<><div className="spRocketBars" role="img" aria-label={`로켓그로스 판매매출 ${money(gross)}, 비용 차감 후 예상 정산 ${money(net)}`}>
      <article><span>로켓그로스 판매매출</span><i className="spRocketGrossBar"><b/></i><strong>{money(gross)}</strong></article>
      <article><span>비용 차감 후 예상 정산</span><i className="spRocketNetBar"><b style={{'--rocket-net-width':`${netWidth}%`}}/></i><strong>{money(net)}</strong></article>
    </div><dl className="spRocketDeductions"><div><dt>취소·환불</dt><dd>{money(flow.refunds)}</dd></div><div><dt>판매 수수료</dt><dd>{money(flow.fees)}</dd></div><div><dt>배송·물류비</dt><dd>{money(flow.logistics)}</dd></div><div><dt>광고비</dt><dd>{money(flow.advertising)}</dd></div><div><dt>총 공제</dt><dd>{money(flow.deductions)}</dd></div></dl></>:<div className="spRocketEmpty"><strong>로켓그로스 정산 근거를 확인하고 있어요.</strong><span>판매자배송 매출과 합치지 않고 별도 수집 결과를 기다립니다.</span></div>}
    <p>판매액은 총매출에 1회 포함하고, 수수료·배송/물류비·광고비를 차감한 순정산만 예상 지급액에 반영합니다.</p>
  </section>;
}

function DecisionBoard({model,period,setPeriod,selectedId,onSelect}){
  const styles=useMemo(()=>waterfallLayout(model.waterfall||[]),[model]);
  const channels=model.channels||[];
  const comparable=channels.filter(item=>item.variance!=null);
  const maxVariance=Math.max(1,...comparable.map(item=>Math.abs(item.variance)));
  const referenceDay=String(model.end||'').slice(0,10);
  const allSchedules=(model.schedules||[]).filter(item=>item.date);
  const futureSchedules=allSchedules.filter(item=>!referenceDay||String(item.date)>=referenceDay).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const nextSchedules=(futureSchedules.length?futureSchedules:allSchedules.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))).slice(0,3);
  const next=nextSchedules[0]||null;
  const varianceCount=channels.filter(item=>item.needsAttention).length;
  return <section className="spDecisionBoard" aria-labelledby="spDecisionTitle">
    <header className="spBoardHeading"><div><span>최근 정산 대조</span><h2 id="spDecisionTitle">판매금이 실제 지급액이 되기까지 한 줄로 맞춰봐요.</h2><p>공제 흐름과 채널별 차이를 같은 기간으로 계산하고, 모르는 값은 확인 필요로 남겨요.</p></div><div className="spPeriod"><div role="group" aria-label="정산 조회 기간">{(model.periodOptions||[period]).map(days=><button type="button" aria-pressed={period===days} key={days} onClick={()=>setPeriod(days)}>{days}일</button>)}</div><span>최근 {period}일 · {referenceTime(model.end)} 기준</span></div></header>
    <div className="spLedger" aria-label="선택 기간 정산 요약"><article><span>예상 정산액</span><strong>{money(model.expected)}</strong><small>확인된 주문·공제 기준</small></article><article><span>{model.actualComplete?'실제 지급액':'확인된 지급액'}</span><strong>{money(model.actual)}</strong><small>{model.actualComplete?'모든 매출 채널 정산서 기준':`${count(model.actualChannelCount,'개')}/${count(model.revenueChannelCount,'개')} 채널만 지급 확인`}</small></article><article data-attention="true"><span>예상 대비 차이</span><strong>{money(model.variance,{signed:true})}</strong><small>{varianceCount?`${varianceCount}개 채널 근거 확인 필요`:'대조 완료'}</small></article><article><span>다음 지급</span><strong>{next?dateLabel(next.date):'확인 필요'}</strong><small>{next?`${platformLabel(next.platform)} · ${money(next.amount)}`:'지급 일정 자료 없음'}</small></article></div>
    <div className="spSpineGrid"><figure className="spWaterfall"><figcaption><div><span>정산 대조 스파인</span><strong>총매출에서 실제 지급까지</strong></div><div className="spChartMeta"><div className="spLegend"><i data-tone="blue"/>지급액<i data-tone="expense"/>공제<i data-tone="actual"/>실제/확인 지급</div><em data-state={model.automation?.state}>{model.automation?.state==='READY'?'자동 대조 완료':`자동 대조 ${model.automation?.knownPoints||0}/${model.automation?.totalPoints||7} · 근거 수집 중`}</em></div></figcaption><RocketGrowthFlow flow={model.rocketGrowthFlow}/><div className="spWaterfallChart" role="img" aria-label="로켓그로스 판매매출을 포함한 총매출에서 취소 환불, 판매 수수료, 배송 물류비, 광고비를 거쳐 예상 정산액과 실제 지급액을 비교한 그래프">{(model.waterfall||[]).map(item=><article className="spWaterfallStep" data-tone={item.tone} data-known={item.value!=null} data-chain-connected={item.chainConnected} data-connects-next={item.connectsNext} data-partial={item.partial===true} data-negative={Number(item.value)<0} key={item.id}><div className="spWaterfallTrack"><i className="spWaterfallBar" style={styles[item.id]}/></div><strong>{item.value==null?'확인 필요':money(['refunds','fees','logistics','advertising'].includes(item.id)?-Math.abs(item.value):item.value)}</strong><span>{item.label}</span></article>)}</div><p>{model.automation?.state==='READY'?'모든 공제와 지급 근거를 같은 기간으로 자동 대조했습니다.':'확인된 값만 표시했습니다. 비어 있는 공제와 지급 근거가 수집되면 연결선과 합계가 자동으로 완성됩니다.'}</p></figure>
      <section className="spVarianceLens" aria-labelledby="spVarianceTitle"><header><div><span>채널별 차이</span><h3 id="spVarianceTitle">0원선에서 벗어난 금액</h3></div><strong>{money(model.variance,{signed:true})}</strong></header><div>{channels.map(channel=>{const width=channel.variance==null?0:Math.max(channel.variance===0?0:8,Math.abs(channel.variance)/maxVariance*46);return <button type="button" className="spVarianceRow" data-selected={selectedId===channel.id} data-tone={channel.tone} aria-pressed={selectedId===channel.id} key={channel.id} onClick={()=>onSelect(channel.id)}><Phase28ChannelLogo brand={channel.platform}/><span><strong>{channel.label}</strong><small>{channel.stateLabel}</small></span><i className="spVarianceTrack" style={{'--variance-width':`${width}%`}} aria-hidden="true"><b/></i><em>{money(channel.variance,{signed:true})}</em></button>;})}</div></section>
    </div>
    <div className="spDecisionBrief"><article><span>금액 변화</span><strong>{model.variance==null?'비교할 실제 지급액 확인 필요':model.variance===0?'예상과 실제 지급액 일치':`예상보다 ${Math.abs(model.variance).toLocaleString('ko-KR')}원 ${model.variance<0?'적게':'많게'} 지급`}</strong></article><article><span>확인된 근거</span><strong>{count(comparable.length,'개 채널')} 비교 가능</strong></article><article><span>다음 행동</span><strong>{channels.find(item=>item.needsAttention)?.action||'다음 지급 일정을 확인하세요.'}</strong></article></div>
    <section className="spPayoutTimeline" aria-labelledby="spPayoutTitle"><header><div><span>지급 예정 흐름</span><h3 id="spPayoutTitle">가까운 입금과 막힌 근거</h3></div><small>각 채널 정산서 기준</small></header><div className="spPayoutAxis" aria-hidden="true"/><div className="spPayoutEvents">{nextSchedules.length?nextSchedules.map((schedule,index)=>{const channel=channels.find(item=>item.platform===schedule.platform);return <button type="button" className="spPayoutEvent" data-selected={channel?.id===selectedId} key={`${schedule.platform}-${schedule.date}-${index}`} onClick={()=>channel&&onSelect(channel.id)}><i data-tone={channel?.tone||'warning'}/><Phase28ChannelLogo brand={platformBrand(schedule.platform)}/><span><small>{dateLabel(schedule.date)} · {schedule.status}</small><strong>{money(schedule.amount)}</strong><em>{schedule.platform==='COUPANG_COMBINED'?'판매자배송·로켓그로스 미분리':channel?.stateLabel||'근거 확인 필요'}</em></span></button>; }):<div className="spEmptyTimeline"><HarinIcon name="clock" size={22}/><strong>수집된 지급 일정이 없어요.</strong><span>채널 정산 수집 상태를 확인해주세요.</span></div>}</div></section>
  </section>;
}

function PayoutRows({channels,selectedId,onSelect}){
  return <div className="spTableBoundary"><div className="spTableHead"><span>채널·기준</span><span>예상</span><span>확정</span><span>차이</span><span>상태</span></div><div className="spPayoutRows">{channels.map(channel=><button type="button" data-selected={selectedId===channel.id} key={channel.id} onClick={()=>onSelect(channel.id)}><span><Phase28ChannelLogo brand={channel.platform}/><i><b>{channel.label}</b><small>{channel.basis}</small></i></span><span>{money(channel.expected)}</span><span>{money(channel.actual)}</span><strong data-tone={channel.tone}>{money(channel.variance,{signed:true})}</strong><em data-tone={channel.tone}>{channel.stateLabel}</em></button>)}</div></div>;
}

function VarianceWorkspace({channels,selectedId,onSelect}){
  const rows=channels.filter(item=>item.needsAttention);
  return <div className="spExceptionList">{rows.length?rows.map((channel,index)=><button type="button" data-selected={selectedId===channel.id} key={channel.id} onClick={()=>onSelect(channel.id)}><span>{String(index+1).padStart(2,'0')}</span><Phase28ChannelLogo brand={channel.platform}/><div><strong>{channel.label} 정산 근거</strong><small>{channel.action}</small></div><b>{money(channel.variance,{signed:true})}</b><em data-tone={channel.tone}>{channel.stateLabel}</em></button>):<div className="spEmptyState"><HarinIcon name="check" size={24}/><strong>확인할 정산 차이가 없어요.</strong><span>예상과 실제 지급액이 모두 맞았습니다.</span></div>}</div>;
}

function CostWorkspace({channels}){
  return <div className="spCostGrid">{channels.map(channel=><article key={channel.id}><header><Phase28ChannelLogo brand={channel.platform}/><span><small>{channel.label}</small><strong>정산 근거 {channel.evidence.coverage}%</strong></span></header><div className="spCoverage" data-tone={channel.tone}><i style={{'--coverage':`${channel.evidence.coverage}%`}}/></div><p>{channel.basis} · {channel.action}</p><dl><div><dt>수수료</dt><dd>{money(channel.fees)}</dd></div><div><dt>배송·물류비</dt><dd>{money(channel.logistics)}</dd></div><div><dt>광고비</dt><dd>{money(channel.advertising)}</dd></div>{channel.platform==='NAVER'?<div><dt>비즈머니 충전</dt><dd>{money(channel.advertisingCharged)}</dd></div>:null}</dl></article>)}</div>;
}

function NaverAdvertisingWorkspace({channels}){
  const naver=channels.find(channel=>channel.platform==='NAVER');
  if(!naver)return <div className="spEmptyState"><HarinIcon name="database" size={24}/><strong>네이버 광고 계정 근거가 없어요.</strong><span>네이버 검색광고 연결 상태를 확인해주세요.</span></div>;
  const history=naver.advertisingHistory||[];
  return <div className="spNaverAds"><header><div><Phase28ChannelLogo brand="NAVER"/><span><small>NAVER BIZMONEY RECONCILIATION</small><h3>충전과 실제 사용 광고비를 따로 맞춰봐요.</h3></span></div><p>충전액은 현금 이동이며 비용으로 중복 차감하지 않습니다. 비즈머니 차감액만 실제 광고비로 대조합니다.</p></header><div className="spNaverAdMetrics"><article><span>실제 사용 광고비</span><strong>{money(naver.advertising)}</strong><small>비즈머니 차감 기준</small></article><article><span>비즈머니 충전</span><strong>{money(naver.advertisingCharged)}</strong><small>신용카드·무상 충전 합계</small></article><article><span>현재 잔액</span><strong>{money(naver.advertisingBalance)}</strong><small>최신 계정 잔액</small></article><article data-attention={naver.advertisingVariance!==0}><span>캠페인 통계와 차이</span><strong>{money(naver.advertisingVariance,{signed:true})}</strong><small>통계 {money(naver.advertisingStats)} 대비</small></article></div><div className="spNaverAdHistory"><div className="spNaverAdHistoryHead"><span>일자</span><span>충전</span><span>사용</span><span>잔액</span></div>{history.length?history.map(row=><article key={row.date}><time>{dateLabel(row.date)}</time><strong>{money(row.charged)}</strong><strong>{money(row.used)}</strong><strong>{money(row.balance)}</strong></article>):<div className="spEmptyState"><strong>저장된 비즈머니 내역이 아직 없어요.</strong><span>다음 네이버 광고 자동 수집 후 충전·사용 내역이 날짜별로 표시됩니다.</span></div>}</div></div>;
}

function HistoryWorkspace({schedules}){
  return <div className="spHistory">{schedules.length?schedules.map((schedule,index)=><article key={`${schedule.platform}-${schedule.date}-${index}`}><time>{dateLabel(schedule.date)}</time><Phase28ChannelLogo brand={platformBrand(schedule.platform)}/><div><strong>{schedule.type}</strong><p>{schedule.status} · {money(schedule.amount)}</p></div><em>조회 전용</em></article>):<div className="spEmptyState"><HarinIcon name="database" size={24}/><strong>대조 이력이 아직 없어요.</strong><span>채널별 정산 원본이 수집되면 날짜순으로 표시됩니다.</span></div>}</div>;
}

function SettlementWorkbench({model,workspace,setWorkspace,selectedId,onSelect}){
  const channels=model.channels||[];
  const varianceCount=channels.filter(item=>item.needsAttention).length;
  return <section className="spWorkbench" aria-labelledby="spWorkbenchTitle"><header><div><span>RECONCILIATION WORKSPACE</span><h2 id="spWorkbenchTitle">정산 대조 작업공간</h2></div><small>마지막 대조 {referenceTime(model.end)}</small></header><nav className="spTabs" role="tablist" aria-label="정산 작업공간">{WORKSPACES.map(tab=><button type="button" role="tab" aria-selected={workspace===tab.id} key={tab.id} onClick={()=>setWorkspace(tab.id)}>{tab.label}{tab.id==='variance'&&varianceCount?` ${varianceCount}`:''}</button>)}</nav><div className="spWorkspacePanel" role="tabpanel">{workspace==='payouts'?<PayoutRows channels={channels} selectedId={selectedId} onSelect={onSelect}/>:workspace==='variance'?<VarianceWorkspace channels={channels} selectedId={selectedId} onSelect={onSelect}/>:workspace==='costs'?<CostWorkspace channels={channels}/>:workspace==='naver-ads'?<NaverAdvertisingWorkspace channels={channels}/>:<HistoryWorkspace schedules={model.schedules||[]}/>}</div></section>;
}

function EvidenceRail({channel,router,onWorkspace}){
  if(!channel)return <div className="spRailEmpty"><HarinIcon name="settlement" size={24}/><strong>선택된 정산 근거가 없어요.</strong><span>채널 자료가 수집되면 예상액과 실제 지급액을 나란히 표시합니다.</span></div>;
  const recovery=channel.recovery||{kind:'route',label:'수집 상태 확인하기',href:'/data-collection',workspace:null};
  const actionTarget=recovery.href;
  return <div className="spRailBody"><header><span>SELECTED DIFFERENCE</span><h2>{channel.label} 정산 근거</h2><p>예상 {money(channel.expected)} · 실제 {money(channel.actual)} · 차이 {money(channel.variance,{signed:true})}</p></header><div className="spRailStatus" data-tone={channel.tone}><i/><strong>{channel.stateLabel}</strong></div><dl><div><dt>주문 원본</dt><dd>{count(channel.evidence.orderCount)}</dd></div>{channel.platform==='COUPANG_RG'?<div><dt>정산 원본</dt><dd>{channel.evidence.settlementSourceStatus==='SEPARATE_SOURCE_REQUIRED'?'WING 별도 원장 필요':channel.evidence.settlementOrderCount==null?'확인 필요':`${count(channel.evidence.settlementOrderCount)} · ${channel.evidence.settlementCoverage}%`}</dd></div>:null}<div><dt>정산 기준</dt><dd>{channel.basis}</dd></div><div><dt>수수료</dt><dd>{money(channel.fees)}</dd></div><div><dt>물류비</dt><dd>{money(channel.logistics)}</dd></div><div><dt>광고비</dt><dd>{money(channel.advertising)}</dd></div>{channel.platform==='NAVER'?<><div><dt>광고비 충전</dt><dd>{money(channel.advertisingCharged)}</dd></div><div><dt>비즈머니 잔액</dt><dd>{money(channel.advertisingBalance)}</dd></div></>:null}<div><dt>근거 수집률</dt><dd>{channel.evidence.coverage}%</dd></div><div><dt>기준 시각</dt><dd>{referenceTime(channel.asOf)}</dd></div></dl><section><span>NEXT CHECK</span><strong>{channel.action}</strong>{recovery.kind==='external'?<a href={actionTarget} target="_blank" rel="noreferrer">{recovery.label} <i>↗</i></a>:recovery.kind==='workspace'?<button type="button" onClick={()=>onWorkspace(recovery.workspace)}>{recovery.label} <i>↓</i></button>:<button type="button" onClick={()=>pushPhase28Route(router,actionTarget)}>{recovery.label} <i>→</i></button>}</section><p>조회 전용 · 채널별 원본과 수정 경로를 섞지 않아요.</p></div>;
}

function SettlementAi({panel}){
  const [open,setOpen]=useState(false);
  return <section className="spAi"><div><span>SETTLEMENT AI · ISOLATED</span><h2>예상과 실제 지급액의 차이만 설명해요.</h2><p>{panel?.summary||'주문·광고 AI와 자료나 실행 경로를 섞지 않습니다.'}</p>{open?<small>서버가 계산한 금액과 근거 상태만 설명하며, 누락 금액을 추정하거나 지급·수정 요청을 실행하지 않습니다.</small>:null}</div><div><span>{panel?.enabled?'사용 설정 확인':'사용 시작 전 · 비용 0원'}</span><strong>{panel?.ready?'분석 근거 준비':'AI 호출 없이 규칙 기반 상태만 표시'}</strong></div><button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'설명 닫기':'설명 보기'}</button></section>;
}

export default function Phase28SettlementPage({model={},aiPanel=null}){
  const router=useRouter();
  const options=model.periodOptions?.length?model.periodOptions:[model.defaultPeriod||30];
  const [period,setPeriod]=useState(model.defaultPeriod||options[0]||30);
  const current=model.periods?.[String(period)]||model.periods?.[String(model.defaultPeriod)]||{waterfall:[],channels:[],schedules:[],periodOptions:options};
  const periodModel={...current,periodOptions:options};
  const channels=current.channels||[];
  const [selectedId,setSelectedId]=useState(channels[0]?.id||'');
  const [workspace,setWorkspace]=useState('payouts');
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState('');
  useEffect(()=>{if(channels.length&&!channels.some(item=>item.id===selectedId))setSelectedId(channels[0].id);},[channels,selectedId]);
  useEffect(()=>{
    let lastRefresh=Date.now();
    const refresh=()=>{if(document.visibilityState==='visible'){lastRefresh=Date.now();router.refresh();}};
    const timer=window.setInterval(refresh,AUTO_REFRESH_MS);
    const onVisibility=()=>{if(document.visibilityState==='visible'&&Date.now()-lastRefresh>=AUTO_REFRESH_MS)refresh();};
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);};
  },[router]);
  const syncSettlement=async()=>{
    if(syncing)return;
    setSyncing(true);setSyncMessage('Cafe24·네이버·쿠팡 정산 원본 수집을 요청하고 있어요.');
    try{
      const response=await fetch('/api/sync/all',{method:'POST',credentials:'same-origin',headers:{accept:'application/json'}});
      const result=await response.json().catch(()=>({}));
      if(response.status===401){window.location.assign('/login?next=%2Fsettlement-costs');return;}
      if(!response.ok&&response.status!==207)throw new Error(result.error||'정산 자료 수집을 시작하지 못했습니다.');
      setSyncMessage(collectionSummary(result));
      router.refresh();
      window.setTimeout(()=>router.refresh(),8000);
    }catch(error){setSyncMessage(error?.message||'정산 자료 수집 상태를 확인해주세요.');}
    finally{setSyncing(false);}
  };
  const selected=channels.find(item=>item.id===selectedId)||channels[0]||null;
  const hero=model.hero||{};
  const collection=model.collectionAutomation||{};
  return <section className="p28Settlement" data-phase28-root="true" data-phase28-page="settlement">
    <div className="spIntro"><Phase28PageHeading context={`${hero.channelCount??0}개 판매 채널 대조 · 근거 없는 비용은 확인 필요`} title="오늘 확인할 " accent={`정산 차이 ${hero.checkCount??0}건`} suffix="이 있어요." summary={hero.summary||'받을 돈과 실제 지급액을 맞춰 보고, 근거가 없는 비용은 0원으로 만들지 않아요.'}/><div className="spAutomationPanel"><div className="spDataStatus" data-state={collection.state}><i><HarinIcon name="settlement" size={22}/></i><span><small>최근 정산 자동 수집</small><strong>{referenceTime(collection.latestAt||hero.asOf)}</strong><em>{collection.summary||'채널별 계산 경로 분리'}</em></span></div><button type="button" className="spSyncButton" disabled={syncing} aria-busy={syncing} onClick={syncSettlement}><HarinIcon name="sync" size={17}/>{syncing?'수집 요청 중':'정산 전체 동기화'}</button><p className="spSyncMessage" aria-live="polite">{syncMessage}</p></div></div>
    <DecisionBoard model={periodModel} period={period} setPeriod={setPeriod} selectedId={selectedId} onSelect={setSelectedId}/>
    <Phase28RightRailLayout label="정산 근거 패널" rail={<EvidenceRail channel={selected} router={router} onWorkspace={setWorkspace}/> }><SettlementWorkbench model={current} workspace={workspace} setWorkspace={setWorkspace} selectedId={selectedId} onSelect={setSelectedId}/></Phase28RightRailLayout>
    <SettlementAi panel={aiPanel}/>
  </section>;
}
