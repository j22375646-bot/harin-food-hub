'use client';

import './_operations/harin-operations-v8.css';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { HarinIcon } from './_design-system/harin-icon.js';
import { HarinDonutChart, HarinEmptyState, HarinPageAiRegion, HarinPageFrame, HarinPageHeader, HarinWaterfallChart } from './_design-system/harin-ui.js';

const statusMeta = {
  ACTUAL:{label:'확정 자료',tone:'actual'}, ESTIMATED:{label:'예상 자료',tone:'estimated'},
  COST_REQUIRED:{label:'비용 설정 필요',tone:'warning'}, COLLECTOR_REQUIRED:{label:'수집기 연결 필요',tone:'warning'},
  UNAVAILABLE:{label:'자료 확인 필요',tone:'danger'}, NO_DATA:{label:'자료 없음',tone:'neutral'}
};

function count(value) {
  return Number(value || 0).toLocaleString('ko-KR');
}

function wonOrCheck(value) {
  return value == null ? '확인 필요' : `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
}

function signedWon(value) {
  if(value==null)return '비교 대기';
  const amount=Math.round(Number(value));
  return `${amount>0?'+ ':amount<0?'- ':''}${Math.abs(amount).toLocaleString('ko-KR')}원`;
}

function dateTimeOrCheck(value) {
  if (!value) return '수집 기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '수집 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

function platformIcon(platform='') {
  const value=String(platform).toUpperCase();
  if(value.includes('NAVER'))return 'naverStore';
  if(value.includes('CAFE24'))return 'store';
  if(value.includes('COUPANG'))return 'shoppingBag';
  return 'settlement';
}

function ChannelCard({ channel }) {
  const meta = statusMeta[channel.status] || statusMeta.UNAVAILABLE;
  const mainValue = channel.actual_payout ?? channel.expected_payout;
  const mainLabel = channel.actual_payout != null ? '실제 지급액' : channel.expected_payout != null ? '예상 정산액' : '정산액';
  return <article className={`settlementOpsChannel ${meta.tone}`}>
    <header><div className="settlementOpsChannelTitle"><i><HarinIcon name={platformIcon(channel.platform)} size={19}/></i><span><small>{channel.platform}</small><h2>{channel.label}</h2></span></div><em>{meta.label}</em></header>
    <div className="settlementOpsMainValue"><small>{mainLabel}</small><strong>{wonOrCheck(mainValue)}</strong><span>{channel.basis}</span></div>
    <dl>
      <div><dt>결제·매출</dt><dd>{wonOrCheck(channel.gross_sales)}</dd></div><div><dt>취소·환불</dt><dd>{wonOrCheck(channel.refunds)}</dd></div>
      <div><dt>수수료</dt><dd>{wonOrCheck(channel.fees)}</dd></div><div><dt>물류비</dt><dd>{wonOrCheck(channel.logistics)}</dd></div>
    </dl>
    <div className={`settlementVariance ${channel.payout_variance==null?'pending':channel.payout_variance<0?'negative':'positive'}`}><small>예상 대비 실제 차이</small><b>{signedWon(channel.payout_variance)}</b></div>
    <p>{channel.action}</p>
    <footer><span>{channel.order_count == null ? '주문 건수 확인 필요' : `${count(channel.order_count)}건 반영`}</span><span>갱신 {dateTimeOrCheck(channel.last_updated_at)}</span></footer>
  </article>;
}

function SettlementWaterfall({ waterfall={} }) {
  const items=[
    {label:'결제·매출',value:waterfall.gross_sales,tone:'plus',description:'전체 결제 금액'},
    {label:'취소·환불',value:waterfall.refunds,tone:'minus',description:'매출에서 제외'},
    {label:'채널·결제 수수료',value:waterfall.fees,tone:'minus',description:'확인된 수수료'},
    {label:'예상 정산 반영액',value:waterfall.expected_payout,tone:'result',description:'상품 원가·광고비 제외'}
  ];
  const facts=<><span><HarinIcon name="truck" size={18}/><small>별도 확인 물류비</small><b>{wonOrCheck(waterfall.logistics)}</b></span><span><HarinIcon name="settlement" size={18}/><small>실제 지급액 합계</small><b>{wonOrCheck(waterfall.actual_payout)}</b></span><span className={waterfall.variance<0?'negative':''}><HarinIcon name="growth" size={18}/><small>예상 대비 차이</small><b>{signedWon(waterfall.variance)}</b></span></>;
  return <HarinWaterfallChart className="settlementEvidenceWaterfall settlementJourneyCopy" title="매출에서 정산액까지" description="정산액의 흐름만 보여드려요. 상품 원가와 광고비를 반영한 실제 이익은 상품 화면에서 확인하세요." items={items} footer={facts}/>;
}

function SettlementDecisionFlow({ waterfall={}, checkRequired=0, onCompare, onCosts }) {
  const knownCauses=[
    waterfall.refunds==null?null:`취소·환불 ${wonOrCheck(waterfall.refunds)}`,
    waterfall.fees==null?null:`수수료 ${wonOrCheck(waterfall.fees)}`,
    waterfall.logistics==null?null:`물류비 ${wonOrCheck(waterfall.logistics)}`
  ].filter(Boolean);
  const action=waterfall.actual_payout==null
    ? '실제 지급액 수집 확인'
    : waterfall.variance<0
      ? '채널 대조에서 차감 원인 확인'
      : checkRequired>0
        ? '자료·비용 설정 보완'
        : '다음 정산 일정 확인';
  return <section className="settlementDecisionFlow" data-core-visualization="settlement-flow" aria-label="정산 금액 변화와 다음 행동">
    <ol>
      <li><i><HarinIcon name="growth" size={20}/></i><span><small>1</small><b>금액 변화</b><strong>{signedWon(waterfall.variance)}</strong><em>예상 대비 실제 지급액</em></span></li>
      <li><i><HarinIcon name="search" size={20}/></i><span><small>2</small><b>원인 확인</b><strong>{knownCauses.length?knownCauses.slice(0,2).join(' · '):'확인 필요'}</strong><em>{knownCauses.length>2?`외 ${knownCauses.length-2}개 항목`:'확인된 차감 항목'}</em></span><button type="button" onClick={onCompare}>비교</button></li>
      <li><i><HarinIcon name="checklist" size={20}/></i><span><small>3</small><b>다음 행동</b><strong>{action}</strong><em>{checkRequired>0?`확인할 채널 ${count(checkRequired)}개`:'정산 자료 기준'}</em></span><button type="button" onClick={checkRequired>0?onCosts:onCompare}>열기</button></li>
    </ol>
    <SettlementWaterfall waterfall={waterfall}/>
    <p>상품 원가와 광고비를 반영한 실제 이익은 <Link href="/insights/profitability">인사이트 수익성 분석</Link>에서만 판단합니다.</p>
  </section>;
}

export default function UnifiedSettlementOperationsCenter({ center = {}, children, aiPanel }) {
  const [workspace,setWorkspace]=useState('SUMMARY');
  const summary = center.summary || {};
  const channels = Array.isArray(center.channels) ? center.channels : [];
  const schedules = Array.isArray(center.schedules) ? center.schedules : [];
  const costRequired=channels.filter(channel=>['COST_REQUIRED','UNAVAILABLE','NO_DATA'].includes(channel.status)).length;
  const negativeVariance=channels.filter(channel=>channel.payout_variance!=null&&channel.payout_variance<0);
  const reconciliation=useMemo(()=>[...channels].sort((a,b)=>{
    const aCheck=!['ACTUAL','ESTIMATED'].includes(a.status)?1:0;
    const bCheck=!['ACTUAL','ESTIMATED'].includes(b.status)?1:0;
    if(aCheck!==bCheck)return bCheck-aCheck;
    return Number(a.payout_variance??0)-Number(b.payout_variance??0);
  }),[channels]);
  const channelShare=useMemo(()=>channels.map((channel,index)=>({id:channel.platform,label:channel.label||channel.platform,value:channel.actual_payout??channel.expected_payout,tone:['blue','lavender','amber','mint','pink'][index%5]})).filter(item=>item.value!=null&&Number(item.value)>=0),[channels]);
  const nextSchedule=schedules.find(item=>item.date)||null;

  return <HarinPageFrame kind="operations" className="settlementOpsCenter settlementOpsV8">
    <HarinPageHeader className="settlementOpsHero" eyebrow="정산·비용 업무" title="정산·비용 대조센터" description="예상 금액과 실제 지급액을 채널별로 맞춰보고, 차이가 난 곳부터 확인할 수 있어요." icon="settlement" tone="blue" note="확인되지 않은 금액은 0원으로 계산하지 않고 확인 필요로 유지" metrics={[["확정 지급액",wonOrCheck(summary.actual_payout)],["예상 정산액",wonOrCheck(summary.estimated_payout)],["확인할 채널",`${count(summary.check_required_channels)}개`,null,summary.check_required_channels?'warning':''],["차감 발생 채널",`${count(negativeVariance.length)}개`,null,negativeVariance.length?'danger':'']]}/>

    <section className="settlementFocusRail" aria-label="오늘의 정산 집중 항목">
      <button type="button" className={summary.check_required_channels?'danger':''} onClick={()=>setWorkspace('COSTS')}><HarinIcon name="alerts" size={22}/><span><small>먼저 확인</small><b>자료·비용 설정 {count(summary.check_required_channels)}개</b></span><em>확인하기</em></button>
      <button type="button" className={negativeVariance.length?'notice':''} onClick={()=>setWorkspace('RECONCILIATION')}><HarinIcon name="settlement" size={22}/><span><small>금액 대조</small><b>예상보다 적음 {count(negativeVariance.length)}개</b></span><em>비교하기</em></button>
      <button type="button" onClick={()=>setWorkspace('SUMMARY')}><HarinIcon name="today" size={22}/><span><small>최근 정산 일정</small><b>{nextSchedule?.date || '일정 확인 필요'}</b></span><em>{nextSchedule?.amount==null?'보기':wonOrCheck(nextSchedule.amount)}</em></button>
    </section>

    <nav className="phase13WorkspaceNav settlement" aria-label="정산 작업공간">
      <button type="button" className={workspace==='SUMMARY'?'active':''} onClick={()=>setWorkspace('SUMMARY')}><span>정산 요약</span><small>돈의 흐름</small><b>30일</b></button>
      <button type="button" className={workspace==='RECONCILIATION'?'active':''} onClick={()=>setWorkspace('RECONCILIATION')}><span>채널 대조</span><small>예상·실제 비교</small><b>{count(channels.length)}</b></button>
      <button type="button" className={workspace==='COSTS'?'active':''} onClick={()=>setWorkspace('COSTS')}><span>비용 설정</span><small>누락값 보완</small><b>{count(costRequired)}</b></button>
    </nav>

    {workspace==='SUMMARY'?<>
      <SettlementDecisionFlow waterfall={center.waterfall} checkRequired={summary.check_required_channels} onCompare={()=>setWorkspace('RECONCILIATION')} onCosts={()=>setWorkspace('COSTS')}/>
      <section className="settlementOpsSchedule"><header><div className="settlementSectionTitle"><i><HarinIcon name="clock" size={21}/></i><span><small>PAYMENT SCHEDULE</small><h2>최근 정산 일정</h2></span></div><small>현재 연결된 확정 정산 자료 기준</small></header>{schedules.length ? <div>{schedules.slice(0,6).map((item,index)=><article key={`${item.platform}-${item.date}-${index}`}><i><HarinIcon name={platformIcon(item.platform)} size={16}/></i><span>{item.platform}</span><b>{item.date}</b><strong>{wonOrCheck(item.amount)}</strong><small>{item.type || item.status || '정산'}</small></article>)}</div> : <HarinEmptyState state="uncollected" title="가져온 정산 일정이 아직 없어요" description="채널 정산 자료가 수집되면 지급 예정일과 확인된 금액을 여기에 표시합니다."/>}</section>
    </>:null}

    {workspace==='RECONCILIATION'?<section className="settlementReconciliationWorkbench"><header><div className="settlementSectionTitle"><i><HarinIcon name="checklist" size={22}/></i><span><small>RECONCILIATION</small><h2>차이가 큰 채널부터 확인해요</h2><p>자료 확인이 필요하거나 실제 지급액이 예상보다 적은 채널을 앞에 배치했습니다.</p></span></div><aside><small>비교 가능한 채널</small><b>{count(center.waterfall?.comparable_channels)}개</b></aside></header>{channelShare.length>1?<HarinDonutChart className="settlementChannelShare" title="채널별 정산액 비중" description="확정 지급액이 있으면 확정값을, 없으면 예상 정산액을 사용합니다." items={channelShare}/>:null}<div className="settlementOpsChannels" aria-label="채널별 정산 상태">{reconciliation.length?reconciliation.map(channel=><ChannelCard channel={channel} key={channel.platform}/>):<HarinEmptyState state="uncollected" title="대조할 채널 정산 자료가 없어요" description="정산 수집이 끝나면 채널별 예상액과 실제 지급액을 분리해 비교합니다."/>}</div></section>:null}

    {workspace==='COSTS'?<>
      <section className="settlementCostGuide"><div className="settlementSectionTitle"><i><HarinIcon name="price" size={22}/></i><span><small>COST SETTINGS</small><h2>비용 누락부터 채워주세요</h2><p>상품 원가와 채널 수수료·배송비는 상품 화면에서 한 번만 관리합니다. 이 화면은 정산 자료와 비용 설정이 맞는지 대조하는 곳이에요.</p></span></div><a href="/products"><HarinIcon name="product" size={17}/>상품·원가 설정 열기</a><ul>{channels.map(channel=><li key={channel.platform}><i><HarinIcon name={platformIcon(channel.platform)} size={16}/></i><b>{channel.label}</b><span>{channel.status==='COST_REQUIRED'?'수수료·결제수수료·배송비 입력 필요':channel.status==='UNAVAILABLE'?'수집 연결 확인 필요':channel.status==='NO_DATA'?'정산 자료 수집 대기':'비용 계산 가능'}</span></li>)}</ul></section>
      <details className="settlementOpsCoupangDetail"><summary><span><b>쿠팡 정산·비용 상세 운영표</b><small>프로모션, 저장, 물류비와 API 수집 범위를 자세히 볼 때만 사용하세요.</small></span><em>상세 열기</em></summary><div>{children}</div></details>
    </>:null}
    {workspace==='SUMMARY'?<HarinPageAiRegion className="operationsAiSlot settlementAiSlot" id="page-ai-analysis" title="정산·비용 AI 분석">{aiPanel}</HarinPageAiRegion>:null}
    <details className="settlementOpsHelp"><summary>도움말 · 정산 화면은 어떤 순서로 보나요?</summary><div><p><b>정산 요약</b>에서 매출 → 환불 → 수수료 → 정산액 흐름을 봅니다. 실제 지급액이 들어온 채널은 예상 금액과 차이를 함께 계산해요.</p><p><b>채널 대조</b>에서 차이가 난 채널을 찾고, <b>비용 설정</b>에서 누락된 수수료·배송비를 보완합니다. 모르는 금액은 0원으로 처리하지 않습니다.</p></div></details>
  </HarinPageFrame>;
}
