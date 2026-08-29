(() => {
  const page = document.getElementById('csPage');
  if (!page) return;

  const toast = document.getElementById('csToast');
  const layout = document.getElementById('csLayout');
  const aside = document.getElementById('csAside');
  const inquiryRows = [...document.querySelectorAll('[data-cs-inquiry]')];
  const stageButtons = [...document.querySelectorAll('[data-cs-stage]')];
  const queueButtons = [...document.querySelectorAll('[data-cs-queue-target]')];
  const laneButtons = [...document.querySelectorAll('[data-cs-lane-target]')];
  let toastTimer = null;
  let activeStage = '새 문의';
  let activeFilter = 'all';
  let activeSearch = '';
  let activeSort = 'wait';
  let activeInquiry = inquiryRows.find(row => row.classList.contains('selected')) || inquiryRows[0];

  const inquiryDetails = {
    'naver-product': {
      channel: '네이버 · 상품 문의', customer: '박지안 고객', time: '오늘 10:36 · 6분 전',
      initial: '박', channelClass: 'naver',
      type: '상품 문의', wait: '6분 기다림', focusContext: '주문 전 문의 · 상품 정보와 표시 기준으로 바로 답변 가능',
      nextAction: '상품 정보 기준으로 답변', nextActionMeta: '표현 기준 확인 · 6분 대기', urgencyClass: 'calm',
      message: '작두콩차는 하루에 몇 번 마시면 되나요? 식사 전후 중 언제 마시는 게 좋은지도 궁금해요.',
      product: '작두콩수세미차 30티백', basis: '식품 표시·권장 섭취 안내', draftBasis: '상품 정보 2개 · 표현 주의 1개',
      draft: '안녕하세요, 하린식품입니다. 작두콩차는 식품으로 정해진 섭취 횟수는 없으며, 하루 중 편한 시간에 차처럼 드실 수 있어요. 개인의 식습관과 상태에 맞춰 양을 조절해 주세요.',
      orderNumber: '주문 전 문의', orderStatus: '주문 없음', orderAction: '상품 정보로 답변'
    },
    'coupang-shipping': {
      channel: '쿠팡 · 배송 문의', customer: '윤서진 고객', time: '오늘 10:24 · 18분 전',
      initial: '윤', channelClass: 'coupang',
      type: '배송 문의', wait: '18분 기다림', focusContext: '오전 9시 12분 결제 · 당일출고 대상 · 아직 송장 발급 전',
      nextAction: '송장 상태 확인 후 출고 안내', nextActionMeta: '당일출고 대상 · 18분 대기', urgencyClass: 'urgent',
      message: '오늘 출발하는 주문이 맞을까요? 오후에 외출 예정이라 도착 시각도 확인하고 싶어요.',
      product: '작두콩수세미차 30티백', basis: '결제 시각·당일출고 기준·송장 상태', draftBasis: '주문 정보 3개 · 출고 기준 1개',
      draft: '안녕하세요, 하린식품입니다. 고객님의 주문은 오늘 오전 9시 12분에 결제되어 오후 3시 이전 당일출고 대상입니다. 송장 발급 후 배송조회가 가능하도록 바로 안내드리겠습니다.',
      orderNumber: '쿠팡 21102413666555', orderStatus: '결제완료 · 송장 발급 전', orderAction: '송장 발급 후 안내'
    },
    'cafe24-claim': {
      channel: 'Cafe24 · 교환 요청', customer: '이하린 고객', time: '오늘 10:31 · 11분 전',
      initial: '이', channelClass: 'cafe',
      type: '교환 요청', wait: '11분 기다림', focusContext: '배송완료 · 사진 1장 · 주문 수량과 출고 기록 대조 필요',
      nextAction: '사진·출고 기록 대조', nextActionMeta: '수량 확인 필요 · 11분 대기', urgencyClass: 'watch',
      message: '2개를 주문했는데 상자에는 1개만 들어 있었어요. 사진도 같이 보냅니다. 확인 부탁드려요.',
      product: '레드비트차 45g · 2개', basis: '주문 수량·출고 기록·첨부 사진', draftBasis: '주문 정보 4개 · 사진 1장',
      draft: '안녕하세요, 하린식품입니다. 주문 수량과 실제 수령 수량이 달라 불편을 드렸습니다. 출고 기록을 확인한 뒤 누락된 상품을 다시 보내드릴 수 있도록 바로 안내드리겠습니다.',
      orderNumber: 'Cafe24 HR-C24-B1C7E8AC', orderStatus: '배송완료 · 수량 확인 필요', orderAction: '출고 기록 대조 후 교환 처리'
    }
  };

  function showCsToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 1900);
  }

  const openCsTab = tabName => {
    document.querySelectorAll('[data-cs-tab]').forEach(tab => {
      const active = tab.dataset.csTab === tabName;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-cs-panel]').forEach(panel => {
      const active = panel.dataset.csPanel === tabName;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  };

  const expandCsRail = tabName => {
    aside?.classList.remove('collapsed');
    layout?.classList.remove('rail-collapsed');
    const control = aside?.querySelector('.cs-rail-control');
    const label = control?.querySelector('span');
    if (label) label.textContent = '답변 보조석 접기';
    control?.setAttribute('aria-expanded', 'true');
    openCsTab(tabName);
    requestAnimationFrame(() => {
      aside?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (tabName === 'compose') document.getElementById('csComposeHeading')?.focus({ preventScroll: true });
    });
  };

  window.toggleCsRail = () => {
    if (!layout || !aside) return;
    const collapsed = aside.classList.toggle('collapsed');
    layout.classList.toggle('rail-collapsed', collapsed);
    const control = aside.querySelector('.cs-rail-control');
    const label = control?.querySelector('span');
    if (label) label.textContent = collapsed ? '답변 보조석 펼치기' : '답변 보조석 접기';
    control?.setAttribute('aria-expanded', String(!collapsed));
  };

  const updateQueueSelection = inquiryId => {
    queueButtons.forEach(button => {
      const active = button.dataset.csQueueTarget === inquiryId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-expanded', String(active));
      if (button.getAttribute('role') === 'option') button.setAttribute('aria-selected', String(active));
    });
  };

  const updateLaneSelection = inquiryId => {
    laneButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.csLaneTarget === inquiryId)));
  };

  const updateInquiryDetail = row => {
    if (!row) return;
    activeInquiry = row;
    inquiryRows.forEach(item => item.classList.toggle('selected', item === row));
    updateQueueSelection(row.dataset.id);
    updateLaneSelection(row.dataset.id);
    const detail = inquiryDetails[row.dataset.id];
    if (!detail) return;
    const fields = {
      csSelectedChannel: detail.channel, csSelectedCustomer: detail.customer, csSelectedTime: detail.time,
      csSelectedMessage: detail.message, csSelectedProduct: detail.product, csSelectedBasis: detail.basis,
      csDraftBasis: detail.draftBasis, csDraftText: detail.draft, csOrderNumber: detail.orderNumber,
      csOrderProduct: detail.product, csOrderStatus: detail.orderStatus, csOrderAction: detail.orderAction
    };
    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value !== undefined && element.tagName === 'TEXTAREA' ? element.value = value : element.textContent = value;
    });
    const selectedAvatar = document.getElementById('csSelectedAvatar');
    if (selectedAvatar) {
      selectedAvatar.textContent = detail.initial;
      selectedAvatar.className = `cs-selected-avatar ${detail.channelClass}`;
    }
    const nextAction = document.getElementById('csNextAction');
    const nextActionTitle = document.getElementById('csNextActionTitle');
    const nextActionMeta = document.getElementById('csNextActionMeta');
    if (nextAction) nextAction.className = `cs-next-action ${detail.urgencyClass}`;
    if (nextActionTitle) nextActionTitle.textContent = detail.nextAction;
    if (nextActionMeta) nextActionMeta.textContent = detail.nextActionMeta;
    const activePanel = document.querySelector('[data-cs-panel].active');
    activePanel?.classList.remove('active');
    void activePanel?.offsetWidth;
    activePanel?.classList.add('active');
  };

  const rowMatchesView = row => {
    const matchesStage = (row.dataset.stages || '').split('|').includes(activeStage);
    const matchesFilter = activeFilter === 'all' || row.dataset.priority === 'urgent';
    const detail = inquiryDetails[row.dataset.id];
    const searchText = `${row.textContent || ''} ${detail?.orderNumber || ''} ${detail?.product || ''}`.toLocaleLowerCase('ko-KR');
    const matchesSearch = !activeSearch || searchText.includes(activeSearch);
    return matchesStage && matchesFilter && matchesSearch;
  };

  const sortInquiryRows = () => {
    const list = document.querySelector('.cs-thread-list');
    if (!list) return;
    const sorted = [...inquiryRows].sort((a, b) => {
      const aWait = Number(a.dataset.waitMinutes || 0);
      const bWait = Number(b.dataset.waitMinutes || 0);
      return activeSort === 'wait' ? bWait - aWait : aWait - bWait;
    });
    sorted.forEach(row => list.append(row));
  };

  const refreshInquiryView = () => {
    sortInquiryRows();
    let visible = 0;
    inquiryRows.forEach(row => {
      const matches = rowMatchesView(row);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = document.getElementById('csEmptyState');
    if (empty) empty.hidden = visible !== 0;
    const visibleCount = document.getElementById('csVisibleCount');
    if (visibleCount) visibleCount.textContent = `${visible}건 보임`;
    const naverDraftBadge = document.querySelector('[data-id="naver-product"] .cs-status-badge');
    if (naverDraftBadge) naverDraftBadge.textContent = activeStage === '답변 준비' ? '답변 준비' : '새 문의';
    const firstVisible = inquiryRows.find(row => !row.hidden);
    if (firstVisible && activeInquiry?.hidden) updateInquiryDetail(firstVisible);
    updateCsSelection();
  };

  const updateCsSelection = () => {
    const visibleChecks = inquiryRows.filter(row => !row.hidden).map(row => row.querySelector('.cs-inquiry-check'));
    const selected = visibleChecks.filter(check => check?.checked).length;
    document.querySelectorAll('[data-cs-selected]').forEach(node => node.textContent = String(selected));
    inquiryRows.forEach(row => row.classList.toggle('checked', Boolean(row.querySelector('.cs-inquiry-check')?.checked)));
    const selectAll = document.getElementById('csSelectAll');
    if (selectAll) {
      selectAll.checked = visibleChecks.length > 0 && selected === visibleChecks.length;
      selectAll.indeterminate = selected > 0 && selected < visibleChecks.length;
    }
  };

  const activateCsStage = button => {
    activeStage = button.dataset.csStage;
    stageButtons.forEach(stage => {
      const active = stage === button;
      stage.classList.toggle('active', active);
      stage.setAttribute('aria-selected', String(active));
      stage.tabIndex = active ? 0 : -1;
    });
    document.getElementById('csStageCopy').textContent = button.dataset.copy;
    document.getElementById('csStageAction').textContent = button.dataset.action;
    document.getElementById('csStageHint').textContent = button.dataset.hint;
    const listStage = document.getElementById('csListStage');
    if (listStage) listStage.textContent = activeStage;
    const summary = document.querySelector('.cs-inbox-statusline');
    summary?.classList.remove('is-changing');
    void summary?.offsetWidth;
    summary?.classList.add('is-changing');
    refreshInquiryView();
    showCsToast(`${activeStage} 문의만 모았어요.`);
  };

  stageButtons.forEach(button => {
    button.addEventListener('click', () => activateCsStage(button));
    button.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = stageButtons.indexOf(button);
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % stageButtons.length;
      if (event.key === 'ArrowLeft') next = (current - 1 + stageButtons.length) % stageButtons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = stageButtons.length - 1;
      stageButtons[next].focus();
      activateCsStage(stageButtons[next]);
    });
  });

  inquiryRows.forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('input,button')) return;
      updateInquiryDetail(row);
      openCsTab('message');
    });
    row.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      updateInquiryDetail(row);
      openCsTab('message');
    });
    row.querySelector('.cs-inquiry-check')?.addEventListener('change', () => {
      updateInquiryDetail(row);
      updateCsSelection();
    });
  });

  queueButtons.forEach(button => button.addEventListener('click', () => {
    const target = inquiryRows.find(row => row.dataset.id === button.dataset.csQueueTarget);
    if (!target) return;
    const newStageButton = stageButtons.find(stage => stage.dataset.csStage === '새 문의');
    if (target.hidden && newStageButton) activateCsStage(newStageButton);
    updateInquiryDetail(target);
    openCsTab('message');
    showCsToast('선택한 고객 대화를 열었어요.');
  }));

  laneButtons.forEach(button => button.addEventListener('click', () => {
    const target = inquiryRows.find(row => row.dataset.id === button.dataset.csLaneTarget);
    if (!target) return;
    const newStageButton = stageButtons.find(stage => stage.dataset.csStage === '새 문의');
    if (target.hidden && newStageButton) activateCsStage(newStageButton);
    updateInquiryDetail(target);
    openCsTab('message');
    target.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    showCsToast(`${inquiryDetails[target.dataset.id].customer} 문의를 열었어요.`);
  }));

  const csRailTabs = [...document.querySelectorAll('[data-cs-tab]')];
  csRailTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => openCsTab(tab.dataset.csTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % csRailTabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + csRailTabs.length) % csRailTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = csRailTabs.length - 1;
      csRailTabs[next].focus();
      openCsTab(csRailTabs[next].dataset.csTab);
    });
  });
  document.querySelectorAll('[data-cs-compose]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const row = button.closest('[data-cs-inquiry]');
    if (row) updateInquiryDetail(row);
    expandCsRail('compose');
    showCsToast('선택한 문의의 답변 작업을 열었어요.');
  }));

  document.getElementById('csStageCta')?.addEventListener('click', () => {
    const firstVisible = inquiryRows.find(row => !row.hidden);
    if (firstVisible) updateInquiryDetail(firstVisible);
    expandCsRail(activeStage === '반품·교환' ? 'order' : 'message');
  });

  document.querySelectorAll('[data-cs-filter]').forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.csFilter;
    document.querySelectorAll('[data-cs-filter]').forEach(item => item.classList.toggle('active', item === button));
    refreshInquiryView();
    showCsToast(activeFilter === 'urgent' ? '먼저 답할 문의만 보여드려요.' : '전체 채널 문의를 보여드려요.');
  }));

  document.querySelector('[data-cs-search]')?.addEventListener('input', event => {
    activeSearch = event.currentTarget.value.trim().toLocaleLowerCase('ko-KR');
    refreshInquiryView();
  });

  document.querySelector('[data-cs-sort]')?.addEventListener('change', event => {
    activeSort = event.currentTarget.value;
    refreshInquiryView();
    showCsToast(activeSort === 'wait' ? '오래 기다린 문의부터 정렬했어요.' : '최근 문의부터 정렬했어요.');
  });

  document.getElementById('csSelectAll')?.addEventListener('change', event => {
    inquiryRows.filter(row => !row.hidden).forEach(row => { row.querySelector('.cs-inquiry-check').checked = event.currentTarget.checked; });
    updateCsSelection();
  });

  document.querySelector('[data-cs-copy]')?.addEventListener('click', async () => {
    const text = document.getElementById('csDraftText')?.value || '';
    try { await navigator.clipboard.writeText(text); } catch { /* file preview may not grant clipboard permission */ }
    showCsToast('답변 초안을 복사했어요.');
  });

  document.querySelector('[data-cs-complete]')?.addEventListener('click', () => {
    const badge = activeInquiry?.querySelector('.cs-status-badge');
    if (badge) { badge.className = 'cs-status-badge new'; badge.textContent = '답변 준비'; }
    showCsToast('시안에서 답변 완료 상태를 확인했어요. 실제 전송은 하지 않았어요.');
  });

  document.querySelector('[data-cs-sync]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const label = button.querySelector('span');
    button.disabled = true;
    button.classList.add('is-syncing');
    if (label) label.textContent = '수집 중';
    setTimeout(() => {
      button.disabled = false;
      button.classList.remove('is-syncing');
      if (label) label.textContent = '문의 새로 수집';
      document.getElementById('csLiveCopy').textContent = '문의 3/3 방금 갱신';
      showCsToast('모든 채널의 최신 문의를 반영했어요.');
    }, 720);
  });

  updateInquiryDetail(activeInquiry);
  refreshInquiryView();
})();
