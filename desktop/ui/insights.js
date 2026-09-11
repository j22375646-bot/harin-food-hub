'use strict';
(()=>{
 let value=null,busy=false,generation=0,lastAttempt=0,selected=null,failed=false;
 const select=id=>document.getElementById(id),node=(tag,css,text)=>makeElement(tag,css,text);
 const money=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ko-KR')+'원':'판단 보류';
 const period=v=>typeof v==='string'?v.slice(0,10).replaceAll('-','. '):'확인 필요';
 function detail(focus=false){
  const report=value?.reports.find(row=>row.id===selected),panel=select('insights-detail'),open=Boolean(report);
  select('insights-workspace').classList.toggle('has-detail',open);panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
  document.querySelectorAll('[data-insights-report]').forEach(button=>{const active=open&&button.dataset.insightsReport===selected;button.setAttribute('aria-expanded',String(active));button.classList.toggle('is-selected',active);});
  if(!value){select('insights-detail-body').replaceChildren();select('insights-detail-title').textContent='보고서 상세';}
  if(!report)return;
  select('insights-detail-title').textContent=report.title;
  const content=[node('p','',`${period(report.periodStart)} — ${period(report.periodEnd)} · 저장 당시 근거`)];
  if(!report.detail)content.push(node('p','','이 보고서의 상세 근거를 불러오지 못했습니다. 새로 조회해 주세요.'));
  else{
   if(report.detail.truncated)content.push(node('p','insights-detail-notice','긴 보고서의 일부 근거를 요약해 표시합니다. 전체 항목이 아닙니다.'));
   const navigation=node('nav','insights-section-nav');navigation.setAttribute('aria-label','보고서 근거 목차');content.push(navigation);
   for(const section of report.detail.sections){const group=node('section','insights-detail-section');group.tabIndex=-1;group.append(node('h3','',section.title));const jump=node('button','',section.title);jump.type='button';jump.onclick=()=>{group.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});group.focus({preventScroll:true});};navigation.append(jump);
    for(const item of section.items){const row=node('article','');row.append(node('h4','',item.title),node('p','',item.body));group.append(row);}
    content.push(group);
   }
   if(!report.detail.sections.length)content.push(node('p','','상세 판단 근거가 없습니다. 자료 확인이 필요합니다.'));
  }
  content.push(node('p','insights-detail-notice','저장 보고서의 판단 근거입니다. 광고·입찰·상품을 자동 변경하지 않습니다.'));
  select('insights-detail-body').replaceChildren(...content);if(focus)select('insights-detail-close').focus();
 }
 function closeDetail(){const previous=selected;selected=null;detail();Array.from(document.querySelectorAll('[data-insights-report]')).find(el=>el.dataset.insightsReport===previous)?.focus();}
 function render(){
  window.moaonMarketing?.set(value?.marketing||null);
  window.moaonKeywords?.set(value?.marketing||null,{busy,failed});
  select('insights-refresh').disabled=busy||displayMode!=='live';select('insights-page').setAttribute('aria-busy',String(busy));
  const c=value?.channel;
  select('insights-period').textContent=c?.currentPeriod?`분석 기간 ${period(c.currentPeriod.start)} — ${period(c.currentPeriod.end)} · 보고서 작성 ${formatTime(c.currentPeriod.createdAt)}`:'보고서 기간 확인 필요';
  select('insights-metrics').replaceChildren(...[['광고 전환매출',money(c?.revenue),'주문 전체 매출과 다릅니다'],['이전 보고서 대비',typeof c?.changeRate==='number'?c.changeRate.toLocaleString('ko-KR')+'%':'판단 보류','같은 채널 · 비교 가능한 기간만'],['공헌이익',money(c?.profit),'원가·비용 근거가 확인된 경우만']].map(([label,amount,note])=>{const el=node('article','insights-metric');el.append(node('span','',label),node('strong','',amount),node('small','',note));return el;}));
  select('insights-flow').replaceChildren(...[['원인 검토',c?.cause,c?.causeNote],['검토할 행동',c?.action,c?.actionNote]].map(([label,title,note])=>{const el=node('article','insights-card');el.append(node('h2','',label),node('h3','',title||'보고서 근거 확인 필요'),node('p','',note||'자료를 조회한 뒤 확인할 수 있습니다.'));return el;}));
  select('insights-caveats').replaceChildren(...(value?.caveats||[busy?'자료를 조회하고 있습니다. 금액은 확인이 끝난 뒤 표시합니다.':failed?'조회에 실패했습니다. 미확인 자료는 0으로 처리하지 않습니다.':'조회 전입니다. 미확인 자료는 0으로 처리하지 않습니다.']).map(text=>node('li','',text)));
  const term=select('insights-search').value.trim().toLocaleLowerCase('ko-KR'),reports=(value?.reports||[]).filter(r=>[r.title,r.periodStart,r.periodEnd,...(r.detail?.sections||[]).flatMap(s=>[s.title,...s.items.flatMap(i=>[i.title,i.body])])].some(t=>typeof t==='string'&&t.toLocaleLowerCase('ko-KR').includes(term)));
  select('insights-search-count').textContent=busy?'보고서 조회 중':value?reports.length+' / '+value.reports.length+'개':failed?'조회 실패':'조회 전';select('insights-search-reset').disabled=!select('insights-search').value;
  if(selected&&!reports.some(r=>r.id===selected)){selected=null;select('insights-detail-body').replaceChildren();}
  select('insights-reports').replaceChildren(...(reports.length?reports.map(report=>{const row=node('button','insights-report');row.type='button';row.dataset.insightsReport=report.id;row.setAttribute('aria-controls','insights-detail');row.append(node('strong','',report.title),node('span','',`${period(report.periodStart)} — ${period(report.periodEnd)}`),node('small','','근거 보기 →'));row.addEventListener('click',()=>{selected=report.id;detail(true);});return row;}):[node('p','',value?(value.reports.length?'검색 조건에 맞는 보고서가 없습니다.':'저장된 네이버 주간 보고서가 없습니다.'):'연결 후 저장 보고서를 조회합니다.')]));
  if(!value)selected=null;detail();
  if(!value){
   const state=node('section','insights-load-state');state.dataset.state=busy?'loading':failed?'error':'idle';
   state.append(node('h3','',busy?'저장 보고서를 불러오고 있습니다':failed?'보고서를 불러오지 못했습니다':'저장 보고서를 연결해 주세요'),node('p','',busy?'조회가 끝나면 보고서와 판단 근거를 표시합니다.':failed?'연결 상태를 확인한 뒤 다시 조회해 주세요. 실패한 조회를 보고서 0개로 표시하지 않습니다.':'실제 사업장 연결 후 저장된 분석 자료를 확인할 수 있습니다.'));
   if(failed&&!busy&&displayMode==='live'){const retry=node('button','','다시 조회');retry.type='button';retry.addEventListener('click',()=>{select('insights-refresh').focus({preventScroll:true});void refresh();});state.append(retry);}
   select('insights-reports').replaceChildren(state);
  }
 }
 function clear(){select('insights-search').value='';generation++;value=null;busy=false;failed=false;lastAttempt=0;select('insights-status').textContent='실제 사업장 연결 후 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const expected=++generation;busy=true;failed=false;value=null;lastAttempt=Date.now();render();select('insights-status').textContent='분석 보고서를 조회하고 있습니다…';
  try{const result=await window.moaonHub.readInsights();if(expected!==generation)return;if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'){failed=true;select('insights-status').textContent='분석 조회 실패 · 새로 조회해 주세요.';return;}
   value=result;select('insights-status').textContent=`최근 저장 보고서 ${result.reports.length}개 · 저장 자료 조회`;
  }catch{if(expected===generation){failed=true;select('insights-status').textContent='분석 조회 실패 · 새로 조회해 주세요.';}}
  finally{if(expected===generation){busy=false;render();}}
 }
 window.moaonInsights=Object.freeze({clear,refresh,ensure:()=>{if(displayMode==='live'&&(!lastAttempt||Date.now()-lastAttempt>=300000))void refresh();}});
 select('insights-search').addEventListener('input',render);select('insights-search-reset').onclick=()=>{select('insights-search').value='';render();select('insights-search').focus();};
 select('insights-refresh').addEventListener('click',refresh);clear();
 select('insights-detail-close').addEventListener('click',closeDetail);
 select('insights-page').addEventListener('keydown',event=>{if(event.key==='Escape'&&selected){event.preventDefault();event.stopPropagation();closeDetail();}});
})();
