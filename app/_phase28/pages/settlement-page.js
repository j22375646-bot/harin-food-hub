'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import {pushPhase28Route} from '../phase28-navigation-feedback.js';
import './settlement-page.css';

const CHANNEL_ORDER=['NAVER','CAFE24','COUPANG'];
const WORKSPACES=[
  {id:'payouts',label:'지급 내역'},
  {id:'variance',label:'차이'},
  {id:'costs',label:'비용 근거'},
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

function waterfallLayout(items){
  const values=Object.fromEntries(items.map(item=>[item.id,item.value]));
  const gross=Math.max(0,Number(values.gross)||0);
  const refunds=Math.max(0,Number(values.refunds)||0);
  const fees=Math.max(0,Number(values.fees)||0);
  const logistics=Math.max(0,Number(values.logistics)||0);
  const advertising=Math.max(0,Number(values.advertising)||0);
  const expected=Number(values.expected)||0;
  const actual=Number(values.actual)||0;
  const max=Math.max(gross,Math.abs(expected),Math.abs(actual),refunds,fees,logistics,advertising,1);
  const layout={
    gross:{height:gross,bottom:0,connector:gross},
    refunds:{height:refunds,bottom:Math.max(0,gross-refunds),connector:Math.max(0,gross-refunds)},
    fees:{height:fees,bottom:Math.max(0,gross-refunds-fees),connector:Math.max(0,gross-refunds-fees)},
    logistics:{height:logistics,bottom:Math.max(0,gross-refunds-fees-logistics),connector:Math.max(0,gross-refunds-fees-logistics)},
    advertising:{height:advertising,bottom:Math.max(0,gross-refunds-fees-logistics-advertising),connector:Math.max(0,gross-refunds-fees-logistics-advertising)},
    expected:{height:Math.abs(expected),bottom:0,connector:Math.max(0,expected)},
    actual:{height:Math.abs(actual),bottom:0,connector:Math.max(0,actual)}
  };
  return Object.fromEntries(Object.entries(layout).map(([id,item])=>[id,{
    '--bar-height':`${Math.max(item.height?5:0,item.height/max*100)}%`,
    '--bar-bottom':`${Math.max(0,item.bottom/max*100)}%`,
    '--connector-bottom':`${Math.min(98,Math.max(1,item.connector/max*100))}%`
  }]));
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
  const varianceCount=channels.filter(item=>item.variance!==0||item.actual==null||item.expected==null).length;
  return <section className="spDecisionBoard" aria-labelledby="spDecisionTitle">
    <header className="spBoardHeading"><div><span>최근 정산 대조</span><h2 id="spDecisionTitle">판매금이 실제 지급액이 되기까지 한 줄로 맞춰봐요.</h2><p>공제 흐름과 채널별 차이를 같은 기간으로 계산하고, 모르는 값은 확인 필요로 남겨요.</p></div><div className="spPeriod"><div role="group" aria-label="정산 조회 기간">{(model.periodOptions||[period]).map(days=><button type="button" aria-pressed={period===days} key={days} onClick={()=>setPeriod(days)}>{days}일</button>)}</div><span>최근 {period}일 · {referenceTime(model.end)} 기준</span></div></header>
    <div className="spLedger" aria-label="선택 기간 정산 요약"><article><span>예상 정산액</span><strong>{money(model.expected)}</strong><small>확인된 주문·공제 기준</small></article><article><span>실제 지급액</span><strong>{money(model.actual)}</strong><small>채널 정산서 기준</small></article><article data-attention="true"><span>예상 대비 차이</span><strong>{money(model.variance,{signed:true})}</strong><small>{varianceCount?`${varianceCount}개 채널 근거 확인 필요`:'대조 완료'}</small></article><article><span>다음 지급</span><strong>{next?dateLabel(next.date):'확인 필요'}</strong><small>{next?`${next.platform==='NAVER'?'네이버':next.platform==='CAFE24'?'Cafe24':'쿠팡'} · ${money(next.amount)}`:'지급 일정 자료 없음'}</small></article></div>
    <div className="spSpineGrid"><figure className="spWaterfall"><figcaption><div><span>정산 대조 스파인</span><strong>총매출에서 실제 지급까지</strong></div><div className="spLegend"><i data-tone="blue"/>지급액<i data-tone="expense"/>공제<i data-tone="actual"/>차이</div></figcaption><div className="spWaterfallChart" role="img" aria-label="총매출에서 취소 환불, 판매 수수료, 배송 물류비, 광고비를 거쳐 예상 정산액과 실제 지급액을 비교한 그래프">{(model.waterfall||[]).map(item=><article className="spWaterfallStep" data-tone={item.tone} data-known={item.value!=null} data-negative={Number(item.value)<0} key={item.id}><div className="spWaterfallTrack"><i className="spWaterfallBar" style={styles[item.id]}/></div><strong>{item.value==null?'확인 필요':money(['refunds','fees','logistics','advertising'].includes(item.id)?-Math.abs(item.value):item.value)}</strong><span>{item.label}</span></article>)}</div><p>채널별 원본은 섞지 않고, 같은 기간의 서버 계산 합계만 한 축에서 비교합니다.</p></figure>
      <section className="spVarianceLens" aria-labelledby="spVarianceTitle"><header><div><span>채널별 차이</span><h3 id="spVarianceTitle">0원선에서 벗어난 금액</h3></div><strong>{money(model.variance,{signed:true})}</strong></header><div>{channels.map(channel=>{const width=channel.variance==null?0:Math.max(channel.variance===0?0:8,Math.abs(channel.variance)/maxVariance*46);return <button type="button" className="spVarianceRow" data-selected={selectedId===channel.id} data-tone={channel.tone} aria-pressed={selectedId===channel.id} key={channel.id} onClick={()=>onSelect(channel.id)}><Phase28ChannelLogo brand={channel.platform}/><span><strong>{channel.label}</strong><small>{channel.stateLabel}</small></span><i className="spVarianceTrack" style={{'--variance-width':`${width}%`}} aria-hidden="true"><b/></i><em>{money(channel.variance,{signed:true})}</em></button>;})}</div></section>
    </div>
    <div className="spDecisionBrief"><article><span>금액 변화</span><strong>{model.variance==null?'비교할 실제 지급액 확인 필요':model.variance===0?'예상과 실제 지급액 일치':`예상보다 ${Math.abs(model.variance).toLocaleString('ko-KR')}원 ${model.variance<0?'적게':'많게'} 지급`}</strong></article><article><span>확인된 근거</span><strong>{count(comparable.length,'개 채널')} 비교 가능</strong></article><article><span>다음 행동</span><strong>{channels.find(item=>item.variance!==0||item.actual==null)?.action||'다음 지급 일정을 확인하세요.'}</strong></article></div>
    <section className="spPayoutTimeline" aria-labelledby="spPayoutTitle"><header><div><span>지급 예정 흐름</span><h3 id="spPayoutTitle">가까운 입금과 막힌 근거</h3></div><small>각 채널 정산서 기준</small></header><div className="spPayoutAxis" aria-hidden="true"/><div className="spPayoutEvents">{nextSchedules.length?nextSchedules.map((schedule,index)=>{const channel=channels.find(item=>item.platform===schedule.platform);return <button type="button" className="spPayoutEvent" data-selected={channel?.id===selectedId} key={`${schedule.platform}-${schedule.date}-${index}`} onClick={()=>channel&&onSelect(channel.id)}><i data-tone={channel?.tone||'warning'}/><Phase28ChannelLogo brand={schedule.platform}/><span><small>{dateLabel(schedule.date)} · {schedule.status}</small><strong>{money(schedule.amount)}</strong><em>{channel?.stateLabel||'근거 확인 필요'}</em></span></button>; }):<div className="spEmptyTimeline"><HarinIcon name="clock" size={22}/><strong>수집된 지급 일정이 없어요.</strong><span>채널 정산 수집 상태를 확인해주세요.</span></div>}</div></section>
  </section>;
}

function PayoutRows({channels,selectedId,onSelect}){
  return <div className="spTableBoundary"><div className="spTableHead"><span>채널·기준</span><span>예상</span><span>확정</span><span>차이</span><span>상태</span></div><div className="spPayoutRows">{channels.map(channel=><button type="button" data-selected={selectedId===channel.id} key={channel.id} onClick={()=>onSelect(channel.id)}><span><Phase28ChannelLogo brand={channel.platform}/><i><b>{channel.label}</b><small>{channel.basis}</small></i></span><span>{money(channel.expected)}</span><span>{money(channel.actual)}</span><strong>{money(channel.variance,{signed:true})}</strong><em data-tone={channel.tone}>{channel.stateLabel}</em></button>)}</div></div>;
}

function VarianceWorkspace({channels,selectedId,onSelect}){
  const rows=channels.filter(item=>item.variance!==0||item.actual==null||item.expected==null);
  return <div className="spExceptionList">{rows.length?rows.map((channel,index)=><button type="button" data-selected={selectedId===channel.id} key={channel.id} onClick={()=>onSelect(channel.id)}><span>{String(index+1).padStart(2,'0')}</span><Phase28ChannelLogo brand={channel.platform}/><div><strong>{channel.label} 정산 근거</strong><small>{channel.action}</small></div><b>{money(channel.variance,{signed:true})}</b><em data-tone={channel.tone}>{channel.stateLabel}</em></button>):<div className="spEmptyState"><HarinIcon name="check" size={24}/><strong>확인할 정산 차이가 없어요.</strong><span>예상과 실제 지급액이 모두 맞았습니다.</span></div>}</div>;
}

function CostWorkspace({channels}){
  return <div className="spCostGrid">{channels.map(channel=><article key={channel.id}><header><Phase28ChannelLogo brand={channel.platform}/><span><small>{channel.label}</small><strong>정산 근거 {channel.evidence.coverage}%</strong></span></header><div className="spCoverage" data-tone={channel.tone}><i style={{'--coverage':`${channel.evidence.coverage}%`}}/></div><p>{channel.basis} · {channel.action}</p><dl><div><dt>수수료</dt><dd>{money(channel.fees)}</dd></div><div><dt>배송·물류비</dt><dd>{money(channel.logistics)}</dd></div><div><dt>광고비</dt><dd>{money(channel.advertising)}</dd></div></dl></article>)}</div>;
}

function HistoryWorkspace({schedules}){
  return <div className="spHistory">{schedules.length?schedules.map((schedule,index)=><article key={`${schedule.platform}-${schedule.date}-${index}`}><time>{dateLabel(schedule.date)}</time><Phase28ChannelLogo brand={schedule.platform}/><div><strong>{schedule.type}</strong><p>{schedule.status} · {money(schedule.amount)}</p></div><em>조회 전용</em></article>):<div className="spEmptyState"><HarinIcon name="database" size={24}/><strong>대조 이력이 아직 없어요.</strong><span>채널별 정산 원본이 수집되면 날짜순으로 표시됩니다.</span></div>}</div>;
}

function SettlementWorkbench({model,workspace,setWorkspace,selectedId,onSelect}){
  const channels=model.channels||[];
  const varianceCount=channels.filter(item=>item.variance!==0||item.actual==null||item.expected==null).length;
  return <section className="spWorkbench" aria-labelledby="spWorkbenchTitle"><header><div><span>RECONCILIATION WORKSPACE</span><h2 id="spWorkbenchTitle">정산 대조 작업공간</h2></div><small>마지막 대조 {referenceTime(model.end)}</small></header><nav className="spTabs" role="tablist" aria-label="정산 작업공간">{WORKSPACES.map(tab=><button type="button" role="tab" aria-selected={workspace===tab.id} key={tab.id} onClick={()=>setWorkspace(tab.id)}>{tab.label}{tab.id==='variance'&&varianceCount?` ${varianceCount}`:''}</button>)}</nav><div className="spWorkspacePanel" role="tabpanel">{workspace==='payouts'?<PayoutRows channels={channels} selectedId={selectedId} onSelect={onSelect}/>:workspace==='variance'?<VarianceWorkspace channels={channels} selectedId={selectedId} onSelect={onSelect}/>:workspace==='costs'?<CostWorkspace channels={channels}/>:<HistoryWorkspace schedules={model.schedules||[]}/>}</div></section>;
}

function EvidenceRail({channel,router}){
  if(!channel)return <div className="spRailEmpty"><HarinIcon name="settlement" size={24}/><strong>선택된 정산 근거가 없어요.</strong><span>채널 자료가 수집되면 예상액과 실제 지급액을 나란히 표시합니다.</span></div>;
  return <div className="spRailBody"><header><span>SELECTED DIFFERENCE</span><h2>{channel.label} 정산 근거</h2><p>예상 {money(channel.expected)} · 실제 {money(channel.actual)} · 차이 {money(channel.variance,{signed:true})}</p></header><div className="spRailStatus" data-tone={channel.tone}><i/><strong>{channel.stateLabel}</strong></div><dl><div><dt>주문 원본</dt><dd>{count(channel.evidence.orderCount)}</dd></div><div><dt>정산 기준</dt><dd>{channel.basis}</dd></div><div><dt>수수료</dt><dd>{money(channel.fees)}</dd></div><div><dt>물류비</dt><dd>{money(channel.logistics)}</dd></div><div><dt>광고비</dt><dd>{money(channel.advertising)}</dd></div><div><dt>근거 수집률</dt><dd>{channel.evidence.coverage}%</dd></div><div><dt>기준 시각</dt><dd>{referenceTime(channel.asOf)}</dd></div></dl><section><span>NEXT CHECK</span><strong>{channel.action}</strong><button type="button" onClick={()=>pushPhase28Route(router,'/products/costs')}>상품 원가로 이어보기 <i>→</i></button></section><p>조회 전용 · 채널별 원본과 수정 경로를 섞지 않아요.</p></div>;
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
  useEffect(()=>{if(channels.length&&!channels.some(item=>item.id===selectedId))setSelectedId(channels[0].id);},[channels,selectedId]);
  const selected=channels.find(item=>item.id===selectedId)||channels[0]||null;
  const hero=model.hero||{};
  return <main className="p28Settlement" data-phase28-root="true" data-phase28-page="settlement">
    <div className="spIntro"><Phase28PageHeading context={`${hero.channelCount??0}개 판매 채널 대조 · 근거 없는 비용은 확인 필요`} title="오늘 확인할 " accent={`정산 차이 ${hero.checkCount??0}건`} suffix="이 있어요." summary={hero.summary||'받을 돈과 실제 지급액을 맞춰 보고, 근거가 없는 비용은 0원으로 만들지 않아요.'}/><div className="spDataStatus"><i><HarinIcon name="settlement" size={22}/></i><span><small>정산 데이터 기준</small><strong>{referenceTime(hero.asOf)}</strong><em>채널별 계산 경로 분리</em></span></div></div>
    <DecisionBoard model={periodModel} period={period} setPeriod={setPeriod} selectedId={selectedId} onSelect={setSelectedId}/>
    <Phase28RightRailLayout label="정산 근거 패널" rail={<EvidenceRail channel={selected} router={router}/> }><SettlementWorkbench model={current} workspace={workspace} setWorkspace={setWorkspace} selectedId={selectedId} onSelect={setSelectedId}/></Phase28RightRailLayout>
    <SettlementAi panel={aiPanel}/>
  </main>;
}
