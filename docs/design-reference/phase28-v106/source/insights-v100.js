(() => {
  const root = document.getElementById('analysisPage');
  if (!root) return;

  const channels = {
    naver:{
      name:'네이버',brand:'naver',status:'READY',statusClass:'ready',freshness:'8월 30일 07:32 · 최신',
      summary:'네이버 · 실제 주문과 검색광고 근거',meta:'8월 24–30일 · 자동 생성 07:32',source:'주문·검색광고·원가',success:'오늘 07:32',
      change:'매출 +7.8%',changeNote:'지난주 대비 +₩1.84M',cause:'재구매 고객 +18%',causeNote:'묶음 구매가 상승의 61%',profit:'+₩596,000',profitNote:'실제 공헌이익 기준',action:'2개 묶음 제안 검토',actionNote:'자동 적용하지 않음',
      briefTitle:'네이버에서 달라진 것과 먼저 할 일',briefState:'근거 5/6 · 부분 준비',briefChange:'재구매 매출이 지난주보다 18% 늘었어요.',briefChangeMeta:'주문 84건 · 동일 고객키 기준',briefCause:'2개 묶음 주문이 상승분의 61%를 만들었어요.',briefCauseMeta:'프로모션·가격 변경 없음',briefAction:'묶음 제안을 유지하고 광고 낭비 3개를 먼저 끕니다.',briefActionMeta:'가격·입찰 자동 변경 없음',
      signals:[['재구매 상승은 실제 주문으로 확인됐어요.','지난주 71건 → 이번 주 84건'],['주문 없는 광고비 48,200원을 확인하세요.','키워드 3개 · 허용 CPA 초과'],['상품 유입 근거 한 곳은 아직 비어 있어요.','전환율은 계산하지 않음']],
      next:'2개 묶음 제안을 유지하고 주문 없는 광고비 3건을 확인해요.',
      profitFlow:['₩25.4M','-₩0.8M','-₩4.9M','₩8.2M'],profitBars:['100%','12%','28%','56%'],profitCaveat:'반품 예정 2건은 확정 전이라 공헌이익 계산에서 제외했어요.',
      reports:[
        {id:'NV-2026-W35',week:'8월 24–30일',generated:'8월 30일 07:32',change:'+7.8%',status:'READY',headline:'재구매 상승이 매출 증가를 만들었어요.',cause:'2개 묶음 주문이 상승분의 61%',profit:'+₩596,000',action:'묶음 유지·광고 낭비 3개 확인',source:'네이버 주문·검색광고·원가'},
        {id:'NV-2026-W34',week:'8월 17–23일',generated:'8월 23일 07:31',change:'+2.1%',status:'READY',headline:'브랜드 검색이 완만하게 늘었어요.',cause:'모바일 브랜드 검색 +9%',profit:'+₩188,000',action:'브랜드 키워드 입찰 유지',source:'네이버 주문·검색광고·원가'},
        {id:'NV-2026-W33',week:'8월 10–16일',generated:'8월 16일 07:34',change:'-1.6%',status:'확인 필요',headline:'광고비 증가가 이익 개선으로 이어지지 않았어요.',cause:'주문 없는 키워드 비용 증가',profit:'판단 보류',action:'원가 유효일 확인 후 CPA 재판단',source:'네이버 주문·검색광고·원가'}
      ]
    },
    coupang:{
      name:'쿠팡',brand:'coupang',status:'확인 필요',statusClass:'attention',freshness:'8월 30일 07:36 · 이전 성공값 보존',
      summary:'쿠팡 · Rocket Growth 주문과 비용 근거',meta:'8월 24–30일 · 자동 생성 07:36',source:'주문·정산·광고',success:'8월 29일 22:10',
      change:'매출 -2.4%',changeNote:'지난주 대비 -₩610,000',cause:'광고 전환 지연',causeNote:'비용 상세 최신성 확인 필요',profit:'-₩182,000',profitNote:'확인된 비용까지만 계산',action:'이전 성공값 대조',actionNote:'누락값을 0으로 처리하지 않음',
      briefTitle:'쿠팡에서 멈춘 근거와 안전한 확인 순서',briefState:'근거 4/6 · 확인 필요',briefChange:'주문 매출이 지난주보다 2.4% 줄었어요.',briefChangeMeta:'주문 원본은 최신 · 비용 상세 지연',briefCause:'광고 비용 최신성이 달라 원인을 확정하지 않았어요.',briefCauseMeta:'이전 성공 보고서 보존',briefAction:'고정 IP 수집 시각을 확인한 뒤 비용 대조를 다시 엽니다.',briefActionMeta:'다른 채널 보고서 생성은 정상 유지',
      signals:[['주문 감소는 실제 주문 원본에서 확인됐어요.','지난주 122건 → 이번 주 116건'],['광고비 상세가 주문 기준시각보다 오래됐어요.','마지막 성공 8월 29일 22:10'],['정확한 손실 원인은 아직 판단 보류예요.','비용 누락을 0으로 계산하지 않음']],
      next:'고정 IP 수집 시각을 확인하고 이전 성공 비용과 대조해요.',
      profitFlow:['₩19.8M','-₩1.1M','확인 필요','판단 보류'],profitBars:['100%','18%','9%','32%'],profitCaveat:'광고 비용 상세가 오래되어 최종 공헌이익은 판단 보류로 남겼어요.',
      reports:[
        {id:'CP-2026-W35',week:'8월 24–30일',generated:'8월 30일 07:36',change:'-2.4%',status:'확인 필요',headline:'주문은 감소했고 비용 상세 최신성은 확인이 필요해요.',cause:'광고 비용 기준시각 지연',profit:'-₩182,000',action:'고정 IP 수집·이전 성공값 대조',source:'쿠팡 주문·정산·광고'},
        {id:'CP-2026-W34',week:'8월 17–23일',generated:'8월 23일 07:35',change:'+4.7%',status:'READY',headline:'Rocket Growth 주문이 회복됐어요.',cause:'30티백 상품 주문 +14%',profit:'+₩328,000',action:'가격 유지·반품률 관찰',source:'쿠팡 주문·정산·광고'},
        {id:'CP-2026-W33',week:'8월 10–16일',generated:'8월 16일 07:37',change:'+1.2%',status:'READY',headline:'매출은 늘었지만 물류비도 함께 증가했어요.',cause:'묶음 배송 비중 감소',profit:'+₩74,000',action:'물류비 상세 대조',source:'쿠팡 주문·정산·광고'}
      ]
    },
    cafe24:{
      name:'Cafe24',brand:'cafe24',status:'READY',statusClass:'ready',freshness:'8월 30일 07:34 · 최신',
      summary:'Cafe24 · 자사몰 주문과 PG 근거',meta:'8월 24–30일 · 자동 생성 07:34',source:'주문·회원·PG',success:'오늘 07:34',
      change:'매출 +3.1%',changeNote:'지난주 대비 +₩420,000',cause:'신규 고객 +12%',causeNote:'콘텐츠 유입 주문 9건',profit:'+₩214,000',profitNote:'실제 PG·원가 기준',action:'유입 경로 확인',actionNote:'쿠폰 변경 전 근거 검토',
      briefTitle:'Cafe24 신규 고객 상승과 다음 확인',briefState:'근거 6/6 · READY',briefChange:'신규 고객 주문이 지난주보다 12% 늘었어요.',briefChangeMeta:'신규 주문 42건 · 중복 회원 제외',briefCause:'작두콩 콘텐츠 유입 주문 9건이 상승을 이끌었어요.',briefCauseMeta:'UTM 확인 8건 · 1건 직접 유입',briefAction:'전환된 콘텐츠와 상품 페이지 연결을 유지합니다.',briefActionMeta:'쿠폰 확대는 아직 실행하지 않음',
      signals:[['신규 고객 증가는 회원·주문 근거가 일치해요.','신규 주문 42건 · +12%'],['PG 지급액과 예상액 차이가 없어요.','대조 완료 · 2건'],['직접 유입 1건의 원천은 더 확인할 수 있어요.','판단에 미치는 영향 낮음']],
      next:'전환된 콘텐츠와 상품 페이지 연결을 유지하고 직접 유입 1건만 확인해요.',
      profitFlow:['₩13.9M','-₩0.4M','-₩2.1M','₩4.1M'],profitBars:['100%','9%','22%','48%'],profitCaveat:'직접 유입 주문 1건은 채널 원천을 확인 중이지만 지급·원가 계산에는 포함됐어요.',
      reports:[
        {id:'CF-2026-W35',week:'8월 24–30일',generated:'8월 30일 07:34',change:'+3.1%',status:'READY',headline:'신규 고객 주문과 콘텐츠 유입이 함께 늘었어요.',cause:'콘텐츠 유입 주문 9건',profit:'+₩214,000',action:'전환 콘텐츠 연결 유지',source:'Cafe24 주문·회원·PG'},
        {id:'CF-2026-W34',week:'8월 17–23일',generated:'8월 23일 07:33',change:'+0.8%',status:'READY',headline:'매출과 지급액이 안정적으로 유지됐어요.',cause:'재구매 비중 31% 유지',profit:'+₩86,000',action:'현 상태 유지',source:'Cafe24 주문·회원·PG'},
        {id:'CF-2026-W33',week:'8월 10–16일',generated:'8월 16일 07:33',change:'-3.2%',status:'READY',headline:'신규 유입 감소가 매출 하락으로 이어졌어요.',cause:'콘텐츠 유입 주문 -6건',profit:'-₩132,000',action:'검색 유입 페이지 점검',source:'Cafe24 주문·회원·PG'}
      ]
    }
  };

  let selectedChannel = 'naver';
  const detailCache = new Map();
  window.__insightDetailFetchCount = 0;
  const byId = id => document.getElementById(id);
  const setText = (id,value) => { const element=byId(id); if(element) element.textContent=value; };
  const escapeHTML = value => String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));

  const renderReportDetail = (report, detail) => {
    detail.dataset.detailState = 'loaded';
    detail.innerHTML = `<div class="insight-report-detail-grid" data-insight-detail-flow><article><span>변화</span><strong>${escapeHTML(report.headline)}</strong></article><article><span>원인·이익</span><strong>${escapeHTML(report.cause)} · ${escapeHTML(report.profit)}</strong></article><article><span>다음 행동</span><strong>${escapeHTML(report.action)}</strong></article></div><footer><span data-insight-detail-source>${escapeHTML(report.source)} · 채널 원천 분리</span><b>${escapeHTML(report.id)} · 저장 스냅샷</b></footer>`;
    setText('insightEvidenceLoad',`${window.__insightDetailFetchCount}건 적재 · 화면 캐시`);
  };

  const toggleReport = (report,row,toggle,detail) => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded',String(!open));
    detail.hidden = open;
    if (open || detail.dataset.detailState === 'loaded') return;
    if (detailCache.has(report.id)) {
      renderReportDetail(detailCache.get(report.id),detail);
      return;
    }
    detail.dataset.detailState = 'loading';
    detail.innerHTML = '<div class="insight-detail-loading" role="status" aria-label="저장 인사이트 상세 불러오는 중"><i></i><i></i></div>';
    window.__insightDetailFetchCount += 1;
    const delay = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140;
    setTimeout(() => {
      detailCache.set(report.id,report);
      if (row.isConnected) renderReportDetail(report,detail);
    },delay);
  };

  const renderSavedReports = channel => {
    const list = byId('insightSavedReports');
    if (!list) return;
    list.replaceChildren();
    channel.reports.forEach(report => {
      const row = document.createElement('article');
      row.className = 'insight-report-row';
      row.dataset.insightReportRow = report.id;
      const holdClass = report.status === 'READY' ? '' : ' hold';
      row.innerHTML = `<button class="insight-report-toggle" type="button" data-insight-report-toggle aria-expanded="false"><span><strong>${escapeHTML(report.week)} 주간 인사이트</strong><small>${escapeHTML(report.generated)} 자동 생성 · ${escapeHTML(report.id)}</small></span><b>${escapeHTML(report.change)}</b><em class="${holdClass.trim()}">${escapeHTML(report.status)}</em><i aria-hidden="true">⌄</i></button><div class="insight-report-detail" data-insight-report-detail data-detail-state="idle" hidden></div>`;
      const toggle = row.querySelector('[data-insight-report-toggle]');
      const detail = row.querySelector('[data-insight-report-detail]');
      toggle.addEventListener('click',() => toggleReport(report,row,toggle,detail));
      list.append(row);
    });
  };

  const renderChannel = key => {
    const channel = channels[key];
    if (!channel) return;
    selectedChannel = key;
    root.querySelectorAll('[data-insight-channel]').forEach(button => {
      const active = button.dataset.insightChannel === key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    const values = {
      insightChannelSummary:channel.summary,insightFreshness:channel.freshness,
      insightStageChange:channel.change,insightStageChangeNote:channel.changeNote,insightStageCause:channel.cause,insightStageCauseNote:channel.causeNote,insightStageProfit:channel.profit,insightStageProfitNote:channel.profitNote,insightStageAction:channel.action,insightStageActionNote:channel.actionNote,
      insightBriefTitle:channel.briefTitle,insightBriefState:channel.briefState,insightBriefChange:channel.briefChange,insightBriefChangeMeta:channel.briefChangeMeta,insightBriefCause:channel.briefCause,insightBriefCauseMeta:channel.briefCauseMeta,insightBriefAction:channel.briefAction,insightBriefActionMeta:channel.briefActionMeta,
      insightSignalPrimary:channel.signals[0][0],insightSignalPrimaryMeta:channel.signals[0][1],insightSignalCost:channel.signals[1][0],insightSignalCostMeta:channel.signals[1][1],insightSignalTrust:channel.signals[2][0],insightSignalTrustMeta:channel.signals[2][1],
      analysisSelectedTitle:`${channel.name} 주간 인사이트`,insightSelectedMeta:channel.meta,insightSelectedStatusText:`최신 보고서 · ${channel.status}`,insightEvidenceSource:channel.source,insightEvidenceSuccess:channel.success,insightSelectedAction:channel.next,
      insightProfitPeriod:`${channel.name} · 이번 주`,insightProfitSales:channel.profitFlow[0],insightProfitRefund:channel.profitFlow[1],insightProfitCost:channel.profitFlow[2],insightProfitContribution:channel.profitFlow[3],insightProfitCaveat:channel.profitCaveat
    };
    Object.entries(values).forEach(([id,value]) => setText(id,value));
    const status = byId('insightSelectedStatus');
    status?.classList.toggle('ready',channel.statusClass === 'ready');
    status?.classList.toggle('attention',channel.statusClass !== 'ready');
    root.querySelectorAll('#insightProfitWaterfall i').forEach((bar,index) => bar.style.setProperty('--bar',channel.profitBars[index]));
    setText('insightEvidenceLoad','펼침 전 미요청');
    renderSavedReports(channel);
  };

  const activateWorkspace = target => {
    root.querySelectorAll('[data-insight-workspace]').forEach(button => {
      const active = button.dataset.insightWorkspace === target;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    root.querySelectorAll('[data-insight-panel]').forEach(panel => { panel.hidden = panel.dataset.insightPanel !== target; });
  };

  root.querySelectorAll('[data-insight-channel]').forEach(button => button.addEventListener('click',() => renderChannel(button.dataset.insightChannel)));
  root.querySelectorAll('[data-insight-workspace]').forEach(button => button.addEventListener('click',() => activateWorkspace(button.dataset.insightWorkspace)));
  root.querySelectorAll('[data-insight-signal]').forEach((button,index) => button.addEventListener('click',() => {
    const channel = channels[selectedChannel];
    setText('analysisSelectedTitle',`${channel.name} · ${button.querySelector('strong')?.textContent || '선택 신호'}`);
    setText('insightSelectedAction',index === 0 ? channel.next : index === 1 ? '근거 기준시각을 확인하고 비용 상세를 다시 대조해요.' : '누락 근거가 연결되기 전에는 판단을 보류해요.');
  }));

  const command = document.querySelector('[data-command-route="analysis"]');
  if (command) {
    command.dataset.commandKeywords = '분석 인사이트 주간 채널 보고서';
    const title = command.querySelector('span');
    const description = command.querySelector('strong');
    if (title) title.textContent = '인사이트';
    if (description) description.textContent = '주간 변화·원인·행동';
  }

  activateWorkspace('week');
  renderChannel('naver');
})();
