'use strict';
(()=>{
 const el=id=>document.getElementById(id),node=(tag,css,text)=>makeElement(tag,css,text);
 const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'});
 const today=()=>dayFormatter.format(new Date());
 let renderedToday='',saving=false,editing=null;
 const form=el('month-create-form');
 const editor=document.createElement('dialog');editor.id='month-editor';editor.className='calendar-editor';editor.setAttribute('aria-labelledby','month-editor-title');
 const heading=node('h2','','일정 · 이벤트 등록');heading.id='month-editor-title';editor.append(heading,form);document.body.append(editor);
 function closeEditor(){if(saving)return;editor.close();el('month-compose').open=false;}
 editor.addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
 function openEditor(row=null){if(saving)return;editing=row?.id?row:null;form.reset();el('month-gift-tiers').replaceChildren();el('month-add-tier').disabled=false;el('month-create-save').disabled=false;heading.textContent=editing?'일정 · 이벤트 수정':'일정 · 이벤트 등록';el('month-create-date').value=editing?.date||selected;el('month-create-end').value=editing?.endDate||selected;if(editing){for(const key of ['title','body','time','type'])el('month-create-'+key).value=editing[key]||'';el('month-event-color').value=editing.eventColor||'BLUE';typeChanged();for(const tier of editing.giftTiers||[]){el('month-add-tier').click();const fields=el('month-gift-tiers').lastElementChild;for(const input of fields.querySelectorAll('input'))input.value=tier[input.dataset.giftField]??'';}}typeChanged();renderGiftPreview();el('month-create-status').textContent=editing?'수정 후 같은 이벤트에 저장됩니다.':'하린식품 서버에 저장하며 웹허브 캘린더에도 반영됩니다.';el('month-compose').open=true;if(!editor.open)editor.showModal();el('month-create-title').focus();}
 el('month-add-selected').onclick=openEditor;
 function typeChanged(){const event=el('month-create-type').value==='EVENT',memo=el('month-create-type').value==='MEMO';el('month-event-fields').hidden=!event;el('month-event-fields').querySelectorAll('input,select,button').forEach(el=>el.disabled=!event);el('month-end-label').hidden=memo;el('month-create-time').disabled=event||memo;el('month-create-time').closest('label').hidden=event||memo;el('month-create-body').maxLength=event?2000:4000;el('month-create-save').textContent=editing?'수정 저장':event?'이벤트 등록':'일정 등록';}
 el('month-create-type').onchange=typeChanged;
 el('month-create-date').onchange=()=>{if(el('month-create-end').value<el('month-create-date').value)el('month-create-end').value=el('month-create-date').value;};
 el('month-add-tier').onclick=()=>{if(el('month-gift-tiers').children.length>=10)return;const row=node('div','gift-tier');
 for(const [key,label,type,min,max] of [['minimumAmount','이상 금액','number',1,100000000],['maximumAmount','이하 금액 (선택)','number',1,100000000],['giftName','사은품 이름','text'],['quantity','수량','number',1,99]]){const l=node('label','',label),input=document.createElement('input');input.dataset.giftField=key;input.type=type;if(min){input.min=min;input.max=max;input.step='1';}else input.maxLength=120;input.required=key!=='maximumAmount';if(key==='quantity')input.value='1';l.append(input);row.append(l);}
 const remove=node('button','','삭제');remove.type='button';remove.onclick=()=>{row.remove();el('month-add-tier').disabled=false;renderGiftPreview();};row.append(remove);el('month-gift-tiers').append(row);el('month-add-tier').disabled=el('month-gift-tiers').children.length>=10;};
 const preview=node('div','event-gift-preview');el('month-event-fields').append(preview);form.addEventListener('input',renderGiftPreview);
 function renderGiftPreview(){preview.replaceChildren(node('strong','','자동 판정 미리보기'));const rows=[...el('month-gift-tiers').children];for(const row of rows){const get=k=>row.querySelector('[data-gift-field="'+k+'"]').value;const min=Number(get('minimumAmount')),max=Number(get('maximumAmount')),name=get('giftName').trim(),qty=Number(get('quantity'));if(min>0&&name&&qty>0&&(!max||max>=min))preview.append(node('p','',min.toLocaleString('ko-KR')+'원 이상'+(max?' ~ '+max.toLocaleString('ko-KR')+'원 이하':'')+' → '+name+' '+qty+'개'));}if(preview.children.length===1)preview.append(node('p','','금액과 사은품을 입력하면 적용 조건이 표시됩니다.'));}
 function syncToday(){const current=today();if(current===renderedToday)return;document.querySelectorAll('[data-calendar-day]').forEach(button=>button.classList.toggle('is-today',button.dataset.calendarDay===current));renderedToday=current;}
 let month=today().slice(0,7),selected=today(),value=null,busy=false,generation=0,lastAttempt=0,state='ALL';
 const matches=row=>state==='ALL'||row.status===state;
 function render(){
  const currentDay=today();renderedToday=currentDay;
  el('month-page').setAttribute('aria-busy',String(busy));
  document.querySelectorAll('[data-month-state]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.monthState===state));b.disabled=busy||!value;});
  el('month-filter-count').textContent=busy?'일정 조회 중':value?(value.entries.filter(matches).length+' / '+value.entries.length+'개 일정 · '+(value.complete===true?'조회 범위 확인':'전체 일정 여부 확인 필요')):'일정 확인 필요';
  el('month-label').textContent=month.replace('-','년 ')+'월';
  for(const id of ['month-prev','month-next','month-refresh','month-today'])el(id).disabled=busy||displayMode!=='live';
  el('month-prev').disabled||=month==='2000-01';el('month-next').disabled||=month==='2099-12';
  const start=new Date(month+'-01T00:00:00Z').getUTCDay(),days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate(),cells=[];
  for(let i=0;i<start;i++)cells.push(node('span','month-spacer',''));
  for(let d=1;d<=days;d++){
   const date=month+'-'+String(d).padStart(2,'0'),button=node('button','month-day'),rows=(value?.entries||[]).filter(row=>matches(row)&&row.date<=date&&row.endDate>=date);
   button.type='button';button.dataset.calendarDay=date;button.dataset.weekday=String(new Date(date+'T00:00:00Z').getUTCDay());button.ondblclick=()=>{selected=date;openEditor();};button.setAttribute('aria-pressed',String(date===selected));button.setAttribute('aria-label',date+(value?` 일정 ${rows.length}개`:' 조회 전'));
   button.append(node('strong','',String(d)),node('small','',value?(rows.length?`${rows.length}개 일정`:''):'—'));
   const holidays=(value?.holidays||[]).filter(row=>row.date===date);
   button.dataset.holiday=String(holidays.length>0);
   for(const item of rows.filter(r=>r.type==='EVENT').slice(0,2)){const chip=node('span','month-event-chip',item.title);chip.dataset.eventColor=item.eventColor;button.append(chip);}
   if(holidays.length){button.append(node('small','month-holiday',holidays.map(row=>row.name).join(' · ')));button.setAttribute('aria-label',button.getAttribute('aria-label')+' · '+holidays.map(row=>row.name).join(' · '));}
   if(date===currentDay)button.classList.add('is-today');
   button.addEventListener('click',()=>{selected=date;el('month-detail').replaceChildren();render();Array.from(document.querySelectorAll('[data-calendar-day]')).find(b=>b.dataset.calendarDay===date)?.focus();});
   cells.push(button);
  }
  el('month-grid').replaceChildren(...cells);el('month-selected').textContent=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'UTC'}).format(new Date(selected+'T00:00:00Z'))+' 일정';
  const rows=(value?.entries||[]).filter(row=>matches(row)&&row.date<=selected&&row.endDate>=selected).sort((a,b)=>a.time.localeCompare(b.time));
  el('month-entries').replaceChildren(...(rows.length?rows.map(row=>{
   const button=node('button','month-entry');button.type='button';button.dataset.type=row.type;button.append(node('span','',row.time||'종일'),node('strong','',row.title),node('small','',(row.status==='DONE'?'완료':'진행 중')+' · '+({SCHEDULE:'일정',MEMO:'메모',EVENT:'행사'})[row.type]));
button.addEventListener('click',()=>{el('month-detail').replaceChildren(node('h3','',row.title),node('p','',row.date+' — '+row.endDate),node('p','',(row.time||'종일')+' · '+({SCHEDULE:'일정',MEMO:'메모',EVENT:'행사'})[row.type]),node('p','',row.status==='DONE'?'완료된 일정':'진행 중인 일정'),node('p','month-body',row.body||'등록된 본문이 없습니다.'),node('p','',''));const edit=node('button','calendar-edit-entry','일정 · 이벤트 수정');edit.type='button';edit.onclick=()=>openEditor(row);edit.disabled=row.eventConfigInvalid===true;el('month-detail').append(edit);if(row.type==='EVENT'){el('month-detail').append(node('strong','event-state',row.eventConfigInvalid?'이벤트 설정 확인 필요':({ACTIVE:'적용 중',UPCOMING:'시작 전',ENDED:'종료',INACTIVE:'비활성'})[row.eventState]||'적용 상태 확인 필요'));for(const tier of row.giftTiers||[])el('month-detail').append(node('p','gift-condition',tier.minimumAmount.toLocaleString('ko-KR')+'원 이상'+(tier.maximumAmount?' ~ '+tier.maximumAmount.toLocaleString('ko-KR')+'원 이하':'')+' · '+tier.giftName+' '+tier.quantity+'개'));};});return button;
  }):[node('p','',value?(state==='ALL'?'선택한 날짜에 조회된 일정이 없습니다.':'선택한 상태에 맞는 일정이 없습니다. 전체 필터에서 확인해 주세요.'):'일정을 조회한 뒤 확인할 수 있습니다.')]));
  window.moaonTeam?.decorateCalendar();
 }
 function clear(){editing=null;editor.close();el('month-gift-tiers').replaceChildren();form.reset();typeChanged();form.querySelector('fieldset').disabled=false;el('month-create-save').disabled=false;el('month-compose').open=false;saving=false;el('month-create-status').textContent='하린식품 서버에 저장하며 웹허브 캘린더에도 반영됩니다.';state='ALL';generation++;value=null;busy=false;lastAttempt=0;month=today().slice(0,7);selected=today();el('month-detail').replaceChildren();el('month-status').textContent='실제 사업장 연결 후 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const token=++generation,requested=month;busy=true;value=null;lastAttempt=Date.now();el('month-detail').replaceChildren();el('month-status').textContent='월간 일정을 조회하고 있습니다…';render();
  try{const result=await window.moaonHub.readCalendarMonth(requested);if(token!==generation)return;
   if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'||result.month!==requested){el('month-status').textContent='일정 조회 실패 · 새로 조회해 주세요. 조회 한도에 도달한 경우도 표시하지 않습니다.';return;}
   value=result;el('month-status').textContent=`${result.entries.length}개 일정 · 서버 일정 · ${result.holidayReady?'공휴일 자료 확인':'공휴일 자료 확인 필요'} · ${result.complete===true?'조회 범위 확인':result.complete===false?'일부 일정만 조회됨 · 조회 한도 확인 필요':'일정 전량 조회 여부 확인 필요'}`;
  }catch{if(token===generation)el('month-status').textContent='일정 조회 실패 · 새로 조회해 주세요.';}
  finally{if(token===generation){busy=false;render();}}
 }
 el('month-compose').addEventListener('toggle',()=>{if(el('month-compose').open&&!editor.open)openEditor();});
 el('month-create-cancel').onclick=closeEditor;
 form.addEventListener('submit',async event=>{event.preventDefault();if(saving)return;if(displayMode!=='live'){el('month-create-status').textContent='실제 사업장 연결 후 등록하세요.';return;}
 const input={title:el('month-create-title').value.trim(),body:el('month-create-body').value,date:el('month-create-date').value,time:el('month-create-time').value,type:el('month-create-type').value};if(!input.title)return;if(editing){input.id=editing.id;input.sourceMonth=month;}
 if(input.type!=='SCHEDULE')input.time='';
 if(input.type!=='MEMO'&&el('month-create-end').value&&el('month-create-end').value!==input.date)input.endDate=el('month-create-end').value;
 if(input.type==='EVENT'){input.eventColor=el('month-event-color').value;input.giftTiers=[...el('month-gift-tiers').children].map(row=>{const get=key=>row.querySelector('[data-gift-field="'+key+'"]').value;return {minimumAmount:Number(get('minimumAmount')),...(get('maximumAmount')?{maximumAmount:Number(get('maximumAmount'))}:{}),giftName:get('giftName').trim(),quantity:Number(get('quantity'))};}).sort((a,b)=>a.minimumAmount-b.minimumAmount);}
 if(input.endDate&&input.endDate<input.date){el('month-create-status').textContent='종료일은 시작일 이후로 선택하세요.';return;}
 const affectsOrders=input.type==='EVENT'||editing?.type==='EVENT';const expected=generation;saving=true;form.querySelector('fieldset').disabled=true;form.setAttribute('aria-busy','true');el('month-create-status').textContent='등록 내용을 확인하고 있습니다…';
 try{const result=await window.moaonHub.createCalendarEntry(input);if(expected!==generation)return;
 if(result?.status==='SAVED'){editing=null;form.reset();el('month-gift-tiers').replaceChildren();typeChanged();el('month-add-tier').disabled=false;month=input.date.slice(0,7);selected=input.date;state='ALL';calendarLastAttempt=0;calendarAttemptDate='';await refresh();overviewLastAttempt=0;const savedGeneration=generation;let orderNote='';if(affectsOrders){if(orderToolsBusy())orderNote=' 출고 작업 후 주문을 새로 조회하세요.';else try{const updated=await window.moaonHub.recheckPage();if(savedGeneration!==generation||displayMode!=='live')return;if(['READY','PARTIAL'].includes(updated?.status))applyHubResult(updated);else orderNote=' 주문 목록은 새로 조회해야 합니다.';}catch{orderNote=' 주문 목록은 새로 조회해야 합니다.';}}editor.close();el('month-compose').open=false;el('month-create-status').textContent='일정이 저장되었습니다. 선택한 날짜에서 확인하세요.';el('month-status').textContent=(input.type==='EVENT'?'이벤트가 저장되었습니다. 기간·금액 조건은 주문 조회 시 서버에서 적용됩니다.':'일정이 저장되었습니다.')+orderNote+' '+el('month-status').textContent;}
 else{el('month-create-status').textContent=({CANCELLED:'등록을 취소했습니다.',RESULT_UNKNOWN:'저장 결과를 확인하지 못했습니다. 중복 등록을 막기 위해 재등록을 잠갔습니다. 새로 조회하여 일정을 먼저 확인하세요.',RATE_LIMITED:'요청이 많습니다. 잠시 뒤 다시 등록하세요.',LOGIN_REQUIRED:'로그인이 필요합니다.',FORBIDDEN:'저장 권한을 확인하세요.'})[result?.status]||'일정을 저장하지 못했습니다. 연결 상태와 입력 내용을 확인하세요.';if(result?.status==='RESULT_UNKNOWN')el('month-create-save').disabled=true;}
 }catch{if(expected===generation)el('month-create-status').textContent='저장 결과 확인 필요 · 일정을 새로 조회한 뒤 확인하세요.';}
 finally{saving=false;form.querySelector('fieldset').disabled=false;form.setAttribute('aria-busy','false');}
 });
 function move(delta){if(busy)return;const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);const next=date.toISOString().slice(0,7);if(next<'2000-01'||next>'2099-12')return;month=next;selected=next+'-01';void refresh();}
 el('month-prev').addEventListener('click',()=>move(-1));el('month-next').addEventListener('click',()=>move(1));el('month-refresh').addEventListener('click',refresh);
 el('month-today').addEventListener('click',()=>{const target=today();selected=target;el('month-detail').replaceChildren();if(month===target.slice(0,7)&&value){render();return;}month=target.slice(0,7);void refresh();});
 document.querySelectorAll('[data-month-state]').forEach(b=>b.onclick=()=>{state=b.dataset.monthState;el('month-detail').replaceChildren();render();});
 window.moaonMonth=Object.freeze({clear,ensure:()=>{if(displayMode==='live'&&(!lastAttempt||Date.now()-lastAttempt>=60000))void refresh();else syncToday();}});clear();
})();
