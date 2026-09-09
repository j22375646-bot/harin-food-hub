'use strict';
(()=>{
 const $=id=>document.getElementById(id),labels={NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24',INQUIRY:'문의',CANCEL:'취소',RETURN:'반품',EXCHANGE:'교환'};
 let value=null,busy=false,generation=0,selected=null,pageIndex=0;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const reference=row=>row.id.split(':').slice(2).join(':')||row.id;
 function close(){const previous=selected;selected=null;render();Array.from($('cs-list').querySelectorAll('button')).find(b=>b.dataset.id===previous)?.focus();}
 function render(){
  $('cs-refresh').disabled=busy||displayMode!=='live';
  const rows=(value?.items||[]).filter(r=>($('cs-platform').value==='ALL'||r.platform===$('cs-platform').value)&&($('cs-kind').value==='ALL'||r.kind===$('cs-kind').value)&&r.id.toLowerCase().includes($('cs-search').value.trim().toLowerCase()));
  rows.sort((a,b)=>{if(!a.occurredAt||!b.occurredAt)return Number(!a.occurredAt)-Number(!b.occurredAt)||a.id.localeCompare(b.id);return ($('cs-sort').value==='OLDEST'?1:-1)*(Date.parse(a.occurredAt)-Date.parse(b.occurredAt))||a.id.localeCompare(b.id);});
  const pages=Math.ceil(rows.length/25);pageIndex=Math.min(pageIndex,Math.max(0,pages-1));const visible=rows.slice(pageIndex*25,pageIndex*25+25);
  if(!visible.some(r=>r.id===selected))selected=null;
  $('cs-page-label').textContent=pages?`${pageIndex+1} / ${pages}쪽 · 25건씩 표시`:'표시할 접수 없음';$('cs-prev').disabled=busy||pageIndex===0;$('cs-next').disabled=busy||pageIndex>=pages-1;
  $('cs-count').textContent=value?`조회된 미처리 ${value.items.length}건 · 현재 조건 ${rows.length}건${value.truncated?' · 일부 자료만 표시':''}`:'미처리 건수 확인 필요';
  $('cs-list').replaceChildren(...(visible.length?visible.map(r=>{const b=node('button','');b.type='button';b.dataset.id=r.id;b.className='cs-row';b.setAttribute('aria-expanded',String(r.id===selected));b.setAttribute('aria-controls','cs-detail');b.append(node('strong',`${labels[r.platform]} · ${labels[r.kind]}`),node('span','접수 번호 '+reference(r)),node('span','처리 상태 '+r.status),node('small',r.occurredAt?formatTime(r.occurredAt):'접수 시각 확인 필요'));b.onclick=()=>{selected=r.id;render();$('cs-detail').querySelector('button').focus({preventScroll:true});$('cs-detail').scrollIntoView({block:'start'});};return b;}):[node('p',value?'현재 조회 범위에서 조건에 맞는 미처리 건이 없습니다.':'연결 후 새로 조회해 주세요.')]));
  const row=rows.find(r=>r.id===selected),panel=$('cs-detail');panel.hidden=!row;panel.parentElement.dataset.detailOpen=String(Boolean(row));panel.replaceChildren();if(!row)return;

  const button=node('button','목록으로');button.type='button';button.onclick=close;
  const heading=node('header','');heading.className='cs-detail-heading';const title=node('div','');title.append(node('h2',labels[row.platform]+' · '+labels[row.kind]),node('p','접수 번호 '+reference(row)));heading.append(title,button);
  const facts=node('dl','');facts.className='cs-facts';facts.append(node('dt','원본 처리 상태'),node('dd',row.status),node('dt','접수 시각'),node('dd',row.occurredAt?formatTime(row.occurredAt):'확인 필요'));
  panel.append(heading,facts,node('p','미처리 판정은 웹허브의 채널별 규칙을 사용합니다. 조회만으로 처리가 완료되지 않습니다.'));

 }
 function clear(){pageIndex=0;$('cs-sort').value='NEWEST';generation++;value=null;busy=false;selected=null;$('cs-platform').value='ALL';$('cs-kind').value='ALL';$('cs-search').value='';$('cs-status').textContent='실제 사업장 연결 후 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const expected=++generation;busy=true;value=null;selected=null;pageIndex=0;render();$('cs-status').textContent='저장된 고객·CS 자료를 조회하고 있습니다…';
  try{const result=await window.moaonHub.readCs();if(expected!==generation)return;if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'){$('cs-status').textContent='고객·CS 조회 실패 · 자료를 다시 확인해 주세요.';return;}value=result;$('cs-status').textContent=`조회 시각 ${formatTime(result.generatedAt)} · 실시간 수집 상태는 별도 확인${result.truncated?' · 조회 상한에 도달해 전체 건수가 아닙니다.':''}`;
  }catch{if(expected===generation)$('cs-status').textContent='고객·CS 조회 실패 · 다시 시도해 주세요.';}
  finally{if(expected===generation){busy=false;render();}}
 }
 const filter=()=>{pageIndex=0;selected=null;render();};
 $('cs-prev').onclick=()=>{if(pageIndex>0){pageIndex--;selected=null;render();}};$('cs-next').onclick=()=>{pageIndex++;selected=null;render();};
 for(const id of ['cs-platform','cs-kind','cs-sort'])$(id).addEventListener('change',filter);$('cs-search').addEventListener('input',filter);$('cs-refresh').onclick=refresh;
 $('cs-detail').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
 window.moaonCs=Object.freeze({clear,ensure:()=>{render();if(!value&&!busy)void refresh();}});clear();
})();
