(()=>{
 const root=document.getElementById('api-existing');if(!root)return;
 const labels={vendorId:'판매자 ID',mallId:'쇼핑몰 ID',clientId:'Client ID',clientSecret:'Client Secret',customerId:'광고 고객 ID',apiKey:'API Key',accessKey:'Access Key',secretKey:'Secret Key',customerNo:'계약 고객번호',approvalNo:'계약 승인번호',officeSerial:'접수국 일련번호',securityKey:'SEED 보안키',trackingApiKey:'배송추적 키 · 선택'};
 const messages={KEYS_AUTH_REQUIRED:'로그인 상태를 확인해 주세요.',KEYS_SETUP_REQUIRED:'수집 서버 연결 준비 중입니다. 아직 저장할 수 없습니다.',KEYS_CONFLICT:'다른 PC에서 설정을 바꿨습니다. 다시 불러와 확인해 주세요.',KEYS_RATE_LIMITED:'잠시 후 다시 시도해 주세요.',KEYS_INVALID:'입력값과 필수 항목을 확인해 주세요.',KEYS_RESULT_UNKNOWN:'저장 결과를 확인하지 못했습니다. 다시 불러와 확인해 주세요.',KEYS_UNAVAILABLE:'서버 설정을 확인하지 못했습니다. 다시 시도해 주세요.'};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;},btn=(label,handler,cls='key-button')=>{const b=el('button',cls,label);b.type='button';b.addEventListener('click',handler);return b;};
 let generation=0,busy=false,loaded=false;
 const heading=el('div','key-section-heading'),intro=el('div'),title=el('h3','','API 연결'),description=el('p','','저장된 인증정보와 연결 상태를 한곳에서 관리하세요.');intro.append(title,description);
 const refresh=btn('연결 목록 새로고침',load);heading.append(intro,refresh);const notice=el('p','key-notice'),grid=el('div','key-card-grid');notice.setAttribute('role','status');root.replaceChildren(heading,notice,grid);
 function wipe(){generation++;loaded=false;grid.querySelectorAll('input').forEach(n=>n.value='');grid.replaceChildren();notice.textContent='';}
 async function call(input){if(busy)return null;busy=true;root.setAttribute('aria-busy','true');root.querySelectorAll('button').forEach(b=>b.disabled=true);const token=generation;try{const result=await window.moaonHub.connectionCommand(input);return token===generation?result:null;}catch{return token===generation?{ok:false,code:'KEYS_UNAVAILABLE'}:null;}finally{busy=false;root.removeAttribute('aria-busy');root.querySelectorAll('button').forEach(b=>b.disabled=b.dataset.locked==='true');}}
 function date(value){if(!value||!Number.isFinite(Date.parse(value)))return '만료일 확인 불가';return new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'Asia/Seoul'}).format(new Date(value));}
 function inputDate(value){if(!value||!Number.isFinite(Date.parse(value)))return '';const p=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Seoul'}).formatToParts(new Date(value));return ['year','month','day'].map(type=>p.find(v=>v.type===type).value).join('-');}
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
  const check=btn('연결 재확인',async()=>{const result=await call({action:'CHECK',provider:c.provider});if(!result)return;if(!result.ok){state.textContent=messages[result.code]||messages.KEYS_UNAVAILABLE;return;}badge.textContent=({CONNECTED:'연결 확인됨',CHECK_FAILED:'확인 필요',WORKER_CHECK_REQUIRED:'수집 서버 확인 대기',QUEUED:'연결 확인 중'})[result.status]||'확인 필요';state.textContent=result.status==='CONNECTED'?'실제 상품 조회에 성공했습니다. · '+new Date(result.checkedAt).toLocaleString('ko-KR'):result.status==='WORKER_CHECK_REQUIRED'?'고정 IP 수집 서버에서 인증을 확인해야 합니다. 키 저장만으로 연결 성공으로 표시하지 않습니다.':result.status==='QUEUED'?'수집 서버에 조회를 요청했습니다. 잠시 후 목록을 새로고침해 주세요.':'인증 또는 API 권한을 확인해 주세요. 만료 여부는 별도 확인이 필요합니다.';});
  editor.addEventListener('submit',async e=>{e.preventDefault();if(busy||!c.editable||!editor.reportValidity())return;if(!window.confirm(c.name+'의 운영 API 키를 변경할까요? 모든 PC의 다음 수집부터 사용합니다.'))return;
   const fields=Object.fromEntries(c.fields.map(k=>[k,editor.elements.namedItem(k).value])),expires=editor.elements.namedItem('expiresAt').value;
   const expiresAt=expires===inputDate(c.expiresAt)?c.expiresAt||null:expires?expires+'T23:59:59+09:00':null;
   const result=await call({action:'SAVE',provider:c.provider,revision:c.revision,fields,expiresAt});Object.keys(fields).forEach(k=>fields[k]='');editor.querySelectorAll('input').forEach(n=>n.value='');editor.replaceChildren();editor.hidden=true;if(!result)return;
   if(result.ok){c.revision=result.revision;c.expiresAt=expiresAt;const expired=expiresAt&&Date.parse(expiresAt)<=Date.now();expiry.textContent=(expired?'만료 · ':'유효기간 · ')+date(expiresAt);expiry.classList.toggle('is-expired',!!expired);badge.textContent='저장됨 · 연결 확인 전';source.textContent='저장 버전 '+result.revision;state.textContent='새 키를 저장했습니다. 연결 재확인으로 실제 조회 결과를 확인하세요.';}else state.textContent=messages[result.code]||messages.KEYS_UNAVAILABLE;
  });
  actions.append(loadValues,check);box.append(top,expiry,source,actions,state,editor);return box;
 }
 async function load(){if(busy)return;notice.textContent='API 연결 목록을 확인하고 있습니다…';const result=await call({action:'LIST'});if(!result)return;if(!result.ok){notice.textContent=messages[result.code]||messages.KEYS_UNAVAILABLE;return;}loaded=true;grid.replaceChildren(...result.cards.map(card));notice.textContent='키는 기본으로 가려집니다. 만료일과 실제 연결 성공은 별도로 확인합니다.';}
 const settings=document.querySelector('[data-page="settings"]'),shell=document.querySelector('.preview-shell');
 const changed=()=>{if(settings.hidden||shell.hidden||root.hidden){wipe();return;}if(!loaded&&!busy)load();};
 for(const node of [settings,shell,root])new MutationObserver(changed).observe(node,{attributes:true,attributeFilter:['hidden']});
})();
