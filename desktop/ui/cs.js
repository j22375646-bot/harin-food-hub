'use strict';
(()=>{
 const $=id=>document.getElementById(id),labels={NAVER:'네이버',COUPANG:'쿠팡',CAFE24:'Cafe24',INQUIRY:'문의',CANCEL:'취소',RETURN:'반품',EXCHANGE:'교환'};
 let value=null,busy=false,generation=0,selected=null,pageIndex=0,failed=false;
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const contentLabel=d=>!d?'본문 조회 연결 대기':d.status==='UNAVAILABLE'?'내용 복원 실패':d.status==='MISSING'?'저장 내용 확인 필요':d.truncated?'일부 내용 조회됨':'저장 내용 조회됨';
 const contentState=d=>!d?'LEGACY':d.status==='UNAVAILABLE'?'ERROR':d.status==='MISSING'?'MISSING':d.truncated?'PARTIAL':'READY';
 const reference=row=>row.id.split(':').slice(2).join(':')||row.id;
 function emptyState(){
  const box=node('div','');box.className='cs-empty';
  const title=busy?'미처리 접수를 조회하고 있습니다':failed?'고객·CS를 불러오지 못했습니다':value?(value.items.length?'조건에 맞는 미처리 접수가 없습니다':'현재 조회 범위에 미처리 접수가 없습니다'):'고객·CS 조회를 준비해 주세요';
  const help=busy?'채널에 저장된 접수 자료를 확인하고 있습니다.':failed?'연결 상태를 확인한 뒤 다시 조회해 주세요. 조회 실패는 미처리 0건을 뜻하지 않습니다.':value?(value.items.length?'검색어·채널·접수 유형·내용 상태를 바꾸거나 조건을 초기화해 주세요.':'실시간 접수 여부와 처리가 끝난 접수는 원본 채널에서 확인해 주세요.'):'실제 사업장에 연결하면 저장된 미처리 접수를 조회할 수 있습니다.';
  box.append(node('h2',title),node('p',help));
  if(value?.truncated)box.append(node('p','일부 자료만 조회되어 검색 결과와 건수는 전체 접수를 대표하지 않습니다.'));
  if(!busy&&value?.items.length){const reset=node('button','조건 초기화');reset.type='button';reset.onclick=()=> $('cs-reset').click();box.append(reset);}
  else if(!busy&&displayMode==='live'&&(failed||value)){const retry=node('button','다시 조회');retry.type='button';retry.onclick=refresh;box.append(retry);}
  return box;
 }
 function close(){const previous=selected;selected=null;render();Array.from($('cs-list').querySelectorAll('button')).find(b=>b.dataset.id===previous)?.focus();}
 function render(){
  $('cs-refresh').disabled=busy||displayMode!=='live';
  $('cs-reset').disabled=busy||(['cs-platform','cs-kind','cs-content-filter'].every(id=>$(id).value==='ALL')&&$('cs-sort').value==='NEWEST'&&!$('cs-search').value);
  const term=$('cs-search').value.trim().toLocaleLowerCase('ko-KR');
  const rows=(value?.items||[]).filter(r=>($('cs-platform').value==='ALL'||r.platform===$('cs-platform').value)&&($('cs-kind').value==='ALL'||r.kind===$('cs-kind').value)&&($('cs-content-filter').value==='ALL'||contentState(r.details)===$('cs-content-filter').value)&&[r.id,r.details?.title,r.details?.body,...(r.details?.history||[]).map(e=>e.content)].some(s=>typeof s==='string'&&s.toLocaleLowerCase('ko-KR').includes(term)));
  const loaded=value?.items||[],detailed=loaded.filter(r=>r.details),available=detailed.filter(r=>r.details.status==='AVAILABLE');
  $('cs-search-scope').textContent=busy?'자료를 조회한 뒤 검색 범위를 확인합니다.':failed?'조회 실패로 검색 가능한 자료를 확인할 수 없습니다.':!value?'조회 전에는 검색 가능한 자료를 확인할 수 없습니다.':!loaded.length?'조회된 미처리 접수가 없습니다.':!detailed.length?'검색 범위: 접수 번호. 본문·이력 검색은 서버 반영 후 사용할 수 있습니다.':'검색 범위: 조회된 접수 번호·제목·본문·이력. 잘린 내용은 검색되지 않습니다.';
  $('cs-content-summary').hidden=!loaded.length;
  $('cs-content-summary').textContent=loaded.length?'내용 조회 '+available.length+'건 · 내용 확인 필요 '+(detailed.length-available.length)+'건 · 본문 연결 대기 '+(loaded.length-detailed.length)+'건':'';
  rows.sort((a,b)=>{if(!a.occurredAt||!b.occurredAt)return Number(!a.occurredAt)-Number(!b.occurredAt)||a.id.localeCompare(b.id);return ($('cs-sort').value==='OLDEST'?1:-1)*(Date.parse(a.occurredAt)-Date.parse(b.occurredAt))||a.id.localeCompare(b.id);});
  const pages=Math.ceil(rows.length/25);pageIndex=Math.min(pageIndex,Math.max(0,pages-1));const visible=rows.slice(pageIndex*25,pageIndex*25+25);
  if(!visible.some(r=>r.id===selected))selected=null;
  $('cs-page-label').textContent=busy?'접수 조회 중':!value?'조회 후 페이지 표시':pages?`${pageIndex+1} / ${pages}쪽 · 25건씩 표시`:'표시할 접수 없음';$('cs-prev').disabled=busy||pageIndex===0;$('cs-next').disabled=busy||pageIndex>=pages-1;
  $('cs-count').textContent=busy?'미처리 건수 조회 중':value?`조회된 미처리 ${value.items.length}건 · 현재 조건 ${rows.length}건${value.truncated?' · 일부 자료만 표시':''}`:'미처리 건수 확인 필요';
  $('cs-list').replaceChildren(...(visible.length?visible.map(r=>{const b=node('button','');b.type='button';b.dataset.id=r.id;b.className='cs-row';b.setAttribute('aria-expanded',String(r.id===selected));b.setAttribute('aria-controls','cs-detail');b.append(node('strong',`${labels[r.platform]} · ${labels[r.kind]}`),node('span','접수 번호 '+reference(r)),node('span','처리 상태 '+r.status),node('small',r.occurredAt?formatTime(r.occurredAt):'접수 시각 확인 필요'));const contentState=node('span',contentLabel(r.details));contentState.className='cs-content-state';b.append(contentState);const subject=node('span',r.details?.title||'접수 상세 보기');subject.className='cs-row-title';b.append(subject);b.children[0].className='cs-row-channel';b.children[1].className='cs-row-reference';b.children[2].className='cs-row-status';b.children[3].className='cs-row-time';b.onclick=()=>{selected=r.id;render();$('cs-detail').querySelector('button').focus({preventScroll:true});$('cs-detail').scrollIntoView({block:'start'});};return b;}):[emptyState()]));
  const row=rows.find(r=>r.id===selected),panel=$('cs-detail');panel.hidden=!row;panel.parentElement.dataset.detailOpen=String(Boolean(row));panel.replaceChildren();if(!row)return;

  const button=node('button','목록으로');button.type='button';button.onclick=close;
  const heading=node('header','');heading.className='cs-detail-heading';const title=node('div','');title.append(node('h2',labels[row.platform]+' · '+labels[row.kind]),node('p','접수 번호 '+reference(row)));heading.append(title,button);
  const index=rows.findIndex(r=>r.id===selected),nav=node('nav','');nav.className='cs-detail-nav';nav.setAttribute('aria-label','검색 결과 접수 이동');
  const previous=node('button','이전 접수'),next=node('button','다음 접수'),position=node('span',`${index+1} / ${rows.length}건`);position.setAttribute('aria-live','polite');previous.type=next.type='button';previous.id='cs-detail-prev';next.id='cs-detail-next';previous.disabled=index===0;next.disabled=index===rows.length-1;
  const move=offset=>{const target=index+offset;if(target<0||target>=rows.length)return;selected=rows[target].id;pageIndex=Math.floor(target/25);render();const control=$(offset>0?'cs-detail-next':'cs-detail-prev');(control.disabled?$('cs-detail').querySelector('button'):control).focus({preventScroll:true});$('cs-detail').scrollIntoView({block:'start'});};
  previous.onclick=()=>move(-1);next.onclick=()=>move(1);nav.append(previous,position,next);
  const facts=node('dl','');facts.className='cs-facts';facts.append(node('dt','원본 처리 상태'),node('dd',row.status),node('dt','접수 시각'),node('dd',row.occurredAt?formatTime(row.occurredAt):'확인 필요'));
  panel.append(heading,nav,facts,node('p','미처리 판정은 웹허브의 채널별 규칙을 사용합니다. 조회만으로 처리가 완료되지 않습니다.'));
  const d=row.details,content=node('section','');content.className='cs-content';content.append(node('h3','접수 내용'));
  if(!d)content.append(node('p','본문 조회 기능의 서버 반영이 필요합니다.'));
  else if(d.status!=='AVAILABLE')content.append(node('p',d.status==='UNAVAILABLE'?'내용 복원 실패 · 원문 확인 필요':'저장된 본문 확인 필요'));
  else{
   if(d.title)content.append(node('h4',d.title));content.append(node('p',d.body||'문의 본문 확인 필요'),node('h3','저장된 상담·답변 이력'));
   if(!d.history.length)content.append(node('p','조회 가능한 이력이 없습니다. 답변 여부는 원본 처리 상태를 확인해 주세요.'));
   for(const entry of d.history){const article=node('article','');article.append(node('small',entry.occurredAt?formatTime(entry.occurredAt):'기록 시각 확인 필요'),node('p',entry.content||'기록 내용 확인 필요'));content.append(article);}
   if(d.truncated)content.append(node('p','긴 내용 또는 이력이 일부만 표시됩니다. 원본 채널에서 전체 내용을 확인해 주세요.'));
  }
  if(d)content.append(node('small',d.updatedAt?'원본 갱신 '+formatTime(d.updatedAt):'원본 갱신 시각 확인 필요'));
  panel.append(content);

 }
 function clear(){$('cs-content-filter').value='ALL';pageIndex=0;$('cs-sort').value='NEWEST';generation++;value=null;busy=false;failed=false;selected=null;$('cs-platform').value='ALL';$('cs-kind').value='ALL';$('cs-search').value='';$('cs-status').textContent='실제 사업장 연결 후 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const expected=++generation;busy=true;failed=false;value=null;selected=null;pageIndex=0;render();$('cs-status').textContent='저장된 고객·CS 자료를 조회하고 있습니다…';
  try{const result=await window.moaonHub.readCs();if(expected!==generation)return;if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'){failed=true;$('cs-status').textContent='고객·CS 조회 실패 · 자료를 다시 확인해 주세요.';return;}value=result;$('cs-status').textContent=`조회 시각 ${formatTime(result.generatedAt)} · 실시간 수집 상태는 별도 확인${result.truncated?' · 조회 상한에 도달해 전체 건수가 아닙니다.':''}`;
  }catch{if(expected===generation){failed=true;$('cs-status').textContent='고객·CS 조회 실패 · 다시 시도해 주세요.';}}
  finally{if(expected===generation){busy=false;render();}}
 }
 $('cs-reset').onclick=()=>{for(const id of ['cs-platform','cs-kind','cs-content-filter'])$(id).value='ALL';$('cs-sort').value='NEWEST';$('cs-search').value='';pageIndex=0;selected=null;render();$('cs-search').focus({preventScroll:true});};
 const filter=()=>{pageIndex=0;selected=null;render();};
 $('cs-prev').onclick=()=>{if(pageIndex>0){pageIndex--;selected=null;render();}};$('cs-next').onclick=()=>{pageIndex++;selected=null;render();};
 for(const id of ['cs-platform','cs-kind','cs-sort','cs-content-filter'])$(id).addEventListener('change',filter);$('cs-search').addEventListener('input',filter);$('cs-refresh').onclick=refresh;
 $('cs-detail').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
 window.moaonCs=Object.freeze({clear,ensure:()=>{render();if(!value&&!busy)void refresh();}});clear();
})();
