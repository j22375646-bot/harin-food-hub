'use strict';
(()=>{
 let value=null,busy=false,generation=0,lastAttempt=0;
 const select=id=>document.getElementById(id),money=v=>typeof v==='number'&&Number.isFinite(v)?`${v.toLocaleString('ko-KR')}원`:'확인 필요';
 const node=(tag,css,text)=>makeElement(tag,css,text);
 function render(){
  select('settlement-refresh').disabled=busy||displayMode!=='live';
  select('settlement-page').setAttribute('aria-busy',String(busy));
  const period=value?.period,periodNode=select('settlement-period');
  periodNode.replaceChildren(node('span','',period?.start&&period?.end?`${formatTime(period.start)} — ${formatTime(period.end)} · 최근 30일`:'최근 30일 · 조회 전'));
  if(value)periodNode.append(node('span','settlement-query-time',value.generatedAt?`조회 시각 ${formatTime(value.generatedAt)}`:'조회 시각 확인 필요'));
  select('settlement-summary').replaceChildren(...[
   ['예상 지급',value?.summary?.expected?.value,'예상액 · 실제 지급과 다릅니다'],
   [value?.summary?.actual?.status==='READY'?'실제 지급':'확인된 지급',value?.summary?.actual?.value,value?.summary?.actual?.status==='PARTIAL'?'부분 확인 · 전체 지급액 아님':'플랫폼 확인 기준'],
   ['대조 차이',value?.summary?.variance,`${value?.summary?.comparableChannels??'미확인'}개 채널 대조 · 전체 차이 아님`]
  ].map(([label,amount,note])=>{const card=node('article','settlement-total');card.append(node('span','',label),node('strong','',money(amount)),node('small','',note));return card;}));
  select('settlement-channels').replaceChildren(...(value?.channels||[]).map(channel=>{
   const card=node('article','settlement-channel'),header=node('header',''),body=node('dl','settlement-values');header.append(node('h3','',channel.label),node('span','settlement-state',channel.stateLabel));
   for(const [label,key] of [['매출','gross'],['예상 지급','expected'],['확인된 지급','actual'],['지급 대기','pending'],['수수료','fees'],['물류비','logistics'],['광고비','advertising']]){const row=node('div','');row.append(node('dt','',label),node('dd','',money(channel[key])));body.append(row);}
   card.append(header,body,node('p','settlement-basis',channel.basis||'근거 자료 확인 필요'),node('p','settlement-basis settlement-asof',channel.asOf?`자료 시각 ${formatTime(channel.asOf)}`:'자료 시각 확인 필요'));return card;
  }));
  const schedules=value?.schedules||[];select('settlement-schedules').replaceChildren(...(schedules.length?schedules.map(item=>{const row=node('div','settlement-schedule');row.append(node('span','',item.date||'날짜 확인 필요'),node('span','',value.channels.find(c=>c.platform===item.platform)?.label||item.platform),node('span','',item.status),node('strong','',money(item.amount)));return row;}):[node('p','',value?'조회된 지급 일정이 없습니다.':'연결 후 지급 일정을 확인합니다.')]));
 }
 function clear(){generation++;busy=false;lastAttempt=0;value=null;select('settlement-status').textContent='연결 후 정산 자료를 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const expected=++generation;busy=true;lastAttempt=Date.now();value=null;render();select('settlement-status').textContent='정산 자료를 조회하고 있습니다…';
  try{const result=await window.moaonHub.readSettlement();if(expected!==generation)return;
   if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'){select('settlement-status').textContent='정산 조회 실패 · 새로 조회해 주세요.';return;}
   value=result;select('settlement-status').textContent=result.summary.actual.status==='READY'?'플랫폼 정산 기준의 조회 결과입니다.':'부분 확인·미확인 금액은 전체 지급액으로 판단하지 마세요.';
  }catch{if(expected===generation)select('settlement-status').textContent='정산 조회 실패 · 새로 조회해 주세요.';}
  finally{if(expected===generation){busy=false;render();}}
 }
 window.moaonSettlement=Object.freeze({clear,ensure:()=>{render();if(displayMode!=='live'){select('settlement-status').textContent='실제 사업장 연결 후 조회할 수 있습니다.';return;}if(!lastAttempt||Date.now()-lastAttempt>=300000)void refresh();}});
 select('settlement-refresh').addEventListener('click',refresh);clear();
})();
