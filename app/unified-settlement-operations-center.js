'use client';

const statusMeta = {
  ACTUAL:{label:'확정 자료',tone:'actual'},
  ESTIMATED:{label:'예상 자료',tone:'estimated'},
  COST_REQUIRED:{label:'비용 설정 필요',tone:'warning'},
  COLLECTOR_REQUIRED:{label:'수집기 연결 필요',tone:'warning'},
  UNAVAILABLE:{label:'자료 확인 필요',tone:'danger'},
  NO_DATA:{label:'자료 없음',tone:'neutral'}
};

function wonOrCheck(value) {
  return value == null ? '확인 필요' : `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
}

function dateTimeOrCheck(value) {
  if (!value) return '수집 기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '수집 시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit'
  }).format(date);
}

function ChannelCard({ channel }) {
  const meta = statusMeta[channel.status] || statusMeta.UNAVAILABLE;
  const mainValue = channel.actual_payout ?? channel.expected_payout;
  const mainLabel = channel.actual_payout != null ? '실제 지급액' : channel.expected_payout != null ? '예상 정산액' : '정산액';
  return <article className={`settlementOpsChannel ${meta.tone}`}>
    <header>
      <div><span>{channel.platform}</span><h2>{channel.label}</h2></div>
      <em>{meta.label}</em>
    </header>
    <div className="settlementOpsMainValue"><small>{mainLabel}</small><strong>{wonOrCheck(mainValue)}</strong><span>{channel.basis}</span></div>
    <dl>
      <div><dt>결제·매출</dt><dd>{wonOrCheck(channel.gross_sales)}</dd></div>
      <div><dt>취소·환불</dt><dd>{wonOrCheck(channel.refunds)}</dd></div>
      <div><dt>수수료</dt><dd>{wonOrCheck(channel.fees)}</dd></div>
      <div><dt>물류비</dt><dd>{wonOrCheck(channel.logistics)}</dd></div>
    </dl>
    <p>{channel.action}</p>
    <footer><span>{channel.order_count == null ? '주문 건수 확인 필요' : `${Number(channel.order_count).toLocaleString('ko-KR')}건 반영`}</span><span>갱신 {dateTimeOrCheck(channel.last_updated_at)}</span></footer>
  </article>;
}

export default function UnifiedSettlementOperationsCenter({ center = {}, children }) {
  const summary = center.summary || {};
  const channels = center.channels || [];
  const schedules = center.schedules || [];
  return <section className="settlementOpsCenter">
    <section className="settlementOpsHero">
      <div><span>PHASE 11-7 · SETTLEMENT OPERATIONS</span><h1>통합 정산·비용 운영센터</h1><p>실제로 입금될 돈과 아직 계산 중인 예상 금액을 분리해 보여드립니다. 자료가 없으면 0원으로 숨기지 않고 확인할 일을 바로 알려드립니다.</p></div>
      <aside><small>지금 확인할 채널</small><strong>{Number(summary.check_required_channels || 0)}개</strong><em>확정 자료 {Number(summary.actual_channels || 0)}개 · 예상 자료 {Number(summary.estimated_channels || 0)}개</em></aside>
    </section>

    <details className="settlementOpsHelp">
      <summary>도움말 · 정산액과 비용은 어떻게 봐야 하나요?</summary>
      <div>
        <p><b>확정 자료</b>는 플랫폼이 지급 대상으로 확정한 금액입니다. <b>예상 자료</b>는 주문금액에서 등록된 수수료를 뺀 계산값이라 실제 입금액과 다를 수 있습니다.</p>
        <p><b>예시</b> · 결제 10만원, 수수료 8천원이면 예상 정산액은 9만2천원입니다. 택배비와 상품 원가는 아래 운영비로 따로 확인하며, 아직 모르는 값은 0원이 아니라 ‘확인 필요’로 표시합니다.</p>
      </div>
    </details>

    <section className="settlementOpsKpis" aria-label="통합 정산 요약">
      <article><small>확정 지급액</small><strong>{wonOrCheck(summary.actual_payout)}</strong><span>플랫폼 확정 자료만 합산</span></article>
      <article><small>예상 정산액</small><strong>{wonOrCheck(summary.estimated_payout)}</strong><span>비용 설정 기반 계산</span></article>
      <article><small>확인된 수수료</small><strong>{wonOrCheck(summary.known_fees)}</strong><span>확정·예상 자료 합계</span></article>
      <article><small>확인된 물류비</small><strong>{wonOrCheck(summary.known_logistics)}</strong><span>정산액과 별도 운영비</span></article>
      <article className={summary.check_required_channels ? 'warning' : ''}><small>자료 확인 필요</small><strong>{Number(summary.check_required_channels || 0)}개 채널</strong><span>수집 또는 비용 설정 필요</span></article>
    </section>

    <section className="settlementOpsChannels" aria-label="채널별 정산 상태">
      {channels.map(channel=><ChannelCard channel={channel} key={channel.platform}/>)}
    </section>

    <section className="settlementOpsSchedule">
      <header><div><span>PAYMENT SCHEDULE</span><h2>최근 정산 일정</h2></div><small>현재 연결된 확정 정산 자료 기준</small></header>
      {schedules.length ? <div>{schedules.slice(0,6).map((item,index)=><article key={`${item.platform}-${item.date}-${index}`}><span>{item.platform}</span><b>{item.date}</b><strong>{wonOrCheck(item.amount)}</strong><small>{item.type || item.status || '정산'}</small></article>)}</div> : <p>가져온 정산 일정이 없습니다. 채널 정산 자료를 수집하면 지급일과 금액이 여기에 표시됩니다.</p>}
    </section>

    <details className="settlementOpsCoupangDetail">
      <summary><span><b>쿠팡 정산·비용 상세 운영판</b><small>프로모션, 원장, 물류비와 API 수집 범위를 자세히 볼 때만 여세요.</small></span><em>상세 열기</em></summary>
      <div>{children}</div>
    </details>
  </section>;
}
