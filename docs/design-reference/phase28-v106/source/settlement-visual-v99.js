(() => {
  const board = document.getElementById('settlementDecisionBoard');
  if (!board) return;

  const periods = {
    7:{
      label:'최근 7일',gross:8320000,refunds:242100,fees:495400,logistics:212300,expected:7370200,actual:7187100,variance:-183100,
      channels:{
        naver:{ expected:2480000,actual:2416000,variance:-64000 },
        cafe24:{ expected:1690200,actual:1690200,variance:0 },
        coupang:{ expected:3200000,actual:3080900,variance:-119100 },
      },
    },
    30:{
      label:'최근 30일',gross:21200000,refunds:641200,fees:1295540,logistics:842960,expected:18420300,actual:17986240,variance:-434060,
      channels:{
        naver:{ expected:6402800,actual:6281400,variance:-121400 },
        cafe24:{ expected:4166840,actual:4166840,variance:0 },
        coupang:{ expected:7850660,actual:7538000,variance:-312660 },
      },
    },
    90:{
      label:'최근 90일',gross:62418000,refunds:1934200,fees:3756400,logistics:2736800,expected:53990600,actual:53504200,variance:-486400,
      channels:{
        naver:{ expected:19620600,actual:19430200,variance:-190400 },
        cafe24:{ expected:12370000,actual:12370000,variance:0 },
        coupang:{ expected:22000000,actual:21704000,variance:-296000 },
      },
    },
  };

  const channelCopy = {
    naver:{ title:'네이버 주문 수수료',state:'수수료 기준 확인 필요',action:'수수료율 적용일과 프로모션 공제를 확인해요.',row:'naver-fee' },
    cafe24:{ title:'Cafe24 PG 지급',state:'대조 완료',action:'완료 이력을 보관하고 다음 지급일을 기다려요.',row:'cafe-ok' },
    coupang:{ title:'쿠팡 로켓그로스 물류비',state:'비용 상세 SETUP_REQUIRED',action:'비용 조회 권한과 고정 IP Worker를 확인해요.',row:'coupang-logistics' },
  };

  const currency = value => `${value < 0 ? '-' : ''}₩${Math.abs(value).toLocaleString('ko-KR')}`;
  const byId = id => document.getElementById(id);
  let currentPeriod = 30;
  let currentChannel = 'naver';

  const updateText = (id,value) => { const element = byId(id); if (element) element.textContent = value; };

  const selectChannel = channel => {
    if (!channelCopy[channel]) return;
    currentChannel = channel;
    document.querySelectorAll('#settlementPage [data-settlement-channel]').forEach(button => {
      const selected = button.dataset.settlementChannel === channel;
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    document.querySelectorAll('#settlementPage [data-settlement-table-channel]').forEach(button => {
      button.classList.toggle('is-selected',button.dataset.settlementTableChannel === channel);
    });

    const model = periods[currentPeriod];
    const detail = channelCopy[channel];
    const amounts = model.channels[channel];
    updateText('settlementSelectedTitle',detail.title);
    updateText('settlementSelectedMeta',`${model.label} · 예상 ${currency(amounts.expected)} · 실제 ${currency(amounts.actual)} · 차이 ${amounts.variance === 0 ? '없음' : currency(amounts.variance)}`);
    updateText('settlementSelectedState',detail.state);
    updateText('settlementSelectedAction',detail.action);
    const state = document.querySelector('#settlementAside .selected-status');
    state?.classList.toggle('ready',amounts.variance === 0);
    state?.classList.toggle('attention',amounts.variance !== 0);
  };

  const renderWaterfall = model => {
    const max = model.gross;
    const layout = {
      gross:{ bottom:0,height:model.gross,connector:model.gross,value:model.gross },
      refunds:{ bottom:model.gross - model.refunds,height:model.refunds,connector:model.gross - model.refunds,value:-model.refunds },
      fees:{ bottom:model.gross - model.refunds - model.fees,height:model.fees,connector:model.gross - model.refunds - model.fees,value:-model.fees },
      logistics:{ bottom:model.expected,height:model.logistics,connector:model.expected,value:-model.logistics },
      expected:{ bottom:0,height:model.expected,connector:model.expected,value:model.expected },
      actual:{ bottom:0,height:model.actual,connector:model.actual,value:model.actual },
    };

    Object.entries(layout).forEach(([key,item]) => {
      const step = board.querySelector(`[data-settlement-step="${key}"]`);
      if (!step) return;
      const track = step.querySelector('.settlement-waterfall-track');
      const height = Math.max(5,item.height / max * 100);
      const bottom = Math.max(0,item.bottom / max * 100);
      const connector = Math.min(98,Math.max(1,item.connector / max * 100));
      track.style.setProperty('--bar-height',`${height}%`);
      track.style.setProperty('--bar-bottom',`${bottom}%`);
      track.style.setProperty('--connector-bottom',`${connector}%`);
      step.querySelector('[data-settlement-step-value]').textContent = currency(item.value);
    });
  };

  const renderChannels = model => {
    const names = ['naver','cafe24','coupang'];
    const maxVariance = Math.max(...names.map(name => Math.abs(model.channels[name].variance)),1);
    document.querySelectorAll('.settlement-variance-row').forEach(row => {
      const channel = row.dataset.settlementChannel;
      const values = model.channels[channel];
      row.querySelector('[data-variance-amount]').textContent = values.variance === 0 ? '일치' : currency(values.variance);
      row.querySelector('.settlement-variance-track').style.setProperty('--variance-width',`${Math.max(values.variance === 0 ? 0 : 8,Math.abs(values.variance) / maxVariance * 46)}%`);
    });
  };

  const renderPeriod = period => {
    const model = periods[period];
    if (!model) return;
    currentPeriod = Number(period);
    document.querySelectorAll('[data-settlement-period]').forEach(button => {
      const active = Number(button.dataset.settlementPeriod) === currentPeriod;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });

    for (const key of ['gross','refunds','fees','logistics','expected','actual','variance']) board.dataset[key] = String(model[key]);
    updateText('settlementPeriodLabel',`${model.label} · 8월 29일 10:42 기준`);
    updateText('settlementExpectedAmount',currency(model.expected));
    updateText('settlementActualAmount',currency(model.actual));
    updateText('settlementVarianceAmount',currency(model.variance));
    updateText('settlementVarianceTotal',currency(model.variance));
    updateText('settlementDecisionChange',`예상보다 ${Math.abs(model.variance).toLocaleString('ko-KR')}원 적게 지급`);
    renderWaterfall(model);
    renderChannels(model);
    selectChannel(currentChannel);

    board.classList.remove('is-refreshing');
    requestAnimationFrame(() => board.classList.add('is-refreshing'));
    window.setTimeout(() => board.classList.remove('is-refreshing'),430);
  };

  document.querySelectorAll('[data-settlement-period]').forEach(button => button.addEventListener('click',() => renderPeriod(button.dataset.settlementPeriod)));
  document.querySelectorAll('#settlementPage [data-settlement-channel]').forEach(button => button.addEventListener('click',() => selectChannel(button.dataset.settlementChannel)));
  document.querySelectorAll('#settlementPage [data-settlement-table-channel]').forEach(button => button.addEventListener('click',() => selectChannel(button.dataset.settlementTableChannel)));

  renderPeriod(30);
})();
