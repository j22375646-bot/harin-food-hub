(()=>{
 const root=document.getElementById('api-existing');if(!root)return;
 const labels={vendorId:'판매자 ID',mallId:'쇼핑몰 ID',clientId:'Client ID',clientSecret:'Client Secret',customerId:'광고 고객 ID',apiKey:'API Key',accessKey:'Access Key',secretKey:'Secret Key',customerNo:'계약 고객번호',approvalNo:'계약 승인번호',officeSerial:'접수국 일련번호',securityKey:'SEED 보안키',trackingApiKey:'배송추적 키 · 선택'};
 const messages={KEYS_AUTH_REQUIRED:'로그인 상태를 확인해 주세요.',KEYS_SETUP_REQUIRED:'수집 서버 연결 준비 중입니다. 아직 저장할 수 없습니다.',KEYS_CONFLICT:'다른 PC에서 설정을 바꿨습니다. 다시 불러와 확인해 주세요.',KEYS_RATE_LIMITED:'잠시 후 다시 시도해 주세요.',KEYS_INVALID:'입력값과 필수 항목을 확인해 주세요.',KEYS_RESULT_UNKNOWN:'저장 결과를 확인하지 못했습니다. 다시 불러와 확인해 주세요.',KEYS_UNAVAILABLE:'서버 설정을 확인하지 못했습니다. 다시 시도해 주세요.'};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;},btn=(label,handler,cls='key-button')=>{const b=el('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;};
 let generation=0,busy=false,loaded=false,reloadRequested=false;
 const heading=el('div','key-section-heading'),intro=el('div'),title=el('h3','','API 연결'),description=el('p','','저장된 인증정보와 연결 상태를 한곳에서 관리하세요.');intro.append(title,description);
 const refresh=btn('연결 목록 새로고침',load);heading.append(intro,refresh);const notice=el('p','key-notice'),grid=el('div','key-card-grid'),extras=el('div');notice.setAttribute('role','status');root.replaceChildren(heading,notice,grid,extras);
 function wipe(){generation++;loaded=false;reloadRequested=false;grid.querySelectorAll('input').forEach(n=>n.value='');grid.replaceChildren();extras.replaceChildren();notice.textContent='';}
 async function call(input){if(busy)return null;busy=true;root.setAttribute('aria-busy','true');root.querySelectorAll('button').forEach(b=>b.disabled=true);const token=generation;try{const result=await window.moaonHub.connectionCommand(input);return token===generation?result:null;}catch{return token===generation?{ok:false,code:'KEYS_UNAVAILABLE'}:null;}finally{busy=false;root.removeAttribute('aria-busy');root.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.locked==='true');if(reloadRequested){reloadRequested=false;queueMicrotask(changed);}}}
 function date(value){if(!value||!Number.isFinite(Date.parse(value)))return '만료일 확인 불가';return new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'Asia/Seoul'}).format(new Date(value));}
 function inputDate(value){if(!value||!Number.isFinite(Date.parse(value)))return '';const p=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).formatToParts(new Date(value));return ['year','month','day'].map(type=>p.find(v=>v.type===type).value).join('-');}
 const capabilities={
  COUPANG:[['가져오는 정보','상품·옵션, 판매자배송 주문, 로켓그로스 재고, 문의·반품·교환, 정산'],['쓰이는 화면','상품 · 재고 · 주문·배송 · 고객·CS · 운영·정산'],['수집 설정','앱 로그인 중 주문 약 2분 · 문의 약 5분. 재고·정산은 별도 조회 작업'],['구분','판매자배송과 로켓그로스 자료는 따로 집계합니다.']],
  NAVER:[['커머스 API','상품·주문·문의·정산 기간 자료'],['검색광고 API','캠페인·광고그룹·성과·검색어. 지원 대상 입찰가 조회/수정'],['쓰이는 화면','주문·배송 · 상품 · 고객·CS · 분석 · 키워드 · 운영·정산'],['수집 설정','주문 약 2분 · 문의 약 5분. 광고는 보고서 수집 작업'],['키 구분','커머스 Client ID/Secret과 광고 고객 ID/API Key/Secret은 서로 다릅니다.']],
  CAFE24:[['가져오는 정보','상품·주문·배송·문의·취소/반품 자료'],['쓰이는 화면','상품 · 주문·배송 · 고객·CS · 운영·정산'],['인증 방식','Client ID/Secret 외 OAuth 승인이 필요합니다. 토큰은 서버에서 관리합니다.'],['정산 구분','KCP · KG모빌리언스 · PAYCO의 실제 지급명세는 별도 PG 연동이 필요합니다.']],
  EPOST:[['사용하는 정보','계약 접수국, 승인한 주문의 운송장 발급·배송 추적'],['실행 방식','발급은 사용자 확인 후 실행 · 배송 추적은 등록 송장 기준'],['키 구분','계약/승인 정보와 SEED 보안키. 배송 추적 키는 별도 선택 항목']]
 };
 const statusNames={SUCCESS:'수집 성공',PARTIAL:'일부 수집',FAILED:'수집 실패',RUNNING:'수집 중',UNKNOWN:'기록 없음'};
 function usage(c){const section=el('div'),dl=el('dl','api-capabilities');for(const [label,value]of capabilities[c.provider]||[]){const row=el('div');row.append(el('dt','',label),el('dd','',value));dl.append(row);}section.append(dl);
 const history=el('details','api-jobs');history.append(el('summary','','마지막 수집 기록'));
 if(c.collection?.status==='READY'){for(const r of c.collection.jobs){const row=el('div','api-job');row.append(el('strong','',r.label),el('span','',statusNames[r.status]||'확인 필요'),el('small','',r.finishedAt||r.startedAt?new Date(r.finishedAt||r.startedAt).toLocaleString('ko-KR'):'수집 시각 확인 불가'));history.append(row);}}
 else history.append(el('p','key-result',c.collection?.status==='ON_DEMAND'?'요청 시 실행하는 API입니다.':'수집 기록을 확인하지 못했습니다. 연결 인증 결과와 별개입니다.'));
 section.append(history);return section;}
 function guide(services){
 const section=el('section','api-guide-section');section.append(el('h3','','추가로 활용하면 좋은 기능'),el('p','key-notice','현재 적용 기능과 구분한 개발 추천입니다. 아래 기능을 자동 실행하지 않습니다.'));
 const grid=el('div','api-guide-grid');
 for(const [title,body]of [
 ['쿠팡 · 옵션 재고·판매상태 대조','우선 추천 · 내부 소분 재고와 판매 옵션 수량을 대조해 과판매를 줄입니다. 자동 수량 변경은 상품 연동·묶음 수량 검증 후 도입합니다.'],
 ['쿠팡 · 반품·교환 진행 추적','우선 추천 · 이미 가져오는 클레임에 회수·입고·처리기한을 연결합니다. 입고 확인이나 승인 처리는 확인 후 실행하도록 설계합니다.'],
 ['쿠팡 · 카테고리 필수정보 검사','상품 등록 전 필수 속성·인증·고시 누락을 찾아 등록 실패를 줄입니다. 카테고리 조회와 추천 API를 활용할 수 있습니다.'],
 ['쿠팡 · 쿠폰·가격 변경','후순위 · 매출 효과를 분석한 뒤 마진 하한과 예산을 먼저 정해야 합니다. 쿠폰 생성·삭제, 가격 변경은 판매조건에 영향을 줍니다.'],
 ['네이버 · 광고 낭비·전환 검색어','우선 추천 · 수집 중인 성과·검색어로 전환 없는 지출과 성과 좋은 검색어를 분리합니다. 입찰 변경 전 상한·전후 비교를 보여줍니다.'],
 ['네이버 · 주문·정산 대조','우선 추천 · 주문별 정산 기간과 실제 지급자료를 대조합니다. 수수료·광고비·환불은 서로 다른 원천으로 확인합니다.']]){const box=el('article','api-guide-item');box.append(el('h4','',title),el('p','',body));grid.append(box);}section.append(grid);
 const other=el('section','api-guide-section');other.append(el('h3','','함께 사용하는 서버 서비스'),el('p','key-notice','설정 있음은 실제 호출 성공을 의미하지 않습니다. 아래 운영 서비스의 키는 서버에서 관리하며, 이 화면에서는 원문을 제공하지 않습니다.'));
 for(const row of services||[]){const n=el('div','api-service-row');n.append(el('strong','',row.label),el('span','',row.usage),el('span','',({CONFIGURED:'설정 있음 · 호출 미확인',DISABLED:'실행 꺼짐',SETUP_REQUIRED:'설정 필요'})[row.status]||'확인 필요'));other.append(n);}
 if(!services)other.append(el('p','key-notice','서버 서비스 목록을 확인하지 못했습니다. 다시 새로고침해 주세요.'));
 other.append(el('p','key-notice','모아온 운영 기반: Supabase(자료 저장·인증), Vercel(웹 API), AWS 고정 IP 수집기, GitHub(앱 업데이트). 이 목록은 인증정보 목록과 구분합니다.'));
 return [section,other];
 }
 function card(c){
  const box=el('article','key-card'),top=el('div','key-card-top'),name=el('h4','',c.name),badge=el('span','key-badge','연결 확인 전');top.append(name,badge);
  const expiry=el('p','key-expiry',(c.expiresAt&&Date.parse(c.expiresAt)<=Date.now()?'만료 · ':'유효기간 · ')+date(c.expiresAt));
  if(c.expiresAt&&Date.parse(c.expiresAt)<=Date.now())expiry.classList.add('is-expired');
  const source=el('p','key-source',c.revision?'저장 버전 '+c.revision:'기존 서버 설정');
  const state=el('p','key-result',c.editable?'값을 저장한 뒤 연결 상태를 다시 확인해 주세요.':'수집 서버 연결 준비 중 · 저장 기능 대기');state.setAttribute('role','status');
  if(c.check&&Number.isFinite(Date.parse(c.check.checkedAt))){badge.textContent=c.check.status==='CONNECTED'?'마지막 조회 성공':'확인 필요';state.textContent=(c.check.checks||[]).map(r=>r.label+' · '+(r.status==='CONNECTED'?'성공':'실패'+(r.httpStatus?' HTTP '+r.httpStatus:''))).join(' / ')+' · '+new Date(c.check.checkedAt).toLocaleString('ko-KR');}
  const actions=el('div','key-actions'),editor=el('form','key-editor');editor.hidden=true;
  const loadValues=btn('저장된 키 확인 · 수정',async()=>{
   const result=await call({action:'REVEAL',provider:c.provider});if(!result)return;
   if(!result.ok){state.textContent=messages[result.code]||messages.KEYS_UNAVAILABLE;return;}
   c.revision=result.revision;editor.replaceChildren();editor.hidden=false;
   for(const name of c.fields){const wrap=el('label','key-field',labels[name]||name),input=el('input');input.name=name;input.type='password';input.value=result.fields[name]||'';input.autocomplete='off';input.spellcheck=false;input.maxLength=2048;input.required=name!=='trackingApiKey';input.readOnly=c.identity.includes(name)||!c.editable;if(c.identity.includes(name))input.type='text';wrap.append(input);editor.append(wrap);result.fields[name]='';}
   const expiryLabel=el('label','key-field','키 만료일 · 모르면 비워두세요'),expires=el('input');expires.type='date';expires.name='expiresAt';expires.value=inputDate(c.expiresAt);expires.disabled=!c.editable;expiryLabel.append(expires);editor.append(expiryLabel);
   const footer=el('div','key-editor-actions');let shown=false;
   footer.append(btn('키 값 표시',event=>{shown=!shown;editor.querySelectorAll('input:not([type=date])').forEach(n=>{if(!c.identity.includes(n.name))n.type=shown?'text':'password';});event.currentTarget.textContent=shown?'키 값 가리기':'키 값 표시';}),btn('닫기',()=>{editor.querySelectorAll('input').forEach(n=>n.value='');editor.replaceChildren();editor.hidden=true;}));
   const save=el('button','key-button primary','변경사항 저장');save.type='submit';save.disabled=!c.editable;save.dataset.locked=String(!c.editable);footer.append(save);editor.append(footer);
   state.textContent='사업장 식별자는 고정됩니다. 키 값은 이 화면을 벗어나면 지워집니다.';
  });
  const check=btn('연결 재확인',async()=>{const result=await call({action:'CHECK',provider:c.provider});if(!result)return;if(!result.ok){state.textContent=messages[result.code]||messages.KEYS_UNAVAILABLE;return;}badge.textContent=({CONNECTED:'연결 확인됨',CHECK_FAILED:'확인 필요',WORKER_CHECK_REQUIRED:'수집 서버 확인 대기',QUEUED:'연결 확인 중'})[result.status]||'확인 필요';state.textContent=result.status==='CONNECTED'?'인증 확인용 조회에 성공했습니다. · '+new Date(result.checkedAt).toLocaleString('ko-KR'):result.status==='WORKER_CHECK_REQUIRED'?'고정 IP 수집 서버에서 인증을 확인해야 합니다. 키 저장만으로 연결 성공으로 표시하지 않습니다.':result.status==='QUEUED'?'수집 서버에 조회를 요청했습니다. 잠시 후 목록을 새로고침해 주세요.':'인증 또는 API 권한을 확인해 주세요. 만료 여부는 별도 확인이 필요합니다.';});
  editor.addEventListener('submit',async e=>{e.preventDefault();if(busy||!c.editable||!editor.reportValidity())return;if(!window.confirm(c.name+'의 운영 API 키를 변경할까요? 모든 PC의 다음 수집부터 사용합니다.'))return;
   const fields=Object.fromEntries(c.fields.map(k=>[k,editor.elements.namedItem(k).value])),expires=editor.elements.namedItem('expiresAt').value;
   const expiresAt=expires===inputDate(c.expiresAt)?c.expiresAt||null:expires?expires+'T23:59:59+09:00':null;
   const result=await call({action:'SAVE',provider:c.provider,revision:c.revision,fields,expiresAt});Object.keys(fields).forEach(k=>fields[k]='');editor.querySelectorAll('input').forEach(n=>n.value='');editor.replaceChildren();editor.hidden=true;if(!result)return;
   if(result.ok){c.revision=result.revision;c.expiresAt=expiresAt;const expired=expiresAt&&Date.parse(expiresAt)<=Date.now();expiry.textContent=(expired?'만료 · ':'유효기간 · ')+date(expiresAt);expiry.classList.toggle('is-expired',!!expired);badge.textContent='저장됨 · 연결 확인 전';source.textContent='저장 버전 '+result.revision;state.textContent='새 키를 저장했습니다. 연결 재확인으로 실제 조회 결과를 확인하세요.';}else state.textContent=messages[result.code]||messages.KEYS_UNAVAILABLE;
  });
  actions.append(loadValues,check);box.append(top,expiry,source,usage(c),actions,state,editor);return box;
 }
 async function load(){if(busy)return;notice.textContent='API 연결 목록을 확인하고 있습니다…';const result=await call({action:'LIST'});if(!result)return;if(!result.ok){notice.textContent=messages[result.code]||messages.KEYS_UNAVAILABLE;return;}loaded=true;grid.replaceChildren(...result.cards.map(card));extras.replaceChildren(...guide(result.services));notice.textContent='키는 기본으로 가려집니다. 만료일과 실제 연결 성공은 별도로 확인합니다.';}
 const settings=document.querySelector('[data-page="settings"]'),shell=document.querySelector('.preview-shell');
 const changed=()=>{if(settings.hidden||shell.hidden||root.hidden||!!root.closest('[hidden]')){wipe();return;}if(!loaded){if(busy)reloadRequested=true;else load();}};
 settings.addEventListener('settings-tab-change',changed);
 for(const node of [settings,shell,root])new MutationObserver(changed).observe(node,{attributes:true,attributeFilter:['hidden']});
})();
