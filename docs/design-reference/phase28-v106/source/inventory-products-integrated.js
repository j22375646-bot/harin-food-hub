(() => {
  const inventoryItems = {
    'jack-bean': {
      name:'작두콩수세미차 30티백', code:'옵션 923001', thumb:'작', tone:'mint', stock:'28개', sales:'62개', days:'13.5일', status:'warning',
      statusText:'14일 안에 재입고 판단', action:'목표 30일 기준 34개 입고 검토', reason:'최근 판매 속도를 유지한다는 가정으로 계산한 시안 값이에요.'
    },
    'beet-tea': {
      name:'레드비트차 45g', code:'옵션 923002', thumb:'레', tone:'rose', stock:'12개', sales:'54개', days:'6.7일', status:'urgent',
      statusText:'7일 안에 품절 위험', action:'목표 30일 기준 42개 우선 입고 검토', reason:'판매 속도 대비 주문 가능 수량이 낮아요. 입고 가능일 확인이 먼저예요.'
    },
    'barley-tea': {
      name:'보리차 50티백', code:'옵션 923003', thumb:'보', tone:'sky', stock:'96개', sales:'70개', days:'41.1일', status:'healthy',
      statusText:'현재 재고 흐름 안정', action:'이번 주 추가 입고 없이 판매 추이 관찰', reason:'목표 30일을 웃돌아 당장 움직일 필요가 없는 시안 상태예요.'
    },
    'burdock-tea': {
      name:'우엉차 40티백', code:'옵션 923004', thumb:'우', tone:'lilac', stock:'180개', sales:'38개', days:'142일', status:'excess',
      statusText:'장기 보유 재고 점검', action:'추가 입고 보류 후 판매 전환 검토', reason:'최근 판매 속도 기준 보유일이 길어 재입고보다 소진 계획이 먼저예요.'
    }
  };

  const toast = document.getElementById('inventoryToast');
  let toastTimer = null;

  const showToast = message => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 1900);
  };

  const selectInventoryItem = id => {
    const item = inventoryItems[id];
    if (!item) return;
    document.querySelectorAll('[data-inventory-row]').forEach(row => {
      const selected = row.dataset.inventoryRow === id;
      row.classList.toggle('selected', selected);
      row.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('[data-inventory-horizon-target]').forEach(target => {
      const selected = target.dataset.inventoryHorizonTarget === id;
      target.classList.toggle('active', selected);
      target.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-inventory-glance-target]').forEach(target => {
      const selected = target.dataset.inventoryGlanceTarget === id;
      target.classList.toggle('active', selected);
      target.setAttribute('aria-pressed', String(selected));
      if (selected) {
        const position = Number(target.dataset.flowPosition);
        const stage = document.getElementById('inventoryGlance');
        if (stage && Number.isFinite(position)) stage.style.setProperty('--flow-active-position', `${position}%`);
      }
    });
    const thumb = document.getElementById('inventorySelectedThumb');
    if (thumb) {
      thumb.textContent = item.thumb;
      thumb.className = `inventory-row-thumb ${item.tone}`;
    }
    const content = {
      inventorySelectedName:item.name,
      inventorySelectedCode:item.code,
      inventorySelectedStock:item.stock,
      inventorySelectedSales:item.sales,
      inventorySelectedDays:item.days,
      inventorySelectedAction:item.action,
      inventorySelectedReason:item.reason
    };
    Object.entries(content).forEach(([elementId,value]) => {
      const element = document.getElementById(elementId);
      if (element) element.textContent = value;
    });
    const status = document.getElementById('inventoryDecisionStatus');
    if (status) {
      status.className = `inventory-decision-status ${item.status}`;
      const copy = status.querySelector('strong');
      if (copy) copy.textContent = item.statusText;
    }
  };

  window.toggleInventoryRail = () => {
    const layout = document.getElementById('inventoryLayout');
    const aside = document.getElementById('inventoryAside');
    if (!layout || !aside) return;
    const collapsed = aside.classList.toggle('collapsed');
    layout.classList.toggle('rail-collapsed', collapsed);
    const control = aside.querySelector('.inventory-rail-control');
    const label = control?.querySelector('span');
    control?.setAttribute('aria-expanded', String(!collapsed));
    if (label) label.textContent = collapsed ? '판단 패널 열기' : '판단 패널 접기';
    const iconPath = control?.querySelector('path');
    if (iconPath) iconPath.setAttribute('d', collapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6');
  };

  document.querySelectorAll('[data-inventory-row]').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('input')) return;
      selectInventoryItem(row.dataset.inventoryRow);
    });
  });
  document.querySelectorAll('[data-inventory-horizon-target]').forEach(target => {
    target.addEventListener('click', () => selectInventoryItem(target.dataset.inventoryHorizonTarget));
  });
  document.querySelectorAll('[data-inventory-glance-target]').forEach(target => {
    target.addEventListener('click', () => selectInventoryItem(target.dataset.inventoryGlanceTarget));
  });

  document.querySelectorAll('[data-inventory-compare-row]').forEach(row => {
    row.addEventListener('click', () => selectInventoryItem(row.dataset.inventoryCompareRow));
  });
  document.querySelectorAll('[data-inventory-visual-mode]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.inventoryVisualMode;
      document.querySelectorAll('[data-inventory-visual-mode]').forEach(control => {
        control.classList.toggle('active', control === button);
        control.setAttribute('aria-pressed', String(control === button));
      });
      const rail = document.getElementById('inventoryHorizonRail');
      const compare = document.getElementById('inventorySalesCompare');
      if (rail) rail.hidden = mode !== 'days';
      if (compare) compare.hidden = mode !== 'sales';
    });
  });

  const search = document.getElementById('inventorySearch');
  let inventoryFilter = 'all';
  const updateOverviewBulk = () => {
    const checked = [...document.querySelectorAll('[data-inventory-check]:checked')];
    const bar = document.getElementById('inventoryOverviewBulkBar');
    if (bar) bar.hidden = checked.length === 0;
    const count = document.getElementById('inventoryOverviewBulkCount');
    if (count) count.textContent = String(checked.length);
    const visibleChecks = [...document.querySelectorAll('[data-inventory-row]:not([hidden]) [data-inventory-check]')];
    const selectVisible = document.getElementById('inventorySelectVisible');
    if (selectVisible) {
      selectVisible.checked = visibleChecks.length > 0 && visibleChecks.every(input => input.checked);
      selectVisible.indeterminate = visibleChecks.some(input => input.checked) && !selectVisible.checked;
    }
  };
  const applyInventoryFilters = () => {
    const query = search.value.trim().toLocaleLowerCase('ko-KR');
    let visible = 0;
    document.querySelectorAll('[data-inventory-row]').forEach(row => {
      const item = inventoryItems[row.dataset.inventoryRow];
      const matchesSearch = !query || row.dataset.inventorySearch.toLocaleLowerCase('ko-KR').includes(query);
      const matchesFilter = inventoryFilter === 'all'
        || (inventoryFilter === 'urgent' && item.status === 'urgent')
        || (inventoryFilter === 'low' && ['urgent','warning'].includes(item.status))
        || (inventoryFilter === 'overstock' && item.status === 'excess')
        || (inventoryFilter === 'data' && item.dataCheck === true);
      const matches = matchesSearch && matchesFilter;
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = document.getElementById('inventoryEmpty');
    if (empty) empty.hidden = visible !== 0;
    const summary = document.getElementById('inventoryFilterSummary');
    if (summary) summary.textContent = `${visible}개 표시`;
    updateOverviewBulk();
  };
  search?.addEventListener('input', applyInventoryFilters);
  document.querySelectorAll('[data-inventory-filter]').forEach(button => {
    button.addEventListener('click', () => {
      inventoryFilter = button.dataset.inventoryFilter;
      document.querySelectorAll('[data-inventory-filter]').forEach(control => {
        control.classList.toggle('active', control === button);
        control.setAttribute('aria-pressed', String(control === button));
      });
      applyInventoryFilters();
    });
  });
  document.querySelectorAll('[data-inventory-check]').forEach(input => input.addEventListener('change', updateOverviewBulk));
  document.getElementById('inventorySelectVisible')?.addEventListener('change', event => {
    document.querySelectorAll('[data-inventory-row]:not([hidden]) [data-inventory-check]').forEach(input => {
      input.checked = event.currentTarget.checked;
    });
    updateOverviewBulk();
  });
  document.getElementById('inventoryOverviewClear')?.addEventListener('click', () => {
    document.querySelectorAll('[data-inventory-check]').forEach(input => input.checked = false);
    updateOverviewBulk();
  });
  document.getElementById('inventoryOverviewToWorksheet')?.addEventListener('click', () => setInventoryWorkspace('worksheet'));

  document.getElementById('inventorySyncButton')?.addEventListener('click', event => {
    const button = event.currentTarget;
    button.textContent = '확인됨 · 08:40';
    showToast('시안의 수집 상태를 확인했어요. 실제 동기화는 실행하지 않았어요.');
  });

  const workspaceTitles = {
    overview:'판매 상품', replenish:'재입고 점검', worksheet:'입고 작업표', lot:'유통기한·LOT', history:'수집 기록'
  };
  const setInventoryWorkspace = workspace => {
    document.querySelectorAll('[data-inventory-workspace]').forEach(button => {
      const selected = button.dataset.inventoryWorkspace === workspace;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('[data-inventory-panel]').forEach(panel => {
      panel.hidden = panel.dataset.inventoryPanel !== workspace;
    });
    const title = document.getElementById('inventoryWorkbenchTitle');
    if (title) title.textContent = workspaceTitles[workspace] || '판매 상품';
    const toolbar = document.querySelector('.inventory-toolbar');
    if (toolbar) toolbar.hidden = workspace !== 'overview';
  };

  document.querySelectorAll('[data-inventory-workspace]').forEach(button => {
    button.addEventListener('click', () => setInventoryWorkspace(button.dataset.inventoryWorkspace));
  });
  document.getElementById('inventoryOpenReplenish')?.addEventListener('click', () => setInventoryWorkspace('replenish'));

  const replenishItems = {
    'beet-tea':{ stock:12,sales:54 },
    'jack-bean':{ stock:28,sales:62 }
  };
  let targetDays = 30;
  const updateReplenish = days => {
    targetDays = days;
    let total = 0;
    document.querySelectorAll('[data-inventory-target-days]').forEach(button => button.classList.toggle('active', Number(button.dataset.inventoryTargetDays) === days));
    Object.entries(replenishItems).forEach(([id,item]) => {
      const quantity = Math.max(0, Math.ceil(item.sales * days / 30 - item.stock));
      total += quantity;
      const value = document.querySelector(`[data-replenish-value="${id}"]`);
      if (value) {
        value.textContent = `${quantity}개`;
        const label = value.previousElementSibling;
        if (label) label.textContent = `목표 ${days}일`;
      }
    });
    const totalElement = document.getElementById('inventoryReplenishTotal');
    if (totalElement) totalElement.textContent = `${total}개`;
  };
  document.querySelectorAll('[data-inventory-target-days]').forEach(button => button.addEventListener('click', () => updateReplenish(Number(button.dataset.inventoryTargetDays))));

  const updateBulkBar = () => {
    const checked = [...document.querySelectorAll('[data-replenish-check]:checked')];
    const bar = document.getElementById('inventoryBulkBar');
    if (bar) bar.hidden = checked.length === 0;
    const count = document.getElementById('inventoryBulkCount');
    if (count) count.textContent = String(checked.length);
  };
  document.querySelectorAll('[data-replenish-check]').forEach(input => input.addEventListener('change', updateBulkBar));
  document.getElementById('inventoryBulkCopy')?.addEventListener('click', () => {
    const count = document.querySelectorAll('[data-replenish-check]:checked').length;
    showToast(`${count}개 상품의 입고 검토안을 복사할 수 있게 준비했어요.`);
  });
  document.getElementById('inventoryBulkCsv')?.addEventListener('click', () => showToast(`목표 ${targetDays}일 기준 CSV 미리보기를 준비했어요.`));

  document.getElementById('inventoryWorksheetCopy')?.addEventListener('click', () => showToast('입고 작업표 2개 행을 복사할 수 있게 준비했어요.'));
  document.getElementById('inventoryWorksheetCsv')?.addEventListener('click', () => showToast('읽기 전용 CSV 저장 미리보기를 준비했어요.'));

  const lotDialog = document.getElementById('inventoryLotDialog');
  const openLotDialog = product => {
    if (!lotDialog) return;
    const select = document.getElementById('inventoryLotProduct');
    if (select && product) select.value = product;
    lotDialog.showModal();
  };
  document.getElementById('inventoryLotAdd')?.addEventListener('click', () => openLotDialog('beet-tea'));
  document.querySelectorAll('[data-lot-prefill]').forEach(button => button.addEventListener('click', () => openLotDialog(button.dataset.lotPrefill)));
  document.querySelectorAll('[data-lot-edit]').forEach(button => button.addEventListener('click', () => {
    document.getElementById('inventoryLotNumber').value = button.dataset.lotEdit;
    const older = button.dataset.lotEdit === 'LOT-240729';
    document.getElementById('inventoryLotReceived').value = older ? '2024-07-29' : '2024-08-14';
    document.getElementById('inventoryLotManufactured').value = older ? '2024-07-08' : '2024-07-22';
    document.getElementById('inventoryLotNotes').value = older ? 'A열 상단 · 기존 기록' : 'B열 하단 · 기존 기록';
    openLotDialog(button.dataset.lotEdit === 'LOT-240814' ? 'barley-tea' : 'jack-bean');
  }));
  document.getElementById('inventoryLotReview')?.addEventListener('click', () => {
    const lotNumber = document.getElementById('inventoryLotNumber')?.value.trim();
    if (!lotNumber || lotNumber === 'LOT-') {
      showToast('LOT 번호를 입력해 주세요.');
      return;
    }
    lotDialog?.close();
    showToast(`${lotNumber} 기록을 시안에만 반영했어요.`);
  });
  document.getElementById('inventorySourceCheck')?.addEventListener('click', () => showToast('고정 IP 작업자 연결은 SETUP_REQUIRED로 표시할 예정이에요.'));
  document.getElementById('inventoryRequestSync')?.addEventListener('click', () => showToast('고정 IP 작업자에게 보낼 수집 요청을 시안으로만 준비했어요.'));
  document.querySelectorAll('[data-inventory-snapshot-row]').forEach(button => button.addEventListener('click', () => showToast(`${button.querySelector('span')?.textContent.trim()}의 마지막 정상값 기록을 열었어요.`)));
  document.querySelectorAll('[data-lot-finish]').forEach(button => button.addEventListener('click', () => {
    if (window.confirm(`${button.dataset.lotFinish} LOT를 소진 완료로 표시할까요?\n이 시안에서는 실제 재고가 바뀌지 않습니다.`)) {
      showToast(`${button.dataset.lotFinish} 소진 처리를 시안에서만 확인했어요.`);
    }
  }));
  document.getElementById('inventoryAiExplain')?.addEventListener('click', () => showToast('AI 호출 없이 규칙 기반 샘플 설명을 열었어요.'));

  selectInventoryItem('jack-bean');
  setInventoryWorkspace('overview');
  updateReplenish(30);
  applyInventoryFilters();

  const productItems = {
    'jack-bean':{
      name:'작두콩수세미차 30티백', sku:'SKU HN-T-001', thumb:'작',tone:'mint',status:'ready',statusText:'판매 판단 가능',
      cafeId:'상품 118 · 옵션 221',cafeState:'연결됨',naverId:'상품 992831',naverState:'연결됨',coupangId:'옵션 923001',coupangState:'연결됨',
      action:'원가 유효일을 갱신하면 판매 판단이 더 선명해져요.',next:'costs'
    },
    'beet-tea':{
      name:'레드비트차 45g',sku:'SKU HN-T-002',thumb:'레',tone:'rose',status:'attention',statusText:'네이버 연결 필요',
      cafeId:'상품 124 · 옵션 229',cafeState:'연결됨',naverId:'연결 정보 없음',naverState:'연결 필요',coupangId:'옵션 923002',coupangState:'연결됨',
      action:'네이버 상품을 연결한 뒤 채널별 판매 판단을 이어가세요.',next:'mappings'
    },
    'burdock-tea':{
      name:'우엉차 40티백',sku:'SKU HN-T-003',thumb:'우',tone:'lilac',status:'attention',statusText:'원가 확인 필요',
      cafeId:'상품 131 · 옵션 238',cafeState:'연결됨',naverId:'상품 992844',naverState:'연결됨',coupangId:'옵션 923004',coupangState:'연결됨',
      action:'포장 부자재 근거를 연결하기 전에는 수익 판단을 보류해요.',next:'costs'
    }
  };
  const productsToast = document.getElementById('productsToast');
  let productsToastTimer = null;
  let selectedProductId = 'jack-bean';
  const showProductsToast = message => {
    if (!productsToast) return;
    productsToast.textContent = message;
    productsToast.classList.add('visible');
    clearTimeout(productsToastTimer);
    productsToastTimer = setTimeout(() => productsToast.classList.remove('visible'),1900);
  };

  const setProductsWorkspace = workspace => {
    const titles = {catalog:'기준 상품',mappings:'채널 연결',costs:'원가',profit:'수익 판단',offers:'판매 제안',ads:'광고 대상'};
    document.querySelectorAll('[data-products-workspace]').forEach(button => {
      const selected = button.dataset.productsWorkspace === workspace;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-selected',String(selected));
    });
    document.querySelectorAll('[data-products-panel]').forEach(panel => panel.hidden = panel.dataset.productsPanel !== workspace);
    const title = document.getElementById('productsWorkbenchTitle');
    if (title) title.textContent = titles[workspace] || '기준 상품';
    const searchBox = document.querySelector('.products-search');
    if (searchBox) searchBox.hidden = workspace !== 'catalog';
  };

  const setChannelState = (id,value) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = value;
    element.classList.toggle('needs',value !== '연결됨');
    element.classList.toggle('connected',value === '연결됨');
  };
  const selectProduct = id => {
    const item = productItems[id];
    if (!item) return;
    selectedProductId = id;
    document.querySelectorAll('[data-product-row]').forEach(row => {
      const selected = row.dataset.productRow === id;
      row.classList.toggle('selected',selected);
      row.setAttribute('aria-selected',String(selected));
    });
    const thumb = document.getElementById('productsSelectedThumb');
    if (thumb) { thumb.textContent=item.thumb;thumb.className=`inventory-row-thumb ${item.tone}`; }
    const copies = {productsSelectedName:item.name,productsSelectedSku:item.sku,productsCafeId:item.cafeId,productsNaverId:item.naverId,productsCoupangId:item.coupangId,productsSelectedAction:item.action};
    Object.entries(copies).forEach(([id,value]) => { const element=document.getElementById(id);if(element)element.textContent=value; });
    setChannelState('productsCafeState',item.cafeState);
    setChannelState('productsNaverState',item.naverState);
    setChannelState('productsCoupangState',item.coupangState);
    const status = document.getElementById('productsSelectedStatus');
    if (status) {
      status.className=`products-selected-status ${item.status}`;
      const text=status.querySelector('strong');if(text)text.textContent=item.statusText;
    }
  };

  window.toggleProductsRail = () => {
    const layout=document.getElementById('productsLayout');
    const aside=document.getElementById('productsAside');
    if(!layout||!aside)return;
    const collapsed=aside.classList.toggle('collapsed');
    layout.classList.toggle('rail-collapsed',collapsed);
    const control=aside.querySelector('.products-rail-control');
    control?.setAttribute('aria-expanded',String(!collapsed));
    const label=control?.querySelector('span');if(label)label.textContent=collapsed?'상품 패널 열기':'상품 패널 접기';
    const iconPath=control?.querySelector('path');if(iconPath)iconPath.setAttribute('d',collapsed?'m9 18 6-6-6-6':'m15 18-6-6 6-6');
  };

  document.querySelectorAll('[data-product-row]').forEach(row => row.addEventListener('click',()=>selectProduct(row.dataset.productRow)));
  document.querySelectorAll('[data-products-workspace]').forEach(button => button.addEventListener('click',()=>setProductsWorkspace(button.dataset.productsWorkspace)));
  document.querySelectorAll('[data-products-jump]').forEach(button => button.addEventListener('click',()=>setProductsWorkspace(button.dataset.productsJump)));
  const productsSearch = document.getElementById('productsSearch');
  let productFilter = 'all';
  const applyProductFilters = () => {
    const query=productsSearch?.value.trim().toLocaleLowerCase('ko-KR') || '';
    let visible=0;
    document.querySelectorAll('[data-product-row]').forEach(row=>{
      const matchesSearch=!query||row.dataset.productSearch.toLocaleLowerCase('ko-KR').includes(query);
      const states=(row.dataset.productFilters||'').split(' ');
      const matchesFilter=productFilter==='all'||states.includes(productFilter);
      const matches=matchesSearch&&matchesFilter;
      row.hidden=!matches;if(matches)visible+=1;
    });
    const empty=document.getElementById('productsEmpty');if(empty)empty.hidden=visible!==0;
    const summary=document.getElementById('productsFilterSummary');if(summary)summary.textContent=`${visible}개 표시`;
  };
  productsSearch?.addEventListener('input',applyProductFilters);
  document.querySelectorAll('[data-product-filter]').forEach(button=>button.addEventListener('click',()=>{
    productFilter=button.dataset.productFilter;
    document.querySelectorAll('[data-product-filter]').forEach(control=>{
      control.classList.toggle('active',control===button);
      control.setAttribute('aria-pressed',String(control===button));
    });
    applyProductFilters();
  }));
  document.getElementById('productsCatalogRefresh')?.addEventListener('click',()=>showProductsToast('카페24 상태 3건을 시안 샘플로 다시 분류했어요. 실제 조회는 하지 않았어요.'));
  document.getElementById('productsNextAction')?.addEventListener('click',()=>setProductsWorkspace(productItems[selectedProductId]?.next||'catalog'));
  document.getElementById('productsMappingCheck')?.addEventListener('click',()=>showProductsToast('채널 경계를 유지한 채 2건의 연결 누락을 확인했어요.'));

  let mappingPlatform='naver';
  const updateMappingBulk=()=>{
    const checked=[...document.querySelectorAll(`[data-mapping-row="${mappingPlatform}"] [data-mapping-check]:checked`)];
    const bar=document.getElementById('productsMappingBulkBar');if(bar)bar.hidden=checked.length===0;
    const count=document.getElementById('productsMappingBulkCount');if(count)count.textContent=String(checked.length);
  };
  const setMappingPlatform=platform=>{
    mappingPlatform=platform;
    document.querySelectorAll('[data-mapping-platform]').forEach(button=>button.classList.toggle('active',button.dataset.mappingPlatform===platform));
    document.querySelectorAll('[data-mapping-row]').forEach(row=>row.hidden=row.dataset.mappingRow!==platform);
    const copy=document.getElementById('productsMappingBoundaryCopy');if(copy)copy.textContent=`${platform==='naver'?'네이버':'쿠팡'} 후보 안에서만 확인해요.`;
    document.querySelectorAll('[data-mapping-check]').forEach(input=>input.checked=false);
    updateMappingBulk();
  };
  document.querySelectorAll('[data-mapping-platform]').forEach(button=>button.addEventListener('click',()=>setMappingPlatform(button.dataset.mappingPlatform)));
  document.querySelectorAll('[data-mapping-view]').forEach(button=>button.addEventListener('click',()=>{
    const linked=button.dataset.mappingView==='linked';
    document.querySelectorAll('[data-mapping-view]').forEach(control=>control.classList.toggle('active',control===button));
    const candidates=document.getElementById('productsMappingCandidates');if(candidates)candidates.hidden=linked;
    const linkedList=document.getElementById('productsMappingLinked');if(linkedList)linkedList.hidden=!linked;
    const bulk=document.getElementById('productsMappingBulkBar');if(bulk)bulk.hidden=true;
  }));
  document.querySelectorAll('[data-mapping-check]').forEach(input=>input.addEventListener('change',updateMappingBulk));
  document.getElementById('productsMappingClear')?.addEventListener('click',()=>{document.querySelectorAll('[data-mapping-check]').forEach(input=>input.checked=false);updateMappingBulk();});
  const mappingPreview=document.getElementById('productsMappingPreview');
  document.getElementById('productsMappingPreviewButton')?.addEventListener('click',()=>mappingPreview?.showModal());
  document.getElementById('productsMappingMockConfirm')?.addEventListener('click',()=>{mappingPreview?.close();showProductsToast(`${mappingPlatform==='naver'?'네이버':'쿠팡'} 연결 내용을 시안에서만 확인했어요.`);});
  document.querySelectorAll('[data-mapping-manual]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();showProductsToast('다른 연결 후보 목록을 시안으로 열었어요.');}));
  document.querySelectorAll('[data-mapping-unlink]').forEach(button=>button.addEventListener('click',()=>showProductsToast('연결 해제는 확인·중복 방지·재조회 절차 뒤에만 실행해요.')));

  document.getElementById('productsCostImport')?.addEventListener('click',()=>{
    const preview=document.getElementById('productsCostImportPreview');if(preview)preview.hidden=false;
    showProductsToast('원가표 3개 행을 시안 미리보기로 읽었어요.');
  });
  document.getElementById('productsCostImportClose')?.addEventListener('click',()=>{const preview=document.getElementById('productsCostImportPreview');if(preview)preview.hidden=true;});
  document.querySelectorAll('[data-cost-field]').forEach(input=>input.addEventListener('input',()=>{const bar=document.getElementById('productsCostSaveBar');if(bar)bar.hidden=false;}));
  document.getElementById('productsCostReview')?.addEventListener('click',()=>showProductsToast('변경 근거와 적용일 확인 화면을 시안으로 열었어요.'));
  document.querySelectorAll('[data-profit-period]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-profit-period]').forEach(control=>control.classList.toggle('active',control===button));
    const copy=document.getElementById('productsProfitPeriodCopy');if(copy)copy.textContent=`최근 ${button.dataset.profitPeriod}일`;
  }));
  document.querySelectorAll('[data-profit-row]').forEach(button=>button.addEventListener('click',()=>showProductsToast('판매가·원가·채널 비용의 근거를 시안으로 열었어요.')));
  document.querySelectorAll('[data-offer-preview]').forEach(button=>button.addEventListener('click',()=>showProductsToast('할인과 손익분기 비교안을 시안으로 열었어요.')));
  document.getElementById('productsAiExplain')?.addEventListener('click',()=>showProductsToast('AI 호출 없이 규칙 기반 샘플 판단을 열었어요.'));

  selectProduct('jack-bean');
  setProductsWorkspace('catalog');
  applyProductFilters();
  setMappingPlatform('naver');
})();
