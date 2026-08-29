(() => {
  const root = document.getElementById('keywordWorkbench');
  if (!root) return;

  const data = {
    naver:{
      label:'네이버', mark:'N', mode:'API 직접 운영', modeNote:'선택 키워드만 확인 후 반영·재조회',
      rows:[
        {id:'naver-jakdu',keyword:'작두콩차',scope:'작두콩 쇼핑검색 · 목관리',product:'작두콩수세미차 30티백',current:560,recommended:500,clicks:43,cost:48200,orders:0,revenue:0,roas:0,decision:'lower',status:'감액 후보',reasons:['광고비 48,200원을 사용했지만 주문이 없어요.','현재 입찰가보다 60원 낮춘 초안을 검토할 수 있어요.']},
        {id:'naver-throat',keyword:'목에좋은차',scope:'작두콩 쇼핑검색 · 신규확장',product:'작두콩 목관리 세트',current:420,recommended:480,clicks:36,cost:25200,orders:4,revenue:188000,roas:746,decision:'raise',status:'확대 후보',reasons:['주문 4건과 ROAS 746%가 확인됐어요.','목표 CPA 안에서 60원 증액 초안을 검토할 수 있어요.']},
        {id:'naver-full',keyword:'작두콩수세미차',scope:'브랜드 방어 · 주력상품',product:'작두콩수세미차 30티백',current:520,recommended:520,clicks:51,cost:30600,orders:5,revenue:245000,roas:801,decision:'hold',status:'유지',reasons:['현재 ROAS와 주문 흐름이 안정적이에요.','입찰가는 유지하고 평균순위 변화만 관찰해요.']},
        {id:'naver-burdock',keyword:'우엉차 다이어트',scope:'우엉차 탐색 · 효능',product:'우엉차 50티백',current:350,recommended:null,clicks:12,cost:6800,orders:1,revenue:null,roas:null,decision:'blocked',status:'판단 보류',reasons:['상품 원가와 전환매출 근거를 함께 확인해야 해요.','누락 값은 0으로 계산하지 않고 판단 보류로 남겨요.']},
      ],
      searchTerms:[
        {id:'search-1',keyword:'목에 좋은 따뜻한 차',scope:'실제 검색어 · 미등록',product:'작두콩 목관리 세트',current:null,recommended:null,clicks:18,cost:9200,orders:3,revenue:141000,roas:1532,decision:'raise',status:'신규 검토',reasons:['등록 키워드와 분리된 실제 유입 검색어예요.','주문 근거를 확인한 뒤 신규 등록 여부를 검토해요.']},
        {id:'search-2',keyword:'작두콩차 효능',scope:'실제 검색어 · 정확등록',product:'작두콩수세미차 30티백',current:null,recommended:null,clicks:31,cost:17400,orders:4,revenue:196000,roas:1126,decision:'hold',status:'관찰',reasons:['등록 키워드와 검색 의도가 일치해요.','현재 등록 키워드의 성과와 함께 관찰해요.']},
        {id:'search-3',keyword:'우엉차 살빼기',scope:'실제 검색어 · 제외 검토',product:'우엉차 50티백',current:null,recommended:null,clicks:14,cost:11900,orders:0,revenue:0,roas:0,decision:'lower',status:'제외 검토',reasons:['광고비가 사용됐지만 주문이 없어요.','등록 키워드가 아니라 제외 검색어 후보로 검토해요.']},
      ],
      history:[
        {id:'history-1',keyword:'작두콩차',scope:'변경 기록 · 8월 27일',product:'작두콩 쇼핑검색',current:620,recommended:560,clicks:43,cost:48200,orders:0,revenue:0,roas:0,decision:'hold',status:'재조회 완료',reasons:['620원에서 560원으로 변경한 뒤 현재값을 다시 확인했어요.','성과 검증 기간은 아직 진행 중이에요.']},
        {id:'history-2',keyword:'목에좋은차',scope:'변경 기록 · 8월 24일',product:'작두콩 신규확장',current:380,recommended:420,clicks:36,cost:25200,orders:4,revenue:188000,roas:746,decision:'raise',status:'성과 확인',reasons:['380원에서 420원으로 변경·재조회가 완료됐어요.','변경 후 주문 4건이 확인됐어요.']},
      ]
    },
    coupang:{
      label:'쿠팡', mark:'C', mode:'WING 수동 운영', modeNote:'작업표 확인 후 WING에서 직접 반영',
      rows:[
        {id:'coupang-jakdu',keyword:'작두콩차',scope:'쿠팡 상품광고 · 주력',product:'작두콩수세미차 30티백',current:null,recommended:null,clicks:28,cost:41000,orders:0,revenue:0,roas:0,decision:'lower',status:'WING 감액 검토',reasons:['쿠팡 광고비 41,000원을 사용했지만 주문이 없어요.','현재 입찰가는 WING에서 직접 확인해야 해요.']},
        {id:'coupang-beet',keyword:'레드비트차',scope:'쿠팡 상품광고 · 성장',product:'레드비트차 50티백',current:null,recommended:null,clicks:32,cost:36000,orders:3,revenue:117000,roas:325,decision:'hold',status:'WING 관찰',reasons:['주문 3건이 있지만 수익 근거를 더 확인해야 해요.','허브에서 쿠팡 입찰가를 자동 변경하지 않아요.']},
        {id:'coupang-barley',keyword:'보리차 티백',scope:'쿠팡 상품광고 · 탐색',product:'보리차 40티백',current:null,recommended:null,clicks:17,cost:14500,orders:null,revenue:null,roas:null,decision:'blocked',status:'확인 필요',reasons:['WING 주문·입찰가 자료를 확인해야 해요.','없는 값을 0으로 만들지 않고 작업표에 빈칸으로 남겨요.']},
      ],
      history:[
        {id:'coupang-history',keyword:'작두콩차',scope:'WING 작업 기록 · 8월 26일',product:'작두콩수세미차 30티백',current:null,recommended:null,clicks:28,cost:41000,orders:0,revenue:0,roas:0,decision:'hold',status:'수동 확인',reasons:['WING에서 직접 반영한 기록만 보관해요.','다음 성과 자료로 결과를 확인해야 해요.']},
      ]
    }
  };

  const state = {
    platform:'naver',workspace:'registered',filter:'all',query:'',
    selected:{naver:new Set(),coupang:new Set()},
    active:{naver:'naver-jakdu',coupang:'coupang-jakdu'},
    drafts:{naver:new Map(),coupang:new Map()}
  };
  const minimumBid = 70;
  const maximumBid = 100000;
  const currency = value => value == null ? '확인 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`;
  const count = value => value == null ? '확인 필요' : `${Math.round(value).toLocaleString('ko-KR')}건`;
  const percent = value => value == null ? '판단 보류' : `${Math.round(value).toLocaleString('ko-KR')}%`;
  const baseRows = () => {
    const channel = data[state.platform];
    if (state.workspace === 'search-terms') return channel.searchTerms || [];
    if (state.workspace === 'history') return channel.history || [];
    if (state.workspace === 'diagnosis') return channel.rows.filter(row => row.decision !== 'hold');
    return channel.rows;
  };
  const visibleRows = () => baseRows().filter(row => {
    const matchesFilter = state.filter === 'all' || row.decision === state.filter;
    const haystack = `${row.keyword} ${row.scope} ${row.product}`.toLocaleLowerCase('ko');
    return matchesFilter && (!state.query || haystack.includes(state.query));
  });
  const selectedRow = () => baseRows().find(row => row.id === state.active[state.platform]) || baseRows()[0] || data[state.platform].rows[0];
  const canEditBid = row => state.platform === 'naver' && ['registered','diagnosis'].includes(state.workspace) && Number.isFinite(row?.current);
  const draftValue = row => state.drafts[state.platform].get(row.id) ?? '';
  const normalizeDraft = value => {
    if (value === '' || value == null || !Number.isFinite(Number(value))) return '';
    return Math.min(maximumBid,Math.max(minimumBid,Math.round(Number(value))));
  };
  const selectForDraft = row => {
    state.active[state.platform] = row.id;
    state.selected[state.platform].add(row.id);
    const element = document.querySelector(`.keyword-row[data-row-id="${row.id}"]`);
    if (element) {
      element.classList.add('selected','inspected');
      const checkbox = element.querySelector('input[type="checkbox"]');
      if (checkbox) checkbox.checked = true;
    }
  };

  const metricValue = (key,value) => {
    const element = document.querySelector(`[data-keyword-metric="${key}"] strong`);
    if (element) element.textContent = value;
  };
  const renderFlow = () => {
    const rows = data[state.platform].rows;
    const sum = key => rows.reduce((total,row) => total + (Number.isFinite(row[key]) ? row[key] : 0),0);
    const hasMissing = key => rows.some(row => row[key] == null);
    const costTotal = sum('cost');
    const clickTotal = sum('clicks');
    const orderTotal = sum('orders');
    const revenueTotal = sum('revenue');
    const missingOrders = rows.filter(row => row.orders == null).length;
    const missingRevenue = rows.filter(row => row.revenue == null).length;
    const orderValue = missingOrders ? '확인 필요' : count(orderTotal);
    const revenueValue = missingRevenue ? '판단 보류' : currency(revenueTotal);
    metricValue('cost',currency(costTotal));
    metricValue('clicks',count(clickTotal));
    metricValue('orders',orderValue);
    metricValue('revenue',revenueValue);
    document.getElementById('keywordCostCaption').textContent = '최근 7일 합계';
    document.getElementById('keywordClicksCaption').textContent = clickTotal ? `클릭당 약 ${currency(costTotal / clickTotal)}` : '클릭 자료 확인 필요';
    document.getElementById('keywordOrdersCaption').textContent = missingOrders ? `누락 자료 ${missingOrders}개` : clickTotal ? `클릭 대비 ${(orderTotal / clickTotal * 100).toFixed(1)}%` : '전환율 확인 필요';
    document.getElementById('keywordRevenueCaption').textContent = missingRevenue ? `누락 자료 ${missingRevenue}개` : costTotal ? `광고비 대비 ${Math.round(revenueTotal / costTotal * 100).toLocaleString('ko-KR')}%` : '매출 자료 확인 필요';
    document.getElementById('keywordFlowSummary').textContent = missingOrders
      ? `광고비 ${currency(costTotal)}에서 클릭 ${count(clickTotal)}, 주문 확인 필요 상태예요. 매출도 누락 자료가 있어 판단 보류로 남겼어요.`
      : `광고비 ${currency(costTotal)}에서 클릭 ${count(clickTotal)}, 주문 ${count(orderTotal)}이 확인됐어요.${missingRevenue ? ' 매출은 누락 자료가 있어 판단을 보류했어요.' : ` 확인된 매출은 ${currency(revenueTotal)}이에요.`}`;
    const noOrder = rows.reduce((total,row) => total + (row.orders === 0 ? row.cost : 0),0);
    document.getElementById('keywordWasteAmount').textContent = currency(noOrder);
    document.getElementById('keywordWasteShare').textContent = `${costTotal ? Math.round(noOrder / costTotal * 100) : 0}%`;
    const decisions = ['lower','raise','hold','blocked'];
    decisions.forEach(decision => {
      const decisionCount = rows.filter(row => row.decision === decision).length;
      const element = document.querySelector(`[data-keyword-decision-count="${decision}"]`);
      if (element) element.textContent = decisionCount.toLocaleString('ko-KR');
    });
    document.getElementById('keywordDecisionTotal').textContent = `${rows.length.toLocaleString('ko-KR')}개`;
  };
  const renderChannels = () => {
    const channel = data[state.platform];
    root.dataset.keywordPlatform = state.platform;
    document.querySelectorAll('button[data-keyword-platform]').forEach(button => {
      const active = button.dataset.keywordPlatform === state.platform;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    document.getElementById('keywordChannelMode').innerHTML = `<span class="channel-logo keyword-channel-logo channel-brand-logo" data-brand="${state.platform}" data-logo-size="standard" aria-label="${channel.label}" role="img">${channel.mark}</span><div><span>${channel.label} 운영 방식</span><strong>${channel.mode}</strong><small>${channel.modeNote}</small></div>`;
    document.getElementById('keywordFlowMode').textContent = state.platform === 'naver' ? '네이버 · API 직접 운영' : '쿠팡 · WING 수동 운영';
    document.getElementById('keywordWorkbenchTitle').textContent = state.platform === 'naver' ? '네이버 키워드 운영표' : '쿠팡 WING 작업표';
    document.getElementById('keywordWorkbenchFreshness').textContent = state.platform === 'naver' ? '네이버 검색광고 · 오전 10:39' : '쿠팡 WING 표본 · 확인 필요';
    document.querySelectorAll('[data-keyword-workspace]').forEach(button => {
      const supported = state.platform === 'naver' || ['registered','diagnosis','history'].includes(button.dataset.keywordWorkspace);
      button.hidden = !supported;
      const active = supported && button.dataset.keywordWorkspace === state.workspace;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    document.getElementById('keywordScopeNote').textContent = state.platform === 'naver' ? '현재 입찰가 10:39 확인' : '입찰가는 WING 확인 필요';
  };
  const renderDetail = row => {
    if (!row) return;
    state.active[state.platform] = row.id;
    const channel = data[state.platform];
    const selectedMark = document.getElementById('keywordSelectedMark');
    selectedMark.textContent = channel.mark;
    selectedMark.dataset.brand = state.platform;
    selectedMark.dataset.logoSize = 'compact';
    selectedMark.setAttribute('aria-label',channel.label);
    selectedMark.setAttribute('role','img');
    selectedMark.classList.add('channel-brand-logo');
    document.getElementById('keywordSelectedPlatform').textContent = `${channel.label} · ${state.workspace === 'search-terms' ? '실제 검색어' : state.workspace === 'history' ? '변경 기록' : '광고 키워드'}`;
    document.getElementById('keywordSelectedTitle').textContent = row.keyword;
    document.getElementById('keywordSelectedMeta').textContent = `${row.scope} · ${row.product}`;
    document.getElementById('keywordSelectedStatus').className = `selected-status ${row.decision === 'raise' || row.decision === 'hold' ? 'ready' : 'attention'}`;
    document.getElementById('keywordSelectedStatusText').textContent = row.status;
    document.getElementById('keywordCurrentBid').textContent = state.platform === 'naver' ? currency(row.current) : 'WING 확인';
    document.getElementById('keywordRecommendedBid').textContent = state.platform === 'naver' ? currency(row.recommended) : '수동 입력';
    const editor = document.getElementById('keywordDraftEditor');
    const draftInput = document.getElementById('keywordDraftBid');
    const recommendationButton = document.getElementById('keywordUseRecommended');
    const editable = canEditBid(row);
    editor.hidden = !editable;
    draftInput.disabled = !editable;
    draftInput.value = editable ? draftValue(row) : '';
    draftInput.dataset.rowId = editable ? row.id : '';
    recommendationButton.disabled = !editable || !Number.isFinite(row.recommended);
    document.getElementById('keywordSelectedCost').textContent = currency(row.cost);
    document.getElementById('keywordSelectedOrders').textContent = count(row.orders);
    document.getElementById('keywordSelectedRoas').textContent = percent(row.roas);
    document.getElementById('keywordDetailReasons').replaceChildren(...row.reasons.map(reason => {
      const item = document.createElement('li'); item.textContent = reason; return item;
    }));
    document.getElementById('keywordNextActionText').textContent = state.platform === 'naver'
      ? row.decision === 'blocked' ? '근거를 확인한 뒤 판단을 다시 열어요.' : '변경값은 미리보기에서 한 번 더 확인해요.'
      : 'WING 작업표에 현재가와 적용가를 직접 입력해요.';
    document.getElementById('keywordNextActionButton').textContent = state.platform === 'naver' ? '변경안 미리보기' : 'WING 작업표 미리보기';
    document.querySelectorAll('.keyword-row').forEach(element => element.classList.toggle('inspected',element.dataset.rowId === row.id));
  };
  const renderRows = () => {
    const rows = visibleRows();
    const selected = state.selected[state.platform];
    const container = document.getElementById('keywordRows');
    container.replaceChildren(...rows.map(row => {
      const article = document.createElement('article');
      article.className = `keyword-row${selected.has(row.id) ? ' selected' : ''}${state.active[state.platform] === row.id ? ' inspected' : ''}`;
      article.dataset.rowId = row.id;
      article.dataset.platform = state.platform;
      article.tabIndex = 0;
      article.setAttribute('role','row');
      const checkboxCell = document.createElement('span');
      const checkbox = document.createElement('input'); checkbox.type='checkbox';checkbox.checked=selected.has(row.id);checkbox.setAttribute('aria-label',`${row.keyword} 선택`);
      checkbox.addEventListener('click',event => event.stopPropagation());
      checkbox.addEventListener('change',() => { checkbox.checked ? selected.add(row.id) : selected.delete(row.id); renderRows();renderBulk(); });
      checkboxCell.append(checkbox);
      const name = document.createElement('span');name.className='keyword-name';name.innerHTML=`<i data-row-platform="${state.platform}">${data[state.platform].mark}</i><strong>${row.keyword}</strong><small>${state.platform === 'naver' ? '네이버 검색광고' : '쿠팡 상품광고'}</small>`;
      const scope = document.createElement('span');scope.className='keyword-scope';scope.innerHTML=`<strong>${row.scope}</strong><small>${row.product}</small>`;
      const values = [
        state.platform === 'naver' ? currency(row.current) : 'WING 확인',
        state.platform === 'naver' ? currency(row.recommended) : '수동 판단'
      ].map(value => { const span=document.createElement('span');span.className=`keyword-number${String(value).includes('확인') || String(value).includes('보류') || String(value).includes('WING') ? ' missing' : ''}`;span.textContent=value;return span; });
      const draft = document.createElement('span');draft.className='keyword-bid-draft';
      if (canEditBid(row)) {
        const input = document.createElement('input');
        input.type='number';input.inputMode='numeric';input.step='10';input.min=String(minimumBid);input.max=String(maximumBid);
        input.value=draftValue(row);input.placeholder='직접 입력';input.setAttribute('aria-label',`${row.keyword} 수정 입찰가`);
        input.addEventListener('click',event => event.stopPropagation());
        input.addEventListener('focus',() => { selectForDraft(row);renderDetail(row);renderBulk(); });
        input.addEventListener('input',event => {
          const value=event.currentTarget.value;
          value === '' ? state.drafts[state.platform].delete(row.id) : state.drafts[state.platform].set(row.id,Number(value));
          selectForDraft(row);
          const detailInput=document.getElementById('keywordDraftBid');
          if (detailInput.dataset.rowId === row.id) detailInput.value=value;
          renderBulk();
        });
        input.addEventListener('blur',event => {
          const value=normalizeDraft(event.currentTarget.value);
          value === '' ? state.drafts[state.platform].delete(row.id) : state.drafts[state.platform].set(row.id,value);
          event.currentTarget.value=value;
          const detailInput=document.getElementById('keywordDraftBid');
          if (detailInput.dataset.rowId === row.id) detailInput.value=value;
          renderBulk();
        });
        draft.append(input);
      } else {
        const label=document.createElement('em');label.textContent=state.platform === 'coupang' ? '작업표 입력' : '—';draft.append(label);
      }
      const performanceValues = [count(row.clicks),currency(row.cost),count(row.orders),percent(row.roas)]
        .map(value => { const span=document.createElement('span');span.className=`keyword-number${String(value).includes('확인') || String(value).includes('보류') ? ' missing' : ''}`;span.textContent=value;return span; });
      const status = document.createElement('span');status.className=`keyword-status ${row.decision}`;status.textContent=row.status;
      article.append(checkboxCell,name,scope,...values,draft,...performanceValues,status);
      article.addEventListener('click',() => renderDetail(row));
      article.addEventListener('keydown',event => { if(event.key === 'Enter' || event.key === ' '){event.preventDefault();renderDetail(row);} });
      return article;
    }));
    document.getElementById('keywordEmpty').hidden = rows.length > 0;
    document.getElementById('keywordVisibleCount').textContent = rows.length.toLocaleString('ko-KR');
    renderDetail(selectedRow());
  };
  const renderBulk = () => {
    const selected = state.selected[state.platform];
    const bar = document.getElementById('keywordBulkBar');
    bar.hidden = selected.size === 0;
    document.getElementById('keywordSelectedCount').textContent = selected.size.toLocaleString('ko-KR');
    const draftCount = [...selected].filter(id => Number.isFinite(state.drafts[state.platform].get(id))).length;
    document.getElementById('keywordBulkSummary').textContent = state.platform === 'naver' ? `수정 입찰가 ${draftCount}건 입력 · 실제 반영 전 최신값을 다시 확인해요.` : '네이버 선택과 분리된 쿠팡 전용 작업표예요.';
    document.getElementById('keywordBulkAction').textContent = state.platform === 'naver' ? '변경안 미리보기' : 'WING 작업표 미리보기';
  };
  const render = () => { renderChannels();renderFlow();renderRows();renderBulk(); };

  document.querySelectorAll('button[data-keyword-platform]').forEach(platformButton => {
    platformButton.onclick = () => {
      state.platform = platformButton.dataset.keywordPlatform;
      state.workspace = 'registered';state.filter='all';state.query='';
      document.getElementById('keywordSearch').value='';
      document.querySelectorAll('[data-keyword-filter]').forEach(control => {
        const active = control.dataset.keywordFilter === 'all';
        control.classList.toggle('active',active);control.setAttribute('aria-pressed',String(active));
      });
      render();
    };
  });
  document.querySelectorAll('[data-keyword-workspace]').forEach(workspaceButton => {
    workspaceButton.onclick = () => {
      state.workspace = workspaceButton.dataset.keywordWorkspace;state.filter='all';state.query='';
      document.getElementById('keywordSearch').value='';
      document.querySelectorAll('[data-keyword-filter]').forEach(control => {
        const active = control.dataset.keywordFilter === 'all';
        control.classList.toggle('active',active);control.setAttribute('aria-pressed',String(active));
      });
      render();
    };
  });
  document.querySelectorAll('[data-keyword-filter]').forEach(filterButton => {
    filterButton.onclick = () => {
      state.filter = filterButton.dataset.keywordFilter;
      document.querySelectorAll('[data-keyword-filter]').forEach(control => { const active=control === filterButton;control.classList.toggle('active',active);control.setAttribute('aria-pressed',String(active)); });
      renderRows();
    };
  });
  document.getElementById('keywordSearch').addEventListener('input',event => { state.query=event.currentTarget.value.trim().toLocaleLowerCase('ko');renderRows(); });
  const syncActiveDraft = (raw,{normalize=false}={}) => {
    const row=selectedRow();
    if (!canEditBid(row)) return;
    const value=normalize ? normalizeDraft(raw) : raw;
    value === '' ? state.drafts[state.platform].delete(row.id) : state.drafts[state.platform].set(row.id,Number(value));
    selectForDraft(row);
    const rowInput=document.querySelector(`.keyword-row[data-row-id="${row.id}"] .keyword-bid-draft input`);
    if (rowInput) rowInput.value=value;
    document.getElementById('keywordDraftBid').value=value;
    renderBulk();
  };
  document.getElementById('keywordDraftBid').addEventListener('focus',() => {
    const row=selectedRow();if (!canEditBid(row)) return;selectForDraft(row);renderBulk();
  });
  document.getElementById('keywordDraftBid').addEventListener('input',event => syncActiveDraft(event.currentTarget.value));
  document.getElementById('keywordDraftBid').addEventListener('blur',event => syncActiveDraft(event.currentTarget.value,{normalize:true}));
  document.getElementById('keywordUseRecommended').addEventListener('click',() => {
    const row=selectedRow();if (!canEditBid(row) || !Number.isFinite(row.recommended)) return;syncActiveDraft(row.recommended,{normalize:true});
  });
  const closePreview = () => { document.getElementById('keywordBidPreview').hidden=true; };
  document.getElementById('keywordBidPreviewClose').addEventListener('click',closePreview);
  document.getElementById('keywordBidPreviewDone').addEventListener('click',closePreview);
  const previewAction = () => {
    const selected = state.selected[state.platform];
    const changedRows = data[state.platform].rows.filter(row => selected.has(row.id) && Number.isFinite(state.drafts[state.platform].get(row.id)) && state.drafts[state.platform].get(row.id) !== row.current);
    if (state.platform !== 'naver') {
      document.getElementById('keywordNextActionText').textContent = selected.size ? `${selected.size}건의 WING 수동 작업을 시안으로 확인했어요. 쿠팡에는 자동 반영되지 않아요.` : '먼저 표에서 키워드를 선택해요.';
      return;
    }
    if (!changedRows.length) {
      document.getElementById('keywordNextActionText').textContent = selected.size ? '선택한 키워드의 수정 입찰가를 먼저 입력해요.' : '먼저 표에서 키워드를 선택해요.';
      return;
    }
    const list=document.getElementById('keywordBidPreviewList');
    list.replaceChildren(...changedRows.map(row => {
      const item=document.createElement('article');
      item.innerHTML=`<span><i>N</i><strong>${row.keyword}</strong><small>${row.scope}</small></span><em>${currency(row.current)}</em><b>→</b><strong>${currency(state.drafts.naver.get(row.id))}</strong>`;
      return item;
    }));
    document.getElementById('keywordBidPreviewCount').textContent=String(changedRows.length);
    document.getElementById('keywordBidPreview').hidden=false;
    document.getElementById('keywordBidPreviewClose').focus();
  };
  document.getElementById('keywordBulkAction').addEventListener('click',previewAction);
  document.getElementById('keywordNextActionButton').addEventListener('click',previewAction);
  render();
})();
