'use strict';
(()=>{
 const el=id=>document.getElementById(id),node=(tag,css,text)=>makeElement(tag,css,text);
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 let month=today().slice(0,7),selected=today(),value=null,busy=false,generation=0,lastAttempt=0,state='ALL';
 const matches=row=>state==='ALL'||row.status===state;
 function render(){
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
   button.type='button';button.dataset.calendarDay=date;button.setAttribute('aria-pressed',String(date===selected));button.setAttribute('aria-label',date+(value?` 일정 ${rows.length}개`:' 조회 전'));
   button.append(node('strong','',String(d)),node('small','',value?(rows.length?`${rows.length}개 일정`:''):'—'));
   const holidays=(value?.holidays||[]).filter(row=>row.date===date);
   if(holidays.length)button.append(node('small','month-holiday',holidays.map(row=>row.name).join(' · ')));
   if(date===today())button.classList.add('is-today');
   button.addEventListener('click',()=>{selected=date;el('month-detail').replaceChildren();render();Array.from(document.querySelectorAll('[data-calendar-day]')).find(b=>b.dataset.calendarDay===date)?.focus();});
   cells.push(button);
  }
  el('month-grid').replaceChildren(...cells);el('month-selected').textContent=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long',timeZone:'UTC'}).format(new Date(selected+'T00:00:00Z'))+' 일정';
  const rows=(value?.entries||[]).filter(row=>matches(row)&&row.date<=selected&&row.endDate>=selected).sort((a,b)=>a.time.localeCompare(b.time));
  el('month-entries').replaceChildren(...(rows.length?rows.map(row=>{
   const button=node('button','month-entry');button.type='button';button.append(node('span','',row.time||'종일'),node('strong','',row.title),node('small','',(row.status==='DONE'?'완료':'진행 중')+' · '+({SCHEDULE:'일정',MEMO:'메모',EVENT:'행사'})[row.type]));
button.addEventListener('click',()=>{el('month-detail').replaceChildren(node('h3','',row.title),node('p','',row.date+' — '+row.endDate),node('p','',(row.time||'종일')+' · '+({SCHEDULE:'일정',MEMO:'메모',EVENT:'행사'})[row.type]),node('p','',row.status==='DONE'?'완료된 일정':'진행 중인 일정'),node('p','month-body',row.body||'등록된 본문이 없습니다.'),node('p','','조회 전용 · 일정 편집은 아직 지원하지 않습니다.'));});return button;
  }):[node('p','',value?(state==='ALL'?'선택한 날짜에 조회된 일정이 없습니다.':'선택한 상태에 맞는 일정이 없습니다. 전체 필터에서 확인해 주세요.'):'일정을 조회한 뒤 확인할 수 있습니다.')]));
 }
 function clear(){state='ALL';generation++;value=null;busy=false;lastAttempt=0;month=today().slice(0,7);selected=today();el('month-detail').replaceChildren();el('month-status').textContent='실제 사업장 연결 후 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const token=++generation,requested=month;busy=true;value=null;lastAttempt=Date.now();el('month-detail').replaceChildren();el('month-status').textContent='월간 일정을 조회하고 있습니다…';render();
  try{const result=await window.moaonHub.readCalendarMonth(requested);if(token!==generation)return;
   if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'||result.month!==requested){el('month-status').textContent='일정 조회 실패 · 새로 조회해 주세요. 조회 한도에 도달한 경우도 표시하지 않습니다.';return;}
   value=result;el('month-status').textContent=`${result.entries.length}개 일정 · 읽기 전용 · ${result.holidayReady?'공휴일 자료 확인':'공휴일 자료 확인 필요'} · ${result.complete===true?'조회 범위 확인':result.complete===false?'일부 일정만 조회됨 · 조회 한도 확인 필요':'일정 전량 조회 여부 확인 필요'}`;
  }catch{if(token===generation)el('month-status').textContent='일정 조회 실패 · 새로 조회해 주세요.';}
  finally{if(token===generation){busy=false;render();}}
 }
 function move(delta){if(busy)return;const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);const next=date.toISOString().slice(0,7);if(next<'2000-01'||next>'2099-12')return;month=next;selected=next+'-01';void refresh();}
 el('month-prev').addEventListener('click',()=>move(-1));el('month-next').addEventListener('click',()=>move(1));el('month-refresh').addEventListener('click',refresh);
 el('month-today').addEventListener('click',()=>{const target=today();selected=target;el('month-detail').replaceChildren();if(month===target.slice(0,7)&&value){render();return;}month=target.slice(0,7);void refresh();});
 document.querySelectorAll('[data-month-state]').forEach(b=>b.onclick=()=>{state=b.dataset.monthState;el('month-detail').replaceChildren();render();});
 window.moaonMonth=Object.freeze({clear,ensure:()=>{render();if(displayMode==='live'&&(!lastAttempt||Date.now()-lastAttempt>=60000))void refresh();}});clear();
})();
