(()=>{
 const $=id=>document.getElementById(id),fields={
  CAFE24:[['mallId','쇼핑몰 ID'],['clientId','Client ID'],['clientSecret','Client Secret']],
  NAVER:[['clientId','커머스 API Client ID'],['clientSecret','Client Secret']],
  COUPANG:[['vendorId','판매자 ID'],['accessKey','Access Key'],['secretKey','Secret Key']],
  EPOST:[['customerId','계약 고객번호'],['apiKey','API 인증키']]
 };
 let busy=false,generation=0;
 const clear=()=>{$('api-fields').querySelectorAll('input').forEach(input=>input.value='');};
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 async function loadBusinesses(){
  const token=++generation;$('api-tenant').replaceChildren(new Option('사업장 확인 중…',''));$('api-tenant').disabled=true;$('api-draft-save').disabled=true;
  $('api-business-status').textContent='소유자 권한을 확인하고 있습니다.';
  try{const result=await window.moaonHub.listBusinesses();if(token!==generation)return;
   const owners=result.status==='READY'?result.businesses.filter(row=>row.role==='OWNER'):[];
   $('api-tenant').replaceChildren(new Option('사업장 선택',''),...owners.map(row=>new Option(row.displayName,row.tenantId)));
   $('api-tenant').disabled=!owners.length;$('api-draft-save').disabled=!owners.length||busy;
   $('api-business-status').textContent=owners.length?'저장할 때 소유자 권한을 다시 확인합니다.':result.status==='READY'?'선택할 소유자 사업장이 없습니다. 미연결 사업장은 임시 설정으로 저장하세요.':'사업장을 확인하지 못했습니다. 계정 연결 상태를 확인한 뒤 다시 시도하세요.';
  }catch{if(token===generation)$('api-business-status').textContent='사업장을 확인하지 못했습니다. 다시 시도하세요.';}
 }
 function renderFields(){
  clear();$('api-fields').replaceChildren(...fields[$('api-provider').value].map(([name,label])=>{
   const wrapper=text('label',label),input=document.createElement('input');input.name=name;input.type=/secret|key/i.test(name)?'password':'text';input.required=true;input.maxLength=2048;input.autocomplete='off';input.spellcheck=false;wrapper.append(input);return wrapper;
  }));
 }
 function renderList(rows){
  $('api-draft-list').replaceChildren(...(rows.length?rows.map(row=>{
   const item=document.createElement('li');item.append(text('strong',row.business+' · '+row.provider),text('small',(row.tenantId?'사업장 지정':'임시 설정')+' · 이 PC에 저장됨 · 연결 검증 전'));
   const remove=text('button','저장한 키 삭제');remove.type='button';remove.addEventListener('click',async()=>{
    if(busy||!window.confirm(`${row.business}의 ${row.provider} 저장 키를 이 PC에서 삭제할까요? 실제 서버 연결은 변경되지 않습니다.`))return;
    busy=true;remove.disabled=true;const token=generation;try{const rows=await window.moaonHub.removeApiDraft({business:row.business,provider:row.provider,...(row.tenantId?{tenantId:row.tenantId}:{})});if(token===generation)renderList(rows);}catch{if(token===generation)$('api-draft-status').textContent='삭제하지 못했습니다. 다시 시도하세요.';}finally{busy=false;remove.disabled=false;}
   });item.append(remove);return item;
  }):[text('li','이 PC에 저장한 새 사업장 설정이 없습니다.')]));
 }
 $('api-source').addEventListener('change',()=>{generation++;clear();const owned=$('api-source').value==='owned',existing=$('api-source').value==='existing';$('api-draft-form').hidden=existing;$('api-existing').hidden=!existing;$('api-owned-business').hidden=!owned;$('api-business-label').hidden=owned;$('api-business').disabled=owned;$('api-business').required=!owned;$('api-tenant').required=owned;$('api-tenant').disabled=!owned;$('api-draft-save').disabled=busy;$('api-draft-status').textContent='';if(owned)loadBusinesses();});
 $('api-business-refresh').addEventListener('click',()=>{if(!busy)loadBusinesses();});
 $('api-tenant').addEventListener('change',clear);
 $('api-provider').addEventListener('change',renderFields);
 $('api-draft-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const token=generation;
  const owned=$('api-source').value==='owned';
  const input={...(owned?{tenantId:$('api-tenant').value}:{business:$('api-business').value.trim()}),provider:$('api-provider').value,fields:Object.fromEntries([...$('api-fields').querySelectorAll('input')].map(el=>[el.name,el.value]))};
  $('api-draft-save').disabled=true;$('api-draft-status').textContent='암호화 저장 중…';
  try{await (owned?window.moaonHub.saveOwnedApiDraft(input):window.moaonHub.saveApiDraft(input));if(token===generation)$('api-draft-status').textContent='이 PC에 암호화 저장됨 · 연결 검증 전. 아직 주문 수집에 사용되지 않습니다.';}
  catch{if(token===generation)$('api-draft-status').textContent='저장하지 못했습니다. 사업장 권한, 필수값과 Windows 암호화 사용 가능 여부를 확인하세요.';}
  finally{Object.keys(input.fields).forEach(k=>input.fields[k]='');clear();busy=false;$('api-draft-save').disabled=false;}
 });
 $('api-draft-load').addEventListener('click',async()=>{if(busy)return;busy=true;const token=generation;try{const rows=await window.moaonHub.listApiDrafts();if(token===generation)renderList(rows);}catch{$('api-draft-status').textContent='저장 자료를 읽지 못했습니다. 기존 자료는 덮어쓰지 않습니다.';}finally{busy=false;}});
 const settings=document.querySelector('[data-page="settings"]'),shell=document.querySelector('.preview-shell');
 new MutationObserver(()=>{if(settings.hidden||shell.hidden){generation++;clear();$('api-draft-list').replaceChildren();$('api-draft-status').textContent='';}}).observe(settings,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(()=>{if(shell.hidden){generation++;clear();$('api-business').value='';$('api-draft-list').replaceChildren();}}).observe(shell,{attributes:true,attributeFilter:['hidden']});
 renderFields();
})();
