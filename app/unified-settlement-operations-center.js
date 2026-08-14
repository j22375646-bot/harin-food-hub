'use client';

import { useState } from 'react';

const statusMeta = {
  ACTUAL:{label:'확정 자료',tone:'actual'}, ESTIMATED:{label:'예상 자료',tone:'estimated'},
  COST_REQUIRED:{label:'비용 설정 필요',tone:'warning'}, COLLECTOR_REQUIRED:{label:'수집기 연결 필요',tone:'warning'},
  UNAVAILABLE:{label:'자료 확인 필요',tone:'danger'}, NO_DATA:{label:'자료 없음',tone:'neutral'}
};

function wonOrCheck(value) {
  return value == null ? '확인 필요' : `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
}

function signedWon(value) {
  if(value==null)return '비교 대기';
  const number=Math.round(Number(value));
  return `${number>0?'+ ':number<0?'- ':''}${Math.abs(number).toLocaleString('ko-KR')}원`;
}

function dateTimeOrCheck(value) {
  if (!value) return '수집 기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '수집 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date);
}

function ChannelCard({ channel }) {
  const meta = statusMeta[channel.status] || statusMeta.UNAVAILABLE;
  const mainValue = channel.actual_payout ?? channel.expected_payout;
  const mainLabel = channel.actual_payout != null ? '실제 지급액' : channel.expected_payout != null ? '예상 정산액' : '정산액';
  return <article className={`settlementOpsChannel ${meta.tone}`}>
    <header><div><span>{channel.platform}</span><h2>{channel.label}</h2></div><em>{meta.label}</em></header>
    <div className="settlementOpsMainValue"><small>{mainLabel}</small><strong>{wonOrCheck(mainValue)}</strong><span>{channel.basis}</span></div>
    <dl>
      <div><dt>결제·매출</dt><dd>{wonOrCheck(channel.gross_sales)}</dd></div><div><dt>취소·환불</dt><dd>{wonOrCheck(channel.refunds)}</dd></div>
      <div><dt>수수료</dt><dd>{wonOrCheck(channel.fees)}</dd></div><div><dt>물류비</dt><dd>{wonOrCheck(channel.logistics)}</dd></div>
    </dl>
    <div className={`settlementVariance ${channel.payout_variance==null?'pending':channel.payout_variance<0?'negative':'positive'}`}><small>예상 대비 실제 차이</small><b>{signedWon(channel.payout_variance)}</b></div>
    <p>{channel.action}</p>
    <footer><span>{channel.order_count == null ? '주문 건수 확인 필요' : `${Number(channel.order_count).toLocaleString('ko-KR')}건 반영`}</span><span>갱신 {dateTimeOrCheck(channel.last_updated_at)}</span></footer>
  </article>;
}

function SettlementWaterfall({ waterfall={} }) {
  const rows=[
    ['결제·매출',waterfall.gross_sales,'plus'],['취소·환불',waterfall.refunds,'minus'],['채널·결제 수수료',waterfall.fees,'minus'],['정산 반영액',waterfall.expected_payout,'result']
  ];
  const max=Math.max(1,...rows.map(([,value])=>Math.abs(Number(value||0))));
  return <section className="settlementWaterfall"><header><div><span>MONEY FLOW</span><h2>매출에서 정산액까지</h2></div><small>최근 30일 · 서버 계산</small></header><div>{rows.map(([label,value,tone])=><article className={tone} key={label}><span>{label}</span><i><em style={{width:value==null?'0%':`${Math.max(6,Math.abs(Number(value))/max*100)}%`}}/></i><b>{wonOrCheck(value)}</b></article>)}</div><footer><span><small>별도 확인 물류비</small><b>{wonOrCheck(waterfall.logistics)}</b></span><span><small>실제 지급 합계</small><b>{wonOrCheck(waterfall.actual_payout)}</b></span><span className={waterfall.variance<0?'negative':''}><small>예상 대비 차이</small><b>{signedWon(waterfall.variance)}</b></span></footer></section>;
}

export default function UnifiedSettlementOperationsCenter({ center = {}, children, aiPanel }) {
  const [workspace,setWorkspace]=useState('SUMMARY');
  const summary = center.summary || {};
  const channels = center.channels || [];
  const schedules = center.schedules || [];
  const costRequired=channels.filter(channel=>['COST_REQUIRED','UNAVAILABLE','NO_DATA'].includes(channel.status)).length;
  return <section className="settlementOpsCenter">
    <section className="settlementOpsHero">
      <div><span>13-5 · SETTLEMENT WORKSPACES</span><h1>정산·비용 운영센터</h1><p>요약, 채널 대조, 비용 설정을 나눠 실제 입금액이 예상과 왜 다른지 빠르게 확인합니다.</p></div>
      <aside><small>지금 확인할 채널</small><strong>{Number(summary.check_required_channels || 0)}개</strong><em>확정 자료 {Number(summary.actual_channels || 0)}개 · 예상 자료 {Number(summary.estimated_channels || 0)}개</em></aside>
    </section>
    <details className="settlementOpsHelp"><summary>도움말 · 정산 화면은 어떤 순서로 보나요?</summary><div><p><b>정산 요약</b>에서 매출 → 환불 → 수수료 → 정산액 흐름을 봅니다. 실제 지급액이 들어온 채널은 예상과 차이도 함께 계산합니다.</p><p><b>채널 대조</b>에서 차이가 난 채널을 찾고, <b>비용 설정</b>에서 수수료·택배비·원가 누락을 보완합니다. 모르는 금액은 0원으로 확정하지 않습니다.</p></div></details>
    <nav className="phase13WorkspaceNav settlement" aria-label="정산 작업공간">
      <button type="button" className={workspace==='SUMMARY'?'active':''} onClick={()=>setWorkspace('SUMMARY')}><span>정산 요약</span><small>돈의 흐름</small><b>30일</b></button>
      <button type="button" className={workspace==='RECONCILIATION'?'active':''} onClick={()=>setWorkspace('RECONCILIATION')}><span>채널 대조</span><small>예상·실제 비교</small><b>{channels.length}</b></button>
      <button type="button" className={workspace==='COSTS'?'active':''} onClick={()=>setWorkspace('COSTS')}><span>비용 설정</span><small>누락값 보완</small><b>{costRequired}</b></button>
    </nav>

    {workspace==='SUMMARY'?<>
      <section className="settlementOpsKpis" aria-label="통합 정산 요약">
        <article><small>확정 지급액</small><strong>{wonOrCheck(summary.actual_payout)}</strong><span>플랫폼 확정 자료만 합산</span></article>
        <article><small>예상 정산액</small><strong>{wonOrCheck(summary.estimated_payout)}</strong><span>비용 설정 기반 계산</span></article>
        <article><small>확인된 수수료</small><strong>{wonOrCheck(summary.known_fees)}</strong><span>확정·예상 자료 합계</span></article>
        <article><small>확인된 물류비</small><strong>{wonOrCheck(summary.known_logistics)}</strong><span>정산액과 별도 운영비</span></article>
        <article className={summary.check_required_channels ? 'warning' : ''}><small>자료 확인 필요</small><strong>{Number(summary.check_required_channels || 0)}개 채널</strong><span>수집 또는 비용 설정 필요</span></article>
      </section>
      {aiPanel}
      <SettlementWaterfall waterfall={center.waterfall}/>
      <section className="settlementOpsSchedule"><header><div><span>PAYMENT SCHEDULE</span><h2>최근 정산 일정</h2></div><small>현재 연결된 확정 정산 자료 기준</small></header>{schedules.length ? <div>{schedules.slice(0,6).map((item,index)=><article key={`${item.platform}-${item.date}-${index}`}><span>{item.platform}</span><b>{item.date}</b><strong>{wonOrCheck(item.amount)}</strong><small>{item.type || item.status || '정산'}</small></article>)}</div> : <p>가져온 정산 일정이 없습니다. 채널 정산 자료를 수집하면 지급일과 금액이 여기에 표시됩니다.</p>}</section>
    </>:null}

    {workspace==='RECONCILIATION'?<section className="settlementOpsChannels" aria-label="채널별 정산 상태">{channels.map(channel=><ChannelCard channel={channel} key={channel.platform}/>)}</section>:null}

    {workspace==='COSTS'?<>
      <section className="settlementCostGuide"><div><span>COST SETTINGS</span><h2>비용 누락부터 채우세요</h2><p>상품 원가와 채널 수수료·택배비는 상품 화면에서 한 번만 관리합니다. 이 화면은 정산 자료와 비용 설정이 맞는지 대조하는 곳입니다.</p></div><a href="/products">상품·원가 설정 열기</a><ul>{channels.map(channel=><li key={channel.platform}><b>{channel.label}</b><span>{channel.status==='COST_REQUIRED'?'수수료·배송비 입력 필요':channel.status==='UNAVAILABLE'?'수집 연결 확인 필요':channel.status==='NO_DATA'?'정산 자료 수집 대기':'비용 계산 가능'}</span></li>)}</ul></section>
      <details className="settlementOpsCoupangDetail"><summary><span><b>쿠팡 정산·비용 상세 운영판</b><small>프로모션, 원장, 물류비와 API 수집 범위를 자세히 볼 때만 여세요.</small></span><em>상세 열기</em></summary><div>{children}</div></details>
    </>:null}
  </section>;
}
