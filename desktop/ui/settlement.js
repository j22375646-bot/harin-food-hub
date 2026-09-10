'use strict';
(()=>{
 let value=null,busy=false,generation=0,lastAttempt=0,days=30,selectedChannel=null,selectedSchedule=null,detailOrigin=null;
 const select=id=>document.getElementById(id),money=v=>typeof v==='number'&&Number.isFinite(v)?`${v.toLocaleString('ko-KR')}원`:'확인 필요';
 const node=(tag,css,text)=>makeElement(tag,css,text);
 function guidance(channel){
  if(['RECONNECT_REQUIRED','SCOPE_REQUIRED','APPROVAL_REQUIRED'].includes(channel.stateCode))return '플랫폼 연결·조회 권한을 확인해야 합니다. 이 화면에서는 권한을 변경하지 않습니다.';
  if(['FAMILY_REQUIRED','SEPARATE_SOURCE_REQUIRED'].includes(channel.stateCode))return '판매자배송과 로켓그로스의 원장 구분을 확인해야 합니다. 서로 다른 배송 유형의 금액을 합치지 않습니다.';
  if(['UNAVAILABLE','NO_DATA','VERIFY_REQUIRED'].includes(channel.stateCode))return '정산 원장과 수집 상태를 확인해야 합니다. 자료가 없거나 조회되지 않은 금액은 0원이 아닙니다.';
  if(channel.actual===null)return '실제 지급 근거가 확인되지 않았습니다. 예상 지급액을 입금 완료 금액으로 판단하지 마세요.';
  return '확인된 지급액만 표시합니다. 일부 지급이나 대조 차이가 있으면 플랫폼 원장과 기간을 확인하세요. 전체 입금 완료를 의미하지 않습니다.';
 }
 function detail(openFocus=false){
  const channel=value?.channels.find(row=>row.platform===selectedChannel),panel=select('settlement-detail'),open=Boolean(channel);
  select('settlement-workspace').classList.toggle('has-detail',open);panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
  document.querySelectorAll('[data-settlement-schedule]').forEach(button=>button.setAttribute('aria-expanded',String(open&&selectedSchedule===value?.schedules[Number(button.dataset.settlementSchedule)])));
  document.querySelectorAll('[data-settlement-channel]').forEach(button=>{const active=open&&button.dataset.settlementChannel===selectedChannel;button.setAttribute('aria-expanded',String(active));button.closest('article').classList.toggle('is-selected',active);});
  if(!value){select('settlement-detail-body').replaceChildren();select('settlement-detail-title').textContent='정산 상세';}
  if(!channel)return;
  select('settlement-detail-title').textContent=channel.label+' 정산';
  const body=node('dl','settlement-values');
  for(const [label,key] of [['매출','gross'],['환불','refunds'],['수수료','fees'],['물류비','logistics'],['광고비','advertising'],['예상 지급','expected'],['확인된 지급','actual'],['지급 대기','pending'],['지급 차이','variance']]){
   const row=node('div','');row.append(node('dt','',label),node('dd','',money(channel[key])));body.append(row);
  }
  select('settlement-detail-body').replaceChildren(node('p','settlement-state',channel.stateLabel),node('p','settlement-basis',`최근 ${days}일 · ${channel.asOf?formatTime(channel.asOf):'자료 시각 확인 필요'}`),body,
   node('p','settlement-detail-note settlement-guidance',guidance(channel)),
   node('h3','','계산 근거'),node('p','settlement-detail-note',channel.basis||'계산 근거 확인 필요'),
   node('h3','','지급 확인 기준'),node('p','settlement-detail-note',channel.payoutBasis||'지급 확인 기준 확인 필요'),
   node('p','settlement-detail-note','미확인 금액은 0원이 아닙니다. 지급 차이는 서버에서 대조한 값이며, 표시된 항목을 단순 합산한 금액과 다를 수 있습니다.'));
  if(selectedSchedule){
   const info=node('section','settlement-selected-schedule');
   info.append(node('h3','','선택한 지급 일정'),node('p','',`${selectedSchedule.date||'날짜 확인 필요'} · ${selectedSchedule.type||'유형 확인 필요'}`),node('strong','',money(selectedSchedule.amount)),node('p','',selectedSchedule.status||'상태 확인 필요'),node('p','settlement-detail-note','일정에 표시된 금액이며 입금 완료를 뜻하지 않습니다.'));
   select('settlement-detail-body').prepend(info);
  }
  if(openFocus)select('settlement-detail-close').focus();
 }
 function closeDetail(){
  const previous=selectedChannel,origin=detailOrigin;selectedChannel=null;selectedSchedule=null;detailOrigin=null;detail();
  if(origin?.isConnected)origin.focus();
  else if(previous)document.querySelector(`[data-settlement-channel="${previous}"]`)?.focus();
 }
 function render(){
  if(!value){selectedChannel=null;selectedSchedule=null;detailOrigin=null;}
  select('settlement-refresh').disabled=busy||displayMode!=='live';
  document.querySelectorAll('[data-settlement-days]').forEach(button=>{button.disabled=displayMode!=='live';button.setAttribute('aria-pressed',String(Number(button.dataset.settlementDays)===days));});
  select('settlement-page').setAttribute('aria-busy',String(busy));
  const period=value?.period,periodNode=select('settlement-period');
  periodNode.replaceChildren(node('span','',period?.start&&period?.end?`${formatTime(period.start)} — ${formatTime(period.end)} · 최근 ${days}일`:`최근 ${days}일 · 조회 전`));
  if(value)periodNode.append(node('span','settlement-query-time',value.generatedAt?`조회 시각 ${formatTime(value.generatedAt)}`:'조회 시각 확인 필요'));
  select('settlement-summary').replaceChildren(...[
   ['예상 지급',value?.summary?.expected?.value,'예상액 · 실제 지급과 다릅니다'],
   [value?.summary?.actual?.status==='READY'?'실제 지급':'확인된 지급',value?.summary?.actual?.value,value?.summary?.actual?.status==='PARTIAL'?'부분 확인 · 전체 지급액 아님':'플랫폼 확인 기준'],
   ['대조 차이',value?.summary?.variance,`${value?.summary?.comparableChannels??'미확인'}개 채널 대조 · 전체 차이 아님`]
  ].map(([label,amount,note])=>{const card=node('article','settlement-total');card.append(node('span','',label),node('strong','',money(amount)),node('small','',note));return card;}));
  select('settlement-channels').replaceChildren(...(value?.channels||[]).map(channel=>{
   const card=node('article','settlement-channel'),header=node('header',''),body=node('dl','settlement-values');header.append(node('h3','',channel.label),node('span','settlement-state',channel.stateLabel));
   const comparison=node('div','settlement-comparison');comparison.setAttribute('aria-label',channel.label+' 예상 지급과 확인된 지급');
   const maximum=Math.max(1,...[channel.expected,channel.actual].filter(v=>Number.isFinite(v)&&v>=0));
   for(const [label,key] of [['예상 지급','expected'],['확인된 지급','actual']]){const row=node('div','settlement-compare-row');row.dataset.metric=key;row.append(node('span','',label),node('strong','',money(channel[key])));const known=Number.isFinite(channel[key])&&channel[key]>=0;
    if(known){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 6');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');for(const [css,width] of [['settlement-compare-track',100],['settlement-compare-fill',100*channel[key]/maximum]]){const rect=document.createElementNS(svg.namespaceURI,'rect');for(const [k,v] of Object.entries({width,height:6,rx:2,class:css}))rect.setAttribute(k,String(v));svg.append(rect);}row.append(svg);}else row.append(node('small','settlement-compare-unknown',channel[key]<0?'음수 금액 · 원장 확인 필요':'금액 근거 확인 필요'));comparison.append(row);
   }
   for(const [label,key] of [['매출','gross'],['예상 지급','expected'],['확인된 지급','actual'],['지급 대기','pending'],['수수료','fees'],['물류비','logistics'],['광고비','advertising']]){const row=node('div','');row.append(node('dt','',label),node('dd','',money(channel[key])));body.append(row);}
   const button=node('button','settlement-detail-trigger','근거·상세 보기');button.type='button';button.dataset.settlementChannel=channel.platform;button.setAttribute('aria-controls','settlement-detail');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',channel.label+' 정산 근거·상세 보기');button.addEventListener('click',()=>{selectedChannel=channel.platform;selectedSchedule=null;detailOrigin=button;detail(true);});
   const breakdown=node('details','settlement-breakdown');breakdown.append(node('summary','','금액·비용 내역 펼치기'),body);
   card.append(header,comparison,node('p','settlement-chart-caption','두 막대는 이 채널의 금액 비교입니다. 입금 완료율이 아닙니다.'),breakdown,node('p','settlement-basis',channel.basis||'근거 자료 확인 필요'),node('p','settlement-basis settlement-asof',channel.asOf?`자료 시각 ${formatTime(channel.asOf)}`:'자료 시각 확인 필요'),button);return card;
  }));
  const schedules=value?.schedules||[];select('settlement-schedules').replaceChildren(...(schedules.length?schedules.map((item,index)=>{
   const row=node('button','settlement-schedule'),label=value.channels.find(c=>c.platform===item.platform)?.label||item.platform;
   row.type='button';row.dataset.settlementSchedule=String(index);row.setAttribute('aria-controls','settlement-detail');row.setAttribute('aria-label',`${label} ${item.date||'날짜 미확인'} 지급 일정 ${money(item.amount)} 상세 보기`);
   row.append(node('span','',item.date||'날짜 확인 필요'),node('span','',label),node('span','',item.status||'상태 확인 필요'),node('strong','',money(item.amount)));
   row.addEventListener('click',()=>{selectedChannel=item.platform;selectedSchedule=item;detailOrigin=row;detail(true);});return row;
  }):[node('p','',value?'조회된 지급 일정이 없습니다.':'연결 후 지급 일정을 확인합니다.')]));
  detail();
 }
 function clear(){generation++;busy=false;lastAttempt=0;value=null;days=30;select('settlement-status').textContent='연결 후 정산 자료를 조회합니다.';render();}
 async function refresh(){
  if(busy||displayMode!=='live')return;const expected=++generation;busy=true;lastAttempt=Date.now();value=null;render();select('settlement-status').textContent='정산 자료를 조회하고 있습니다…';
  try{const result=await window.moaonHub.readSettlement(days);if(expected!==generation)return;
   if(['LOGIN_REQUIRED','FORBIDDEN'].includes(result?.status)){applyHubResult(result);return;}
   if(result?.status!=='READY'||result.period?.days!==days){select('settlement-status').textContent='정산 조회 실패 · 새로 조회해 주세요.';return;}
   value=result;select('settlement-status').textContent=result.summary.actual.status==='READY'?'플랫폼 정산 기준의 조회 결과입니다.':'부분 확인·미확인 금액은 전체 지급액으로 판단하지 마세요.';
  }catch{if(expected===generation)select('settlement-status').textContent='정산 조회 실패 · 새로 조회해 주세요.';}
  finally{if(expected===generation){busy=false;render();}}
 }
 window.moaonSettlement=Object.freeze({clear,ensure:()=>{if(displayMode!=='live'){select('settlement-status').textContent='실제 사업장 연결 후 조회할 수 있습니다.';return;}if(!lastAttempt||Date.now()-lastAttempt>=300000)void refresh();}});
 document.querySelectorAll('[data-settlement-days]').forEach(button=>button.addEventListener('click',()=>{const next=Number(button.dataset.settlementDays);if(displayMode!=='live'||next===days||![7,30,90].includes(next))return;days=next;busy=false;void refresh();}));
 select('settlement-refresh').addEventListener('click',refresh);clear();
 select('settlement-detail-close').addEventListener('click',closeDetail);
 select('settlement-page').addEventListener('keydown',event=>{if(event.key==='Escape'&&selectedChannel){event.preventDefault();event.stopPropagation();closeDetail();}});
})();
