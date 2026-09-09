'use strict';
(()=>{
 let value=null,busy=false,generation=0,lastAttempt=0;
 const select=id=>document.getElementById(id),node=(tag,css,text)=>makeElement(tag,css,text);
 const money=v=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ko-KR')+'원':'판단 보류';
 const period=v=>typeof v==='string'?v.slice(0,10).replaceAll('-','. '):'확인 필요';
 function render(){
  select('insights-refresh').disabled=busy||displayMode!=='live';select('insights-page').setAttribute('aria-busy',String(busy));
  const c=value?.channel;
  select('insights-period').textContent=c?.currentPeriod?`분석 기간 ${period(c.currentPeriod.start)} — ${period(c.currentPeriod.end)} · 보고서 작성 ${formatTime(c.currentPeriod.createdAt)}`:'보고서 기간 확인 필요';
  select('insights-metrics').replaceChildren(...[['광고 전환매출',money(c?.revenue),'주문 전체 매출과 다릅니다'],['이전 보고서 대비',typeof c?.changeRate==='number'?c.changeRate.toLocaleString('ko-KR')+'%':'판단 보류','같은 채널 · 비교 가능한 기간만'],['공헌이익',money(c?.profit),'원가·비용 근거가 확인된 경우만']].map(([label,amount,note])=>{const el=node('article','insights-metric');el.append(node('span','',label),node('strong','',amount),node('small','',note));return el;}));
  select('insights-flow').replaceChildren(...[['원인 검토',c?.cause,c?.causeNote],['검토할 행동',c?.action,c?.actionNote]].map(([label,title,note])=>{const el=node('article','insights-card');el.append(node('h2','',label),node('h3','',title||'보고서 근거 확인 필요'),node('p','',note||'자료를 조회한 뒤 확인할 수 있습니다.'));return el;}));
  select('insights-caveats').replaceChildren(...(value?.caveats||['조회 전입니다. 미확인 자료는 0으로 처리하지 않습니다.']).map(text=>node('li','',text)));
  select('insights-reports').replaceChildren(...(value?.reports.length?value.reports.map(report=>{const row=node('article','insights-report');row.append(node('h3','',report.title),node('p','',`${formatTime(report.periodStart)} — ${formatTime(report.periodEnd)}`));return row;}):[node('p','',value?'저장된 네이버 주간 보고서가 없습니다.':'연결 후 저장 보고서를 조회합니다.')]));
 }
 function clear(){generation++;value=null;busy=false;lastAttempt=0;select('insights-status').textContent='실제 사업장 연결 후 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const expected=++generation;busy=true;value=null;lastAttempt=Date.now();render();select('insights-status').textContent='분석 보고서를 조회하고 있습니다…';
  try{const result=await window.moaonHub.readInsights();if(expected!==generation)return;if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'){select('insights-status').textContent='분석 조회 실패 · 새로 조회해 주세요.';return;}
   value=result;select('insights-status').textContent=`최근 저장 보고서 ${result.reports.length}개 · 자동 생성·광고 변경 없음`;
  }catch{if(expected===generation)select('insights-status').textContent='분석 조회 실패 · 새로 조회해 주세요.';}
  finally{if(expected===generation){busy=false;render();}}
 }
 window.moaonInsights=Object.freeze({clear,ensure:()=>{render();if(displayMode==='live'&&(!lastAttempt||Date.now()-lastAttempt>=300000))void refresh();}});
 select('insights-refresh').addEventListener('click',refresh);clear();
})();
