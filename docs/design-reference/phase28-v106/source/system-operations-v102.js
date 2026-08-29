(() => {
  const root = document.getElementById('systemPage');
  if (!root) return;

  const services = {
    cafe24:{
      title:'Cafe24 Admin API',meta:'판매채널 API · OAuth 토큰 저장소',tone:'ready',state:'읽기 연결 준비',
      axes:{configuration:'CONFIGURED',read:'READ_READY',freshness:'LIVE',write:'OWNER_APPROVAL_REQUIRED',job:'IDLE'},
      facts:[['자격증명 위치','OAuth 토큰 저장소'],['마지막 성공','오늘 10:40'],['다음 실행','내일 05:30'],['사용 페이지','주문·CS·재고·정산']],
      datasets:['상품','주문','고객문의','분석','배송 상세'],action:'OAuth 만료 시 재연결한 뒤 읽기 수집부터 다시 확인해요.'
    },
    'naver-ads':{
      title:'네이버 검색광고 API',meta:'광고 운영 API · 서버 환경변수',tone:'ready',state:'광고 자료 읽기 준비',
      axes:{configuration:'CONFIGURED',read:'READ_READY',freshness:'LIVE',write:'OWNER_APPROVAL_REQUIRED',job:'IDLE'},
      facts:[['자격증명 위치','서버 환경변수'],['마지막 성공','오늘 10:39'],['다음 실행','내일 05:30'],['사용 페이지','키워드·인사이트']],
      datasets:['캠페인','광고그룹','키워드','검색어','성과'],action:'입찰 변경은 이 화면에서 실행하지 않고 대표 승인 경로를 유지해요.'
    },
    'naver-commerce':{
      title:'네이버 커머스 API',meta:'판매채널 API · 서울 고정 IP 또는 서버 키',tone:'ready',state:'Worker 읽기 연결',
      axes:{configuration:'WORKER_CONNECTED',read:'READ_READY',freshness:'LIVE',write:'LOCKED',job:'IDLE'},
      facts:[['자격증명 위치','고정 IP Worker'],['마지막 성공','오늘 10:38'],['다음 실행','매시간 주문 증분'],['사용 페이지','주문·CS·정산']],
      datasets:['상품','주문','문의','클레임','정산'],action:'Worker 성공 기록과 Commerce 읽기 권한을 함께 확인해요.'
    },
    coupang:{
      title:'쿠팡 Open API',meta:'판매채널 API · 서울 고정 IP Worker',tone:'attention',state:'생존 신호 확인 필요',
      axes:{configuration:'WORKER_CONNECTED',read:'READ_READY',freshness:'PREVIOUS',write:'LOCKED',job:'RETRY_WAIT'},
      facts:[['자격증명 위치','서울 고정 IP Worker'],['마지막 성공','오늘 10:22'],['활성 작업','대기 2 · 실행 1 · 재시도 1'],['사용 페이지','주문·재고·정산']],
      datasets:['상품','주문','정산','문의·클레임','로켓그로스 재고'],action:'고정 IP 생존 신호를 확인한 뒤 읽기 전용 점검부터 시작해요.'
    },
    epost:{
      title:'우체국 ePost',meta:'배송 API · 발송과 배송조회 자격증명 분리',tone:'attention',state:'독립 읽기 재확인 필요',
      axes:{configuration:'CONFIGURED',read:'UNVERIFIED',freshness:'NO_DATA',write:'LOCKED',job:'IDLE'},
      facts:[['자격증명 위치','서버 환경변수'],['마지막 성공','확인 필요'],['보호 장치','테스트·실서비스 쓰기 잠금'],['사용 페이지','주문·배송']],
      datasets:['발송 신청 결과','운송장','배송조회 결과'],action:'배송조회 읽기를 독립 검증한 뒤 발송 쓰기 잠금은 그대로 유지해요.'
    },
    supabase:{
      title:'Supabase 저장·큐',meta:'운영 인프라 · 서버측 저장소',tone:'ready',state:'저장·큐 처리 준비',
      axes:{configuration:'CONFIGURED',read:'READ_READY',freshness:'LIVE',write:'SERVICE_ROLE_ONLY',job:'WATCHING'},
      facts:[['자격증명 위치','서버 환경변수'],['마지막 성공','방금'],['감시 주기','10분'],['사용 페이지','전체 운영 화면']],
      datasets:['수집 스냅샷','정규화 테이블','작업 큐','알림','실행 이력'],action:'클라이언트에는 서비스 키를 노출하지 않고 서버 경로만 사용해요.'
    }
  };

  window.__systemDetailLoadCount = 0;
  const loaded = new Set();
  const detail = document.getElementById('systemProviderDetail');
  const axisLabels = { configuration:'설정',read:'읽기 검증',freshness:'자료 최신성',write:'쓰기 잠금',job:'작업 상태' };

  const renderDetail = service => {
    const copy = services[service];
    if (!copy || !detail) return;
    detail.dataset.detailState = 'loaded';
    detail.innerHTML = `
      <div class="system-detail-body">
        <div class="system-selected-status ${copy.tone}"><i></i><strong>${copy.state}</strong></div>
        <section class="system-state-axes" id="systemStateAxes" aria-label="독립 상태 축">
          ${Object.entries(copy.axes).map(([key,value])=>`<article data-system-axis="${key}"><span>${axisLabels[key]}</span><strong>${value}</strong></article>`).join('')}
        </section>
        <dl class="system-detail-facts">${copy.facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
        <section class="system-detail-datasets"><span>받는 자료</span><div>${copy.datasets.map(item=>`<b>${item}</b>`).join('')}</div></section>
        <div class="system-detail-action"><span>NEXT SAFE ACTION</span><strong>${copy.action}</strong><button type="button" data-ops-toast="${copy.title} 읽기 전용 점검 순서를 시안으로 확인했어요.">읽기 전용 점검 순서 보기</button></div>
      </div>`;
    detail.querySelector('[data-ops-toast]')?.addEventListener('click',event=>{
      const toast = document.getElementById('operationsToast');
      if (!toast) return;
      toast.textContent=event.currentTarget.dataset.opsToast;
      toast.classList.add('visible');
      setTimeout(()=>toast.classList.remove('visible'),2100);
    });
  };

  const loadService = service => {
    const copy = services[service];
    if (!copy || !detail) return;
    document.getElementById('systemSelectedTitle').textContent=copy.title;
    document.getElementById('systemSelectedMeta').textContent=copy.meta;
    root.querySelectorAll('[data-system-service]').forEach(button=>{
      const selected=button.dataset.systemService===service;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    if (loaded.has(service)) { renderDetail(service);return; }
    window.__systemDetailLoadCount += 1;
    detail.dataset.detailState='loading';
    detail.innerHTML='<div class="system-detail-loading"><div><i></i><span>상태 상세 한 건을 불러오는 중…</span></div></div>';
    setTimeout(()=>{ loaded.add(service);renderDetail(service); },70);
  };

  const activateWorkspace = name => {
    root.querySelectorAll('[data-system-workspace]').forEach(button=>{
      const active=button.dataset.systemWorkspace===name;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    root.querySelectorAll('[data-system-panel]').forEach(panel=>{ panel.hidden=panel.dataset.systemPanel!==name; });
  };

  root.querySelectorAll('[data-system-workspace]').forEach(button=>button.addEventListener('click',()=>activateWorkspace(button.dataset.systemWorkspace)));
  root.querySelectorAll('[data-system-service]').forEach(button=>button.addEventListener('click',()=>loadService(button.dataset.systemService)));
  root.querySelectorAll('[data-system-service-link]').forEach(button=>button.addEventListener('click',()=>{
    activateWorkspace('connections');
    const service=button.dataset.systemServiceLink;
    loadService(service);
    root.querySelector(`[data-system-service="${service}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
  }));

  const stageWorkspace={api:'connections',probe:'connections',job:'jobs',store:'datasets',hub:'recovery'};
  root.querySelectorAll('[data-system-flow-stage]').forEach(button=>button.addEventListener('click',()=>{
    activateWorkspace(stageWorkspace[button.dataset.systemFlowStage]||'connections');
    root.querySelector('.system-workspace-tabs')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
})();
