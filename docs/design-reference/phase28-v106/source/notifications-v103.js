(()=>{
  const navSystem=document.querySelector('[data-hub-page="system"]');
  navSystem?.insertAdjacentHTML('afterend','<button class="nav-sub-route" data-hub-page="notifications" type="button" onclick="setHubPage(\'notifications\')"><span><strong class="nav-title">알림</strong><small class="nav-desc">위험·오류 확인</small></span><em>4</em></button>');

  const mobileRoutes=document.querySelector('.mobile-more-routes');
  mobileRoutes?.insertAdjacentHTML('beforeend','<button type="button" data-mobile-page="notifications" onclick="setHubPage(\'notifications\')"><strong>알림</strong><span>위험·오류 확인과 처리 기록</span></button>');
  const commandResults=document.getElementById('commandResults');
  commandResults?.insertAdjacentHTML('beforeend','<button type="button" data-command-route="notifications" data-command-keywords="알림 위험 오류 숨김 확인 해결"><span>알림</span><strong>위험·오류 확인</strong><kbd>A</kbd></button>');

  const topAlert=[...document.querySelectorAll('.topbar .top-action')].find(button=>button.textContent.includes('운영 확인'));
  if(topAlert){topAlert.setAttribute('onclick',"setHubPage('notifications')");topAlert.innerHTML='<span class="dot"></span>운영 알림 4건';}
  const mobileAlert=document.querySelector('.mobile-alert-button');
  if(mobileAlert)mobileAlert.setAttribute('onclick',"setHubPage('notifications')");

  const page=`
  <main class="operations-main notifications-v103" id="notificationsPage" aria-label="운영 알림 센터" hidden>
    <div class="operations-canvas">
      <section class="operations-intro" aria-labelledby="notificationsTitle">
        <div><div class="operations-eyebrow page-context-line"><i aria-hidden="true"></i>열린 알림 2건 · 숨김 1건 · 마지막 신호 4분 전</div><h1 id="notificationsTitle">지금 확인할 운영 <em class="page-title-accent">알림은 4건</em>이에요.</h1><p>채널 오류와 데이터 품질 신호를 한곳에서 보고, 확인한 기록까지 남겨요.</p></div>
        <button class="operations-sample-note" type="button" onclick="openEvidenceDrawer()"><span>DESIGN SAMPLE</span><strong>HS-20260828-1042</strong><small>외부 이메일 발송 없음</small></button>
      </section>
      <section class="notifications-signal-line" aria-label="알림 처리 흐름">
        <article><span class="signal-pictogram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V8l8-5 8 5v11z"/><path d="M8 12h8M8 16h5"/></svg></span><span><small>01 · 발견</small><strong>운영 신호 4건</strong><b>채널·작업·자료 상태</b></span></article>
        <article><span class="signal-pictogram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11l2 2 4-4"/></svg></span><span><small>02 · 확인</small><strong>근거를 먼저 봐요</strong><b>발생 시각·영향 범위</b></span></article>
        <article><span class="signal-pictogram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l4 4L19 6"/><path d="M4 20h16"/></svg></span><span><small>03 · 처리</small><strong>2건 조치 필요</strong><b>숨김·확인·해결</b></span></article>
        <article><span class="signal-pictogram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg></span><span><small>04 · 기록</small><strong>상태 이력 보존</strong><b>발송은 별도 설정</b></span></article>
      </section>
      <div class="operations-layout notifications-layout" id="notificationsLayout">
        <section class="operations-workbench notification-workbench">
          <div class="notification-toolbar"><div role="tablist" aria-label="알림 상태 필터"><button class="active" type="button" data-alert-filter="open">열림 2</button><button type="button" data-alert-filter="snoozed">1시간 숨김 1</button><button type="button" data-alert-filter="acknowledged">확인 1</button><button type="button" data-alert-filter="resolved">해결 1</button><button type="button" data-alert-filter="all">전체 5</button></div><span id="notificationFilterSummary">지금 처리할 알림 2건</span></div>
          <div class="notification-bulk"><strong><span id="notificationSelectedCount">0</span>건 선택</strong><span>허브 안의 알림 상태만 바꿔요.</span><div><button type="button" data-alert-bulk="snoozed">1시간 숨김</button><button type="button" data-alert-bulk="acknowledged">확인</button><button type="button" data-alert-bulk="resolved">해결</button></div></div>
          <div class="notification-list" id="notificationList"></div>
        </section>
        <aside class="operations-aside" id="notificationsAside" aria-label="선택 알림 상세 작업석"><button class="operations-rail-control" data-operations-rail-control type="button" aria-expanded="true" onclick="toggleOperationsRail('notifications')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg><span>알림 상세 접기</span></button><div class="operations-aside-content"><div class="notification-detail-head"><div><span class="operations-kicker">ALERT DETAIL</span><h2 id="notificationDetailTitle">쿠팡 작업 서버 생존 신호 지연</h2><p id="notificationDetailMeta">쿠팡 · 작업 서버 · 4분 전</p></div><em id="notificationDetailStatus">높음</em></div><div class="notification-detail-body"><span>왜 표시됐나요?</span><p id="notificationDetailBody">서울 고정 IP 작업자의 마지막 생존 신호가 기준 3분을 넘겼어요. 쿠팡 주문과 재고의 마지막 성공 자료는 보존되어 있습니다.</p></div><dl class="evidence-list"><div><dt>영향 페이지</dt><dd id="notificationDetailPage">주문·재고</dd></div><div><dt>현재 자료</dt><dd id="notificationDetailData">이전 성공 자료</dd></div><div><dt>발생 시각</dt><dd id="notificationDetailTime">오늘 10:38</dd></div><div><dt>현재 상태</dt><dd id="notificationDetailState">열림</dd></div></dl><div class="notification-detail-actions"><button type="button" data-detail-action="snoozed">1시간 숨김</button><button type="button" data-detail-action="acknowledged">확인 기록</button><button class="primary" type="button" data-detail-action="resolved">해결로 표시</button><button type="button" data-ops-toast="관련 시스템 근거를 시안으로 열었어요.">관련 근거 보기</button></div><details class="notification-delivery"><summary><span>외부 알림 설정·발송 이력</span><b>기본 접힘</b></summary><div><p><span>즉시 이메일</span><b>높음 이상</b></p><p><span>주간 요약</span><b>월요일 08:30</b></p><p><span>마지막 발송</span><b>시안 · 발송 없음</b></p></div></details><p class="operations-footnote">시안 샘플 · 외부 이메일과 채널 작업 실행 없음</p></div></aside>
      </div>
    </div>
  </main>`;
  document.getElementById('systemPage')?.insertAdjacentHTML('afterend',page);

  const alerts=[
    {id:'coupang-worker',state:'open',level:'high',glyph:'!',channel:'쿠팡',source:'작업 서버',title:'쿠팡 작업 서버 생존 신호 지연',message:'마지막 생존 신호가 기준 3분을 넘겼어요.',time:'4분 전',status:'높음',tone:'rose',page:'주문·재고',data:'이전 성공 자료',at:'오늘 10:38',body:'서울 고정 IP 작업자의 마지막 생존 신호가 기준 3분을 넘겼어요. 쿠팡 주문과 재고의 마지막 성공 자료는 보존되어 있습니다.'},
    {id:'cafe24-gap',state:'open',level:'warn',glyph:'24',channel:'Cafe24',source:'데이터 품질',title:'Cafe24 문의 수집 공백 확인',message:'마지막 문의 수집 이후 42분이 지났어요.',time:'9분 전',status:'주의',tone:'rose',page:'고객·CS',data:'확인 필요',at:'오늘 10:33',body:'Cafe24 문의 수집이 평소 주기보다 늦어요. 빈 결과를 정상 0건으로 확정하지 않고 이전 성공 시각을 유지합니다.'},
    {id:'epost-check',state:'snoozed',level:'warn',glyph:'우',channel:'ePost',source:'독립 재확인',title:'우체국 송장 경로 독립 확인 대기',message:'수정 이후 읽기 검증이 아직 완료되지 않았어요.',time:'18분 전',status:'1시간 숨김',tone:'blue',page:'주문·배송',data:'SETUP_REQUIRED',at:'오늘 10:24',body:'송장 발급 경로와 채널 등록 경로를 분리해 재확인해야 해요. 숨김이 끝나면 다시 열림 상태로 돌아옵니다.'},
    {id:'naver-cost',state:'acknowledged',level:'good',glyph:'N',channel:'네이버',source:'광고 원가',title:'광고 판단용 원가 근거 확인됨',message:'대표님이 최신 원가표를 확인했어요.',time:'31분 전',status:'확인',tone:'mint',page:'키워드',data:'READY',at:'오늘 10:11',body:'원가 유효일과 광고 목표 연결을 확인했어요. 실제 입찰 변경은 별도의 확인 뒤에만 실행됩니다.'},
    {id:'settlement-resolved',state:'resolved',level:'good',glyph:'₩',channel:'정산',source:'지급 대조',title:'Cafe24 PG 지급 차이 해결',message:'정산 원본과 허브 계산값이 일치해요.',time:'어제',status:'해결',tone:'mint',page:'정산·비용',data:'검증 완료',at:'어제 17:42',body:'PG 지급 2건의 원본과 허브 계산값을 다시 대조해 차이가 없음을 확인하고 해결 기록을 남겼습니다.'}
  ];
  let active='coupang-worker';
  let filter='open';
  const list=document.getElementById('notificationList');
  const render=()=>{
    list.innerHTML=alerts.map(item=>`<button class="notification-row${item.id===active?' selected':''}" type="button" data-alert-row="${item.id}" data-alert-state="${item.state}" ${filter!=='all'&&item.state!==filter?'hidden':''}><input class="notification-check" type="checkbox" aria-label="${item.title} 선택"/><span class="notification-identity"><i class="notification-level ${item.level}">${item.glyph}</i><span><strong>${item.channel}</strong><small>${item.source} · ${item.time}</small></span></span><span class="notification-message"><strong>${item.title}</strong><small>${item.message}</small></span><em data-tone="${item.tone}">${item.status}</em><i>›</i></button>`).join('');
    list.querySelectorAll('[data-alert-row]').forEach(row=>row.addEventListener('click',event=>{if(event.target.matches('input')){updateSelected();return;}active=row.dataset.alertRow;updateDetail();render();}));
    list.querySelectorAll('input').forEach(input=>input.addEventListener('click',event=>event.stopPropagation()));
    list.querySelectorAll('input').forEach(input=>input.addEventListener('change',updateSelected));
  };
  const updateSelected=()=>{document.getElementById('notificationSelectedCount').textContent=String(list.querySelectorAll('input:checked').length);};
  const updateDetail=()=>{const item=alerts.find(value=>value.id===active)||alerts[0];const map={notificationDetailTitle:item.title,notificationDetailMeta:`${item.channel} · ${item.source} · ${item.time}`,notificationDetailStatus:item.status,notificationDetailBody:item.body,notificationDetailPage:item.page,notificationDetailData:item.data,notificationDetailTime:item.at,notificationDetailState:{open:'열림',snoozed:'1시간 숨김',acknowledged:'확인',resolved:'해결'}[item.state]};Object.entries(map).forEach(([id,value])=>{const element=document.getElementById(id);if(element)element.textContent=value;});};
  document.querySelectorAll('[data-alert-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.alertFilter;document.querySelectorAll('[data-alert-filter]').forEach(control=>control.classList.toggle('active',control===button));const count=alerts.filter(item=>filter==='all'||item.state===filter).length;document.getElementById('notificationFilterSummary').textContent=`현재 조건 ${count}건`;render();}));
  const changeState=next=>{const item=alerts.find(value=>value.id===active);if(!item)return;item.state=next;item.status={snoozed:'1시간 숨김',acknowledged:'확인',resolved:'해결'}[next]||item.status;updateDetail();render();};
  document.querySelectorAll('[data-detail-action]').forEach(button=>button.addEventListener('click',()=>changeState(button.dataset.detailAction)));
  document.querySelectorAll('[data-alert-bulk]').forEach(button=>button.addEventListener('click',()=>{const selected=[...list.querySelectorAll('input:checked')].map(input=>input.closest('[data-alert-row]').dataset.alertRow);alerts.filter(item=>selected.includes(item.id)).forEach(item=>{item.state=button.dataset.alertBulk;item.status={snoozed:'1시간 숨김',acknowledged:'확인',resolved:'해결'}[item.state];});render();updateSelected();}));
  updateDetail();render();
})();
