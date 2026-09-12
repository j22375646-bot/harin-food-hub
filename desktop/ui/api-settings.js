(()=>{
 const $=id=>document.getElementById(id),fields={
  CAFE24:[['mallId','쇼핑몰 ID'],['clientId','Client ID'],['clientSecret','Client Secret']],
  NAVER:[['clientId','커머스 API Client ID'],['clientSecret','Client Secret']],
  COUPANG:[['vendorId','판매자 ID'],['accessKey','Access Key'],['secretKey','Secret Key']],
  EPOST:[['customerId','계약 고객번호'],['approvalNo','계약 승인번호'],['officeSerial','접수국 일련번호'],['apiKey','API 인증키'],['securityKey','SEED 보안키 · UTF-8 16바이트'],['trackingApiKey','배송추적 인증키 · 선택']]
 };
 let busy=false,generation=0,serverBusy=false,metadata=null,pending=null;
 const clear=()=>{$('api-fields').querySelectorAll('input').forEach(input=>input.value='');};
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 async function loadBusinesses(){
  invalidateServer();clear();const token=++generation;$('api-tenant').replaceChildren(new Option('사업장 확인 중…',''));$('api-tenant').disabled=true;$('api-draft-save').disabled=true;syncServer();
  $('api-business-status').textContent='소유자 권한을 확인하고 있습니다.';
  try{const result=await window.moaonHub.listBusinesses();if(token!==generation)return;
   const owners=result.status==='READY'?result.businesses.filter(row=>row.role==='OWNER'):[];
   $('api-tenant').replaceChildren(new Option('사업장 선택',''),...owners.map(row=>new Option(row.displayName,row.tenantId)));
   $('api-tenant').disabled=!owners.length;syncServer();$('api-draft-save').disabled=!owners.length||busy;
   $('api-business-status').textContent=owners.length?'저장할 때 소유자 권한을 다시 확인합니다.':result.status==='READY'?'선택할 소유자 사업장이 없습니다. 미연결 사업장은 임시 설정으로 저장하세요.':'사업장을 확인하지 못했습니다. 계정 연결 상태를 확인한 뒤 다시 시도하세요.';
  }catch{if(token===generation)$('api-business-status').textContent='사업장을 확인하지 못했습니다. 다시 시도하세요.';}
 }
 function renderFields(){
  clear();$('api-fields').replaceChildren(...fields[$('api-provider').value].map(([name,label])=>{
   const wrapper=text('label',label),input=document.createElement('input');input.name=name;input.type=/secret|key/i.test(name)?'password':'text';input.required=name!=='trackingApiKey';input.maxLength=2048;input.autocomplete='off';input.spellcheck=false;
   if(name==='securityKey')input.addEventListener('input',()=>input.setCustomValidity(input.value&&new TextEncoder().encode(input.value).length!==16?'SEED 보안키는 UTF-8 기준 정확히 16바이트여야 합니다.':''));
   wrapper.append(input);return wrapper;
  }));
  $('api-provider-note').textContent=$('api-provider').value==='EPOST'?'계약소포 발급에는 계약 정보와 SEED 보안키가 필요합니다. 배송추적 키는 별도이며, 비우면 추적 설정은 미완료입니다. 실제 인증은 허용된 고정 IP 서버에서 확인해야 합니다.':$('api-provider').value==='CAFE24'?'Cafe24는 키 입력 외에 OAuth 승인이 필요합니다.':'키 저장 후 플랫폼 인증과 사업장 연결 검증이 필요합니다.';
 }
 function renderList(rows){
  $('api-draft-list').replaceChildren(...(rows.length?rows.map(row=>{
   const item=document.createElement('li');item.append(text('strong',row.business+' · '+row.provider),text('small',(row.tenantId?'사업장 지정':'임시 설정')+(row.status==='CONFIGURATION_REQUIRED'?' · 계약 정보 보완 필요 · 같은 사업장으로 다시 입력하세요':' · 이 PC에 저장됨 · 연결 검증 전')));
   const remove=text('button','저장한 키 삭제');remove.type='button';remove.addEventListener('click',async()=>{
    if(busy||serverBusy||pending||!window.confirm(`${row.business}의 ${row.provider} 저장 키를 이 PC에서 삭제할까요? 실제 서버 연결은 변경되지 않습니다.`))return;
    busy=true;syncServer();remove.disabled=true;const token=generation;try{const rows=await window.moaonHub.removeApiDraft({business:row.business,provider:row.provider,...(row.tenantId?{tenantId:row.tenantId}:{})});if(token===generation)renderList(rows);}catch{if(token===generation)$('api-draft-status').textContent='삭제하지 못했습니다. 다시 시도하세요.';}finally{busy=false;remove.disabled=false;syncServer();}
   });item.append(remove);return item;
  }):[text('li','이 PC에 저장한 새 사업장 설정이 없습니다.')]));
 }
 $('api-source').addEventListener('change',()=>{generation++;invalidateServer();clear();const owned=$('api-source').value==='owned',existing=$('api-source').value==='existing';$('api-draft-form').hidden=existing;$('api-existing').hidden=!existing;$('api-owned-business').hidden=!owned;$('api-business-label').hidden=owned;$('api-business').disabled=owned;$('api-business').required=!owned;$('api-tenant').required=owned;$('api-tenant').disabled=!owned;$('api-draft-save').disabled=busy;$('api-draft-status').textContent='';syncServer();if(owned)loadBusinesses();});
 $('api-business-refresh').addEventListener('click',()=>{if(!busy&&!serverBusy)loadBusinesses();});
 $('api-tenant').addEventListener('change',()=>{generation++;invalidateServer();clear();syncServer();});
 $('api-provider').addEventListener('change',()=>{generation++;invalidateServer();renderFields();syncServer();});
 $('api-draft-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||serverBusy||pending)return;busy=true;const token=generation;
  const owned=$('api-source').value==='owned';
  const input={...(owned?{tenantId:$('api-tenant').value}:{business:$('api-business').value.trim()}),provider:$('api-provider').value,fields:Object.fromEntries([...$('api-fields').querySelectorAll('input')].map(el=>[el.name,el.value]))};
  $('api-draft-save').disabled=true;$('api-draft-status').textContent='암호화 저장 중…';
  try{await (owned?window.moaonHub.saveOwnedApiDraft(input):window.moaonHub.saveApiDraft(input));if(token===generation)$('api-draft-status').textContent='이 PC에 암호화 저장됨 · 연결 검증 전. 아직 주문 수집에 사용되지 않습니다.';}
  catch{if(token===generation)$('api-draft-status').textContent='저장하지 못했습니다. 사업장 권한, 필수값과 Windows 암호화 사용 가능 여부를 확인하세요.';}
  finally{Object.keys(input.fields).forEach(k=>input.fields[k]='');clear();busy=false;$('api-draft-save').disabled=false;syncServer();}
 });
 $('api-draft-load').addEventListener('click',async()=>{if(busy||serverBusy||pending)return;busy=true;syncServer();const token=generation;try{const rows=await window.moaonHub.listApiDrafts();if(token===generation)renderList(rows);}catch{$('api-draft-status').textContent='저장 자료를 읽지 못했습니다. 기존 자료는 덮어쓰지 않습니다.';}finally{busy=false;syncServer();}});

 const serverMessages={
  SETUP_REQUIRED:'서버 API 저장 기능이 아직 준비되지 않았습니다. PC 암호화 저장은 별도로 이용할 수 있습니다.',
  ACCESS_DENIED:'로그인 또는 사업장 소유자 권한을 확인하세요. 저장 상태를 다시 조회해야 합니다.',
  RATE_LIMITED:'요청 한도를 초과했습니다. 잠시 후 저장 상태를 다시 조회하세요.',
  CONFLICT:'다른 곳에서 설정이 변경되었습니다. 저장 상태를 다시 조회하고 확인하세요.',
  RESULT_UNKNOWN:'저장 결과를 확인하지 못했습니다. 자동 재시도하지 않습니다. 서버 상태를 다시 조회한 뒤 필요한 경우 새로 저장하세요.',
  INVALID:'입력값을 확인하세요. 저장 상태를 다시 조회하고 키를 다시 입력하세요.',
  BUSY:'다른 작업이 진행 중입니다. 완료 후 저장 상태를 다시 조회하세요.',
  UNAVAILABLE:'서버 상태를 확인하지 못했습니다. 잠시 후 다시 조회하세요.'
 };
 function wipePending(){if(pending)Object.keys(pending.fields).forEach(k=>pending.fields[k]='');pending=null;$('api-server-confirm').hidden=true;}
 function invalidateServer(){metadata=null;wipePending();$('api-server-status').textContent='';syncServer();}
 function syncServer(){
  const owned=$('api-source').value==='owned';$('api-server-controls').hidden=!owned;
  const locked=busy||serverBusy;
  $('api-draft-save').disabled=locked||Boolean(pending)||(owned&&(!$('api-tenant').value||$('api-tenant').disabled));
  $('api-business-refresh').disabled=locked||Boolean(pending);
  $('api-draft-load').disabled=locked||Boolean(pending);
  $('api-server-read').disabled=!owned||!$('api-tenant').value||locked||Boolean(pending);
  $('api-server-save').disabled=!owned||!metadata||locked||Boolean(pending);
  $('api-server-confirm-save').disabled=locked;
  $('api-server-cancel').disabled=serverBusy;
 }
 function safeMetadata(value,input,saved=false){
  return value&&value.tenantId===input.tenantId&&value.provider===input.provider&&Number.isSafeInteger(value.revision)&&value.revision>=0&&
   (value.revision===0?value.status==='NOT_SAVED':value.status==='SAVED_UNVERIFIED')&&(!saved||(value.status==='SAVED_UNVERIFIED'&&value.revision===input.expectedRevision+1));
 }
 $('api-server-read').addEventListener('click',async()=>{
  if(busy||serverBusy||pending||$('api-source').value!=='owned'||!$('api-tenant').value)return;
  metadata=null;serverBusy=true;const token=generation,input={tenantId:$('api-tenant').value,provider:$('api-provider').value};syncServer();$('api-server-status').textContent='서버 저장 상태 조회 중…';
  try{const result=await window.moaonHub.readCredentialMetadata(input);if(token!==generation)return;
   if(safeMetadata(result,input)){metadata={...input,revision:result.revision};$('api-server-status').textContent=result.revision===0?'서버에 저장된 설정 없음 · 새 설정을 저장할 수 있습니다.':`서버 저장 버전 ${result.revision} · 연결 검증 전. 키 원문은 조회하지 않습니다.`;}
   else $('api-server-status').textContent=serverMessages[result?.status]||serverMessages.UNAVAILABLE;
  }catch{if(token===generation)$('api-server-status').textContent=serverMessages.UNAVAILABLE;}
  finally{serverBusy=false;syncServer();}
 });
 $('api-server-save').addEventListener('click',()=>{
  if(busy||serverBusy||pending||!metadata||$('api-source').value!=='owned')return;
  if(metadata.tenantId!==$('api-tenant').value||metadata.provider!==$('api-provider').value){invalidateServer();return;}
  if(!$('api-draft-form').checkValidity()){$('api-server-status').textContent='필수 입력값과 보안키 형식을 확인하세요.';return;}
  pending={tenantId:metadata.tenantId,provider:metadata.provider,expectedRevision:metadata.revision,fields:Object.fromEntries([...$('api-fields').querySelectorAll('input')].map(el=>[el.name,el.value]))};
  $('api-server-confirm-summary').textContent=`${$('api-tenant').selectedOptions[0].textContent} · ${$('api-provider').selectedOptions[0].textContent} · 현재 서버 버전 ${metadata.revision}`;
  $('api-server-confirm').hidden=false;syncServer();
 });
 $('api-server-cancel').addEventListener('click',()=>{if(serverBusy)return;wipePending();clear();syncServer();});
 $('api-server-confirm-save').addEventListener('click',async()=>{
  if(busy||serverBusy||!pending)return;
  const input=pending,token=generation;pending=null;metadata=null;serverBusy=true;syncServer();$('api-server-confirm').hidden=true;$('api-server-status').textContent='서버 저장 중…';
  try{const result=await window.moaonHub.saveServerCredential(input);if(token!==generation)return;
   $('api-server-status').textContent=safeMetadata(result,input,true)?`서버에 저장됨 · 버전 ${result.revision} · 연결 검증 전. 아직 플랫폼 인증 성공을 의미하지 않습니다.`:serverMessages[result?.status]||serverMessages.RESULT_UNKNOWN;
  }catch{if(token===generation)$('api-server-status').textContent=serverMessages.RESULT_UNKNOWN;}
  finally{Object.keys(input.fields).forEach(k=>input.fields[k]='');if(token===generation)clear();serverBusy=false;syncServer();}
 });
 $('api-fields').addEventListener('input',()=>{if(pending){wipePending();syncServer();}});
 $('api-draft-form').addEventListener('submit',syncServer);
 const settings=document.querySelector('[data-page="settings"]'),shell=document.querySelector('.preview-shell');
 new MutationObserver(()=>{if(settings.hidden||shell.hidden){generation++;invalidateServer();clear();$('api-draft-list').replaceChildren();$('api-draft-status').textContent='';}}).observe(settings,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(()=>{if(shell.hidden){generation++;invalidateServer();clear();$('api-business').value='';$('api-draft-list').replaceChildren();}}).observe(shell,{attributes:true,attributeFilter:['hidden']});
 settings.addEventListener('settings-tab-change',()=>{if($('api-settings').closest('[hidden]')){generation++;invalidateServer();clear();$('api-draft-list').replaceChildren();}});
 renderFields();syncServer();
})();
