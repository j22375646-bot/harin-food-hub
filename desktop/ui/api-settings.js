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
 function renderFields(){
  clear();$('api-fields').replaceChildren(...fields[$('api-provider').value].map(([name,label])=>{
   const wrapper=text('label',label),input=document.createElement('input');input.name=name;input.type=/secret|key/i.test(name)?'password':'text';input.required=true;input.maxLength=2048;input.autocomplete='off';input.spellcheck=false;wrapper.append(input);return wrapper;
  }));
 }
 function renderList(rows){
  $('api-draft-list').replaceChildren(...(rows.length?rows.map(row=>{
   const item=document.createElement('li');item.append(text('strong',row.business+' · '+row.provider),text('small','이 PC에 저장됨 · 연결 검증 전'));
   const remove=text('button','저장한 키 삭제');remove.type='button';remove.addEventListener('click',async()=>{
    if(busy||!window.confirm(`${row.business}의 ${row.provider} 저장 키를 이 PC에서 삭제할까요? 실제 서버 연결은 변경되지 않습니다.`))return;
    busy=true;remove.disabled=true;const token=generation;try{const rows=await window.moaonHub.removeApiDraft({business:row.business,provider:row.provider});if(token===generation)renderList(rows);}catch{if(token===generation)$('api-draft-status').textContent='삭제하지 못했습니다. 다시 시도하세요.';}finally{busy=false;remove.disabled=false;}
   });item.append(remove);return item;
  }):[text('li','이 PC에 저장한 새 사업장 설정이 없습니다.')]));
 }
 $('api-source').addEventListener('change',()=>{generation++;clear();$('api-draft-form').hidden=$('api-source').value!=='new';$('api-existing').hidden=$('api-source').value==='new';$('api-draft-status').textContent='';});
 $('api-provider').addEventListener('change',renderFields);
 $('api-draft-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const token=generation;
  const input={business:$('api-business').value.trim(),provider:$('api-provider').value,fields:Object.fromEntries([...$('api-fields').querySelectorAll('input')].map(el=>[el.name,el.value]))};
  $('api-draft-save').disabled=true;$('api-draft-status').textContent='암호화 저장 중…';
  try{await window.moaonHub.saveApiDraft(input);if(token===generation)$('api-draft-status').textContent='이 PC에 암호화 저장됨 · 연결 검증 전. 아직 주문 수집에 사용되지 않습니다.';}
  catch{if(token===generation)$('api-draft-status').textContent='저장하지 못했습니다. 필수값과 Windows 암호화 사용 가능 여부를 확인하세요.';}
  finally{Object.keys(input.fields).forEach(k=>input.fields[k]='');clear();busy=false;$('api-draft-save').disabled=false;}
 });
 $('api-draft-load').addEventListener('click',async()=>{if(busy)return;busy=true;const token=generation;try{const rows=await window.moaonHub.listApiDrafts();if(token===generation)renderList(rows);}catch{$('api-draft-status').textContent='저장 자료를 읽지 못했습니다. 기존 자료는 덮어쓰지 않습니다.';}finally{busy=false;}});
 const settings=document.querySelector('[data-page="settings"]'),shell=document.querySelector('.preview-shell');
 new MutationObserver(()=>{if(settings.hidden||shell.hidden){generation++;clear();$('api-draft-list').replaceChildren();$('api-draft-status').textContent='';}}).observe(settings,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(()=>{if(shell.hidden){generation++;clear();$('api-business').value='';$('api-draft-list').replaceChildren();}}).observe(shell,{attributes:true,attributeFilter:['hidden']});
 renderFields();
})();
