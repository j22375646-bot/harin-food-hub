(() => {
  const root = document.getElementById('developmentPage');
  if (!root) return;

  const products = {
    'jack-bean': { name:'작두콩 목관리 세트', short:'작', sku:'923001', project:'PD-2026-08-04', version:'V3', stage:'경쟁·전환 설계', readiness:'64%' },
    'red-beet': { name:'레드비트 리뉴얼', short:'레', sku:'923002', project:'PD-2026-07-18', version:'V1', stage:'결과 학습', readiness:'100%' },
    barley: { name:'보리차 데일리팩', short:'보', sku:'923003', project:'PD-2026-08-22', version:'V2', stage:'시장 분석', readiness:'42%' },
  };
  const stageCopy = {
    market:['자료 준비','공식 원문·라벨·OCR 근거를 Evidence ID로 보관해요.','근거 8개'],
    evidence:['시장 분석','검색 수요와 자사 주문을 같은 기간의 독립 근거로 비교해요.','신호 4개'],
    conversion:['구매 전환 체크리스트','상세페이지에서 효능 근거와 2개 묶음 가격을 확인해요.','2건 남음'],
    experiment:['구매 전환 실험','채널별 실행안을 분리하고 대표 승인 뒤 작은 표본에서 비교해요.','설계 중'],
    validation:['결과 학습','7일·14일 관찰 결과와 되돌리기 기준을 다음 버전에 저장해요.','대기'],
  };

  const runner = root.querySelector('#productDevelopmentRunner');
  const select = root.querySelector('#developmentProductSelect');
  const openButton = root.querySelector('#developmentRunOpen');
  const projectPreview = root.querySelector('#developmentProjectPreview');
  const versionPreview = root.querySelector('#developmentVersionPreview');
  const savePreview = root.querySelector('#developmentSavePreview');
  const runnerState = root.querySelector('#developmentRunnerState');
  const empty = root.querySelector('#developmentEmpty');
  const report = root.querySelector('#developmentReport');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeProduct = '';

  window.__developmentProjectCreateCount = 0;
  window.__developmentDetailFetchCount = 0;

  const command = document.querySelector('[data-command-route="development"]');
  if (command) {
    command.dataset.commandKeywords = '상품개발 상품 실험 시장전환';
    const label = command.querySelector('span');
    if (label) label.textContent = '상품개발';
  }

  const setProductCopy = (productKey, { history=false, version }={}) => {
    const product = products[productKey];
    if (!product) return;
    activeProduct = productKey;
    select.value = productKey;
    projectPreview.textContent = product.project;
    versionPreview.textContent = version || product.version;
    savePreview.textContent = history ? '읽기 전용 과거 버전' : '저장 프로젝트';
    root.querySelector('#developmentReportTitle').textContent = `${product.name} · 프로젝트 ${version || product.version}`;
    root.querySelector('#developmentReportMeta').textContent = `${product.project} · 상품별 근거와 실험 이력`;
    root.querySelector('#developmentSelectedProduct').textContent = product.name;
    root.querySelector('.project-thumb').textContent = product.short;
    root.querySelector('.project-context strong').textContent = `기준 상품 ${product.sku} · 프로젝트 데이터만 사용`;
    root.querySelector('.project-context>b').textContent = version || product.version;
    root.querySelector('#developmentDeskTitle').textContent = product.name;
    root.querySelector('#developmentDeskMeta').textContent = `${product.project} · ${version || product.version} · 저장됨`;
  };

  const activateStage = stage => {
    root.querySelectorAll('[data-development-stage]').forEach(button => {
      const active = button.dataset.developmentStage === stage;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    const copy = stageCopy[stage];
    if (!copy) return;
    root.querySelector('#developmentSelectedTitle').textContent = copy[0] === 'A/B 실험' ? '구매 전환 실험' : copy[0];
    root.querySelector('#developmentSelectedSummary').textContent = copy[1];
    root.querySelector('#developmentSelectedState').textContent = copy[2];
  };

  const showReport = ({ history=false, productKey=activeProduct || 'jack-bean', version }={}) => {
    setProductCopy(productKey,{ history,version });
    empty.hidden = true;
    report.hidden = false;
    report.dataset.viewMode = history ? 'history' : 'current';
    root.querySelector('#developmentSnapshotStamp').textContent = history ? `과거 버전 ${version || products[productKey].version} · 읽기 전용` : '현재 프로젝트 · 저장됨';
    activateStage(history ? 'evidence' : 'conversion');
  };

  select.addEventListener('change',() => {
    const product = products[select.value];
    activeProduct = select.value;
    openButton.disabled = !product;
    if (!product) {
      projectPreview.textContent = '상품 선택 후 확인';
      versionPreview.textContent = '—';
      savePreview.textContent = '자동 생성 안 함';
      runnerState.textContent = '선택 대기';
      runner.dataset.state = 'idle';
      return;
    }
    projectPreview.textContent = product.project;
    versionPreview.textContent = product.version;
    savePreview.textContent = '기존 프로젝트 연결';
    runnerState.textContent = `${product.version} · ${product.stage}`;
    runner.dataset.state = 'ready';
  });

  openButton.addEventListener('click',() => {
    if (!products[activeProduct] || runner.dataset.state === 'loading') return;
    window.__developmentProjectCreateCount += 1;
    runner.dataset.state = 'loading';
    runnerState.textContent = '프로젝트 근거 불러오는 중';
    openButton.disabled = true;
    const complete = () => {
      showReport({ productKey:activeProduct });
      runner.dataset.state = 'complete';
      runnerState.textContent = `${products[activeProduct].version} · 개발공간 열림`;
      openButton.disabled = false;
      openButton.querySelector('span').textContent = '개발공간 다시 열기';
      root.querySelectorAll('[data-development-history-id]').forEach(row => row.classList.toggle('active',row.dataset.product === activeProduct && row.dataset.developmentHistoryId.endsWith(products[activeProduct].version.toLowerCase())));
    };
    if (reduceMotion) complete(); else setTimeout(complete,260);
  });

  root.querySelectorAll('[data-development-stage]').forEach(button => button.addEventListener('click',() => activateStage(button.dataset.developmentStage)));

  root.querySelectorAll('[data-development-history-id]').forEach(row => row.addEventListener('click',() => {
    root.querySelectorAll('[data-development-history-id]').forEach(control => control.classList.toggle('active',control === row));
    const versionMatch = row.querySelector('small')?.textContent.match(/V\d+/);
    const version = versionMatch?.[0] || products[row.dataset.product].version;
    showReport({ history:true,productKey:row.dataset.product,version });
    runner.dataset.state = 'complete';
    runnerState.textContent = `${version} · 과거 버전 열림`;
    openButton.disabled = false;
  }));

  root.querySelectorAll('[data-development-lazy]').forEach(panel => {
    const toggle = panel.querySelector('[data-development-lazy-toggle]');
    const detail = panel.querySelector('[data-development-lazy-detail]');
    toggle.addEventListener('click',() => {
      const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded',String(willOpen));
      toggle.querySelector('b').textContent = willOpen ? '접기' : '펼쳐보기';
      if (!willOpen) { detail.hidden = true; return; }
      detail.hidden = false;
      if (detail.dataset.detailState === 'loaded' || detail.dataset.detailState === 'loading') return;
      detail.dataset.detailState = 'loading';
      detail.innerHTML = '<p>보조 근거를 불러오는 중…</p>';
      const load = () => {
        window.__developmentDetailFetchCount += 1;
        detail.dataset.detailState = 'loaded';
        detail.innerHTML = '<div><article><span>조달 규격</span><strong>확인 필요</strong><small>공식 규격서 미연결</small></article><article><span>도매 마진</span><strong>판단 보류</strong><small>계약 단가를 0으로 대체하지 않음</small></article><article><span>다음 안전 행동</span><strong>규격서 원문 연결</strong><small>프로젝트 근거로만 보관</small></article></div>';
      };
      if (reduceMotion) load(); else setTimeout(load,140);
    });
  });

  // Older fixed-UI regression pages expect the previously selected project to be open.
  // V101 itself deliberately starts empty so product selection never creates a project implicitly.
  if (new URLSearchParams(location.search).get('v') !== '101') {
    activeProduct = 'jack-bean';
    setProductCopy(activeProduct);
    showReport({ productKey:activeProduct });
    runner.dataset.state = 'complete';
    runnerState.textContent = 'V3 · 개발공간 열림';
  }
})();
