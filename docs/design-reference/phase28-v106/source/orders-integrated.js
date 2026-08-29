(() => {
  const app = document.getElementById('app');
  const homePage = document.querySelector('.ceo-main');
  const ordersPage = document.getElementById('ordersPage');
  const csPage = document.getElementById('csPage');
  const inventoryPage = document.getElementById('inventoryPage');
  const productsPage = document.getElementById('productsPage');
  const keywordPage = document.getElementById('keywordPage');
  const legacyPage = document.querySelector('.legacy-main');
  const pageName = document.getElementById('hubPageName');
  const mobilePageName = document.getElementById('hubMobilePageName');
  const toast = document.getElementById('ordersToast');
  let toastTimer = null;

  const showOrderToast = message => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 1900);
  };

  window.setHubPage = (requestedPage, options = {}) => {
    const validPages = ['home', 'orders', 'cs', 'inventory', 'products', 'keywords'];
    const nextPage = validPages.includes(requestedPage) ? requestedPage : 'home';
    const isOrders = nextPage === 'orders';
    const isStockProduct = nextPage === 'inventory' || nextPage === 'products';
    const pageLabels = { home: '오늘', orders: '주문·배송', cs: '고객·CS', inventory: '재고·상품 · 재고', products: '재고·상품 · 상품', keywords:'키워드' };
    app.dataset.hubPage = nextPage;
    homePage.hidden = nextPage !== 'home';
    ordersPage.hidden = !isOrders;
    if (csPage) csPage.hidden = nextPage !== 'cs';
    if (inventoryPage) inventoryPage.hidden = nextPage !== 'inventory';
    if (productsPage) productsPage.hidden = nextPage !== 'products';
    if (keywordPage) keywordPage.hidden = nextPage !== 'keywords';
    if (legacyPage) legacyPage.hidden = true;
    if (pageName) pageName.textContent = pageLabels[nextPage];
    if (mobilePageName) mobilePageName.textContent = pageLabels[nextPage];
    document.title = `하린식품 운영 허브 — ${pageLabels[nextPage]}`;
    document.querySelectorAll('.sidebar [data-hub-page]').forEach(button => {
      const active = button.dataset.hubPage === nextPage || (isStockProduct && button.dataset.hubPage === 'inventory');
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-mobile-page]').forEach(button => {
      const inPrimaryNav = Boolean(button.closest('.mobile-nav'));
      const active = inPrimaryNav
        ? button.dataset.mobilePage === nextPage || (isStockProduct && button.dataset.mobilePage === 'inventory')
        : button.dataset.mobilePage === nextPage;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelector('[data-mobile-more]')?.classList.remove('active');
    document.querySelector('[data-mobile-more]')?.removeAttribute('aria-current');
    document.getElementById('mobileMoreSheet')?.close();
    document.querySelectorAll('[data-stock-product-page]').forEach(button => button.classList.toggle('active', button.dataset.stockProductPage === nextPage));
    const url = new URL(location.href);
    if (nextPage !== 'home') url.searchParams.set('page', nextPage);
    else url.searchParams.delete('page');
    if (!options.skipHistory) history.replaceState({ page: nextPage }, '', url);
    if (!options.keepScroll) scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    dispatchEvent(new CustomEvent('hubpagechange', { detail: { page: nextPage } }));
  };

  window.toggleOrdersRail = () => {
    const layout = document.getElementById('ordersLayout');
    const aside = document.getElementById('ordersAside');
    if (!layout || !aside) return;
    const collapsed = aside.classList.toggle('collapsed');
    layout.classList.toggle('rail-collapsed', collapsed);
    const label = aside.querySelector('.rail-control span');
    if (label) label.textContent = collapsed ? '출고 보조석 펼치기' : '출고 보조석 접기';
    aside.querySelector('.rail-control')?.setAttribute('aria-expanded', String(!collapsed));
  };

  const openOrdersTab = tabName => {
    document.querySelectorAll('[data-orders-tab]').forEach(tab => {
      const active = tab.dataset.ordersTab === tabName;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-orders-panel]').forEach(panel => {
      const active = panel.dataset.ordersPanel === tabName;
      panel.classList.toggle('active', active);
      panel.hidden = false;
      panel.setAttribute('aria-hidden', String(!active));
      panel.toggleAttribute('inert', !active);
    });
  };

  const expandOrdersRail = tabName => {
    const layout = document.getElementById('ordersLayout');
    const aside = document.getElementById('ordersAside');
    if (!layout || !aside) return;
    aside.classList.remove('collapsed');
    layout.classList.remove('rail-collapsed');
    const control = aside.querySelector('.rail-control');
    const label = control?.querySelector('span');
    if (label) label.textContent = '출고 보조석 접기';
    control?.setAttribute('aria-expanded', 'true');
    openOrdersTab(tabName);
    requestAnimationFrame(() => {
      aside.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      document.getElementById('ordersActionsHeading')?.focus({ preventScroll: true });
    });
  };

  const ordersRailTabs = [...document.querySelectorAll('[data-orders-tab]')];
  ordersRailTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => openOrdersTab(tab.dataset.ordersTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % ordersRailTabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + ordersRailTabs.length) % ordersRailTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = ordersRailTabs.length - 1;
      ordersRailTabs[next].focus();
      openOrdersTab(ordersRailTabs[next].dataset.ordersTab);
    });
  });

  const stageWorkflows = {
    '송장 발급 전': {
      tab: 'actions', progress: 0, heading: '송장 발급과 등록',
      description: '발급부터 쇼핑몰 반영까지 한 번에 처리해요.',
      cta: '선택 주문 송장 발급', note: '수취정보를 확인한 주문만 우체국 발급으로 넘겨요.', showIssueSteps: true
    },
    '우체국 발급': {
      tab: 'actions', progress: .25, heading: '우체국 발급 결과',
      description: '발급된 송장번호와 실패 내역을 주문별로 확인해요.',
      cta: '발급 결과 확인', note: '성공한 번호는 보존하고 실패한 주문만 다시 처리해요.'
    },
    '배송대기중': {
      tab: 'actions', progress: .5, heading: '우체국 접수 상태',
      description: '쇼핑몰 등록을 마쳤지만 아직 이동을 시작하지 않은 주문이에요.',
      cta: '접수·집중국 조회', note: '우체국 조회가 접수 전·접수중이면 이 단계에 계속 두어요.'
    },
    '배송중': {
      tab: 'actions', progress: .75, heading: '배송중 예외 확인',
      description: '정상 이동은 접고 지연·미배달 가능성이 있는 주문만 확인해요.',
      cta: '지연 배송 확인', note: '마지막 추적 시각이 오래된 주문부터 살펴보세요.'
    },
    '최근 완료': {
      tab: 'actions', progress: 1, heading: '최근 완료 주문',
      description: '배송을 마친 최근 30일 주문을 필요할 때만 펼쳐봐요.',
      cta: '완료 주문 보기', note: '완료 기록은 현재 출고 작업과 분리해 보관해요.'
    }
  };

  const stageButtons = [...document.querySelectorAll('[data-order-stage]')];
  const stageTrack = document.querySelector('.stage-track');
  let activeStageButton = stageButtons.find(button => button.classList.contains('active')) || stageButtons[0];

  const activateOrderStage = (button, { announce = true } = {}) => {
    const workflow = stageWorkflows[button.dataset.orderStage] || stageWorkflows['송장 발급 전'];
    activeStageButton = button;
    stageButtons.forEach(stage => {
      const active = stage === button;
      stage.classList.toggle('active', active);
      stage.setAttribute('aria-selected', String(active));
      stage.tabIndex = active ? 0 : -1;
    });
    document.getElementById('orderListStage').textContent = button.dataset.orderStage;
    document.getElementById('orderStageCopy').textContent = `${button.dataset.orderStage} ${button.dataset.count}건`;
    document.getElementById('orderStageAction').textContent = button.dataset.stageAction;
    document.getElementById('orderStageHint').textContent = workflow.cta;
    document.getElementById('ordersActionsHeading').textContent = workflow.heading;
    document.getElementById('ordersActionsDescription').textContent = workflow.description;
    document.getElementById('ordersIssueButton').textContent = workflow.cta;
    const actionsPanel = document.getElementById('ordersActionsPanel');
    const stageNote = document.getElementById('ordersStageNote');
    actionsPanel?.classList.toggle('show-issue-steps', Boolean(workflow.showIssueSteps));
    if (stageNote) {
      stageNote.hidden = Boolean(workflow.showIssueSteps);
      stageNote.textContent = workflow.note;
    }
    stageTrack.style.setProperty('--stage-progress', String(workflow.progress));
    button.classList.remove('just-activated');
    void button.offsetWidth;
    button.classList.add('just-activated');
    setTimeout(() => button.classList.remove('just-activated'), 360);
    const summary = document.querySelector('.runway-summary');
    summary.classList.remove('is-changing');
    void summary.offsetWidth;
    summary.classList.add('is-changing');
    if (announce) showOrderToast(`${button.dataset.orderStage} 주문만 모았어요.`);
  };

  stageButtons.forEach(button => {
    button.addEventListener('click', () => activateOrderStage(button));
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const currentIndex = stageButtons.indexOf(button);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % stageButtons.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + stageButtons.length) % stageButtons.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = stageButtons.length - 1;
      stageButtons[nextIndex].focus();
      activateOrderStage(stageButtons[nextIndex]);
    });
  });

  document.getElementById('orderStageCta')?.addEventListener('click', () => {
    const workflow = stageWorkflows[activeStageButton.dataset.orderStage] || stageWorkflows['송장 발급 전'];
    expandOrdersRail(workflow.tab);
    showOrderToast(`${workflow.heading} 작업을 열었어요.`);
  });

  document.getElementById('orderDelayAction')?.addEventListener('click', () => {
    const shippingStage = stageButtons.find(button => button.dataset.orderStage === '배송중');
    if (shippingStage) activateOrderStage(shippingStage, { announce: false });
    expandOrdersRail('actions');
    showOrderToast('배송지연 가능 주문 1건을 확인해요.');
  });

  const updateOrderSelection = () => {
    const checks = [...document.querySelectorAll('.order-check')];
    const selected = checks.filter(check => check.checked).length;
    checks.forEach(check => check.closest('.order-row')?.classList.toggle('selected', check.checked));
    document.querySelectorAll('[data-order-selected]').forEach(node => node.textContent = String(selected));
    const selectAll = document.getElementById('ordersSelectAll');
    if (selectAll) {
      selectAll.checked = selected === checks.length;
      selectAll.indeterminate = selected > 0 && selected < checks.length;
    }
  };

  document.querySelectorAll('.order-check').forEach(check => check.addEventListener('change', updateOrderSelection));
  document.getElementById('ordersSelectAll')?.addEventListener('change', event => {
    document.querySelectorAll('.order-check').forEach(check => { check.checked = event.currentTarget.checked; });
    updateOrderSelection();
  });

  const openDefaultShipmentWorkflow = () => {
    const defaultIssueStage = stageButtons.find(button => button.dataset.orderStage === '송장 발급 전') || stageButtons[0];
    if (defaultIssueStage) activateOrderStage(defaultIssueStage, { announce: false });
    expandOrdersRail('actions');
    showOrderToast('선택 주문의 출고 작업을 열었어요.');
  };

  document.querySelectorAll('[data-order-actions]').forEach(button => button.addEventListener('click', openDefaultShipmentWorkflow));

  document.querySelectorAll('[data-orders-sync]').forEach(button => button.addEventListener('click', () => {
    const label = button.querySelector('[data-sync-label]');
    const original = label ? label.textContent : button.textContent;
    button.disabled = true;
    button.classList.add('is-syncing');
    if (label) label.textContent = '수집 중';
    else button.textContent = '수집 중…';
    setTimeout(() => {
      button.disabled = false;
      button.classList.remove('is-syncing');
      if (label) label.textContent = original;
      else button.textContent = original;
      const liveCopy = document.getElementById('ordersLiveCopy');
      if (liveCopy) liveCopy.textContent = '3/3 방금 갱신';
      document.querySelectorAll('.orders-channel-chip strong').forEach(time => { time.textContent = '방금'; });
      showOrderToast('전체 플랫폼 최신 주문을 반영했어요.');
    }, 720);
  }));

  document.getElementById('ordersIssueButton')?.addEventListener('click', () => showOrderToast('실제 연결 시 확인창 후 송장 발급을 시작해요.'));

  const cutoffClock = document.querySelector('.cutoff-clock');
  const initialCutoffMinutes = Number(cutoffClock?.dataset.cutoffMinutesTotal || 0);
  const cutoffDeadline = Date.now() + initialCutoffMinutes * 60 * 1000;
  const cutoffHours = cutoffClock?.querySelector('[data-cutoff-hours]');
  const cutoffMinutes = cutoffClock?.querySelector('[data-cutoff-minutes]');
  const cutoffMeter = cutoffClock?.querySelector('[data-cutoff-meter]');
  let cutoffTimer = null;

  const renderCutoffCountdown = () => {
    if (!cutoffClock || !cutoffHours || !cutoffMinutes) return;
    const remaining = Math.max(0, Math.ceil((cutoffDeadline - Date.now()) / 60000));
    const hours = Math.floor(remaining / 60);
    const minutes = remaining % 60;
    cutoffHours.textContent = String(hours).padStart(2, '0');
    cutoffMinutes.textContent = String(minutes).padStart(2, '0');
    cutoffClock.setAttribute('aria-label', `당일출고 마감까지 ${hours}시간 ${minutes}분 남음`);
    if (cutoffMeter && initialCutoffMinutes > 0) {
      cutoffMeter.style.width = `${Math.max(0, Math.min(100, (remaining / initialCutoffMinutes) * 100))}%`;
    }
    cutoffClock.classList.toggle('urgent', remaining > 0 && remaining <= 60);
    if (remaining === 0 && cutoffTimer) clearInterval(cutoffTimer);
  };

  renderCutoffCountdown();
  cutoffTimer = setInterval(renderCutoffCountdown, 60000);

  document.getElementById('quickPeekAction')?.addEventListener('click', () => {
    if (document.getElementById('quickPeekType')?.textContent.includes('주문')) {
      closeQuickPeek();
      setHubPage('orders');
    }
  });

  updateOrderSelection();
  const requestedPage = new URLSearchParams(location.search).get('page');
  setHubPage(requestedPage ?? 'home', { skipHistory: true, keepScroll: true });
})();
