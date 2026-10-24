'use strict';
// Display-only state. Shipment actions and retries remain owned by Main.
(()=>{
 const phases={QUEUE:'요청 확인',CONFIRM:'최종 승인',CHECK:'주문 재확인',PREPARE:'상품 준비',ISSUE:'송장 발급',REGISTER:'쇼핑몰 등록',TRACKING:'배송 조회'};
 const states={WAITING:'순서 대기',WAIT_USER:'확인창 승인 대기',RUNNING:'처리 중',SUCCESS:'이 단계 확인 완료',PENDING:'기존 요청 처리 대기',REGISTERED:'등록 완료',FAILED:'실패 · 확인 필요',CHECK_REQUIRED:'결과 확인 필요',CANCELLED:'요청 취소',NOT_STARTED:'시작하지 않음'};
 let rows=new Map(),timer,active=false,notify,lastSummary='';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const duration=ms=>{const seconds=Math.max(0,Math.floor(ms/1000));return seconds<60?seconds+'초':Math.floor(seconds/60)+'분 '+seconds%60+'초';};
 function label(row){
  const channel={CAFE24:'Cafe24',COUPANG:'쿠팡',NAVER:'네이버'}[row.platform]||'쇼핑몰';
  const phase=row.phase==='ISSUE'?'우체국 송장 발급':row.phase==='REGISTER'?channel+' 송장 등록':phases[row.phase];
  if(row.status==='REGISTERED')return channel+' 송장 등록 완료';
  if(row.stalled)return phase+' · 응답 확인 필요';
  if(row.status==='RUNNING')return phase+' 중';
  if(row.status==='PENDING')return phase+' · 처리 대기';
  if(row.status==='FAILED')return phase+' 실패';
  if(row.status==='CHECK_REQUIRED')return phase+' · 결과 확인 필요';
  return states[row.status];
 }
 function tone(row){
  if(row.stalled||row.status==='CHECK_REQUIRED')return 'attention';
  if(row.status==='FAILED')return 'error';
  if(row.status==='REGISTERED')return 'complete';
  if(row.status==='RUNNING')return 'active';
  return 'waiting';
 }
 function mount(order,container,onOpen){
  const details=el('details','order-shipping-progress');details.dataset.orderId=order.hubOrderId;
  const heading=el('summary','shipping-progress-badge');
  const dot=el('i');dot.setAttribute('aria-hidden','true');
  heading.append(dot,el('span','shipping-progress-label'),el('span','shipping-progress-chevron','⌄'));
  const body=el('div','shipping-progress-detail');
  const open=el('button','secondary-action','주문 상세 확인');open.type='button';
  open.addEventListener('click',event=>{event.stopPropagation();onOpen();});
  body.append(el('p','shipping-progress-reason'),el('small','shipping-progress-time'),open);
  details.append(heading,body);container.append(details);paint(details);return details;
 }
 function paint(details){
  const row=rows.get(details.dataset.orderId);details.hidden=!row;
  if(!row){details.open=false;return;}
  details.dataset.progressState=row.status;details.dataset.tone=tone(row);
  details.querySelector('.shipping-progress-label').textContent=label(row);
  details.querySelector('summary').setAttribute('aria-label',label(row)+' · 진행 상세');
  details.querySelector('.shipping-progress-reason').textContent=reason(row);
  writeTime(details,row);
 }
 function reason(row){
  if(row.status==='REGISTERED')return '쇼핑몰 송장 등록이 확인됐습니다. 배송 완료를 뜻하지 않습니다.';
  if(row.status==='PENDING')return '서버가 기존 요청을 처리하고 있습니다. 완료 전이므로 재발급하지 마세요.';
  if(row.status==='FAILED'||row.status==='CHECK_REQUIRED')return '기존 주문·발급 상태를 확인하세요. 이 화면에서 자동 재발급하지 않습니다.';
  if(row.status==='WAIT_USER')return '최종 확인창에서 승인하거나 취소해 주세요.';
  if(row.status==='NOT_STARTED')return '이번 요청은 시작하지 않았습니다. 기존 요청 상태는 별도로 확인하세요.';
  if(row.status==='CANCELLED')return '이번 요청을 취소했습니다. 기존에 접수한 작업이 취소된다는 뜻은 아닙니다.';
  if(row.stalled)return '새 상태 응답을 기다리고 있습니다. 마지막 확인 단계이며 완료 여부는 미확인입니다.';
  if(row.status==='WAITING')return '앞선 작업 또는 최초 확인 응답을 기다리고 있습니다.';
  return row.phase==='TRACKING'?'등록 후 배송 조회를 확인하고 있습니다.':'다른 메뉴를 이용해도 진행 상황을 확인할 수 있습니다.';
 }
 function summary(){
  const all=[...rows.values()],count=status=>all.filter(row=>status.includes(row.status)).length;
  const stalled=all.filter(row=>row.stalled).length,notStarted=count(['NOT_STARTED']),phaseText=active?[...new Set(all.filter(row=>['RUNNING','SUCCESS','WAIT_USER'].includes(row.status)).map(row=>phases[row.phase]))].join('·'):'';
  const complete=count(['REGISTERED']),waiting=count(['WAITING','WAIT_USER','PENDING']),check=count(['FAILED','CHECK_REQUIRED']),cancelled=count(['CANCELLED']);
  return `선택 ${all.length}건 · 등록 완료 ${complete}건 · 진행 ${count(['RUNNING','SUCCESS'])}건 · 대기 ${waiting}건${check?' · 확인 필요 '+check+'건':''}${cancelled?' · 취소 '+cancelled+'건':''}${notStarted?' · 미시작 '+notStarted+'건':''}${phaseText?' · '+phaseText:''}${stalled?' · 응답 확인 중 '+stalled+'건':''}${active?'':' · 이번 확인 종료'}`;
 }
 function render(){
  const text=summary();document.querySelectorAll('.order-shipping-progress').forEach(paint);
  if(text!==lastSummary){lastSummary=text;notify?.(text,!active);}
 }
 function writeTimes(){
  for(const details of document.querySelectorAll('.order-shipping-progress')){const row=rows.get(details.dataset.orderId);if(row)writeTime(details,row);}
 }
 function writeTime(details,row){
  const time=details.querySelector('.shipping-progress-time');
  time.textContent=active?`${phases[row.phase]} 단계 확인 후 ${duration(Date.now()-row.phaseAt)} 경과 · 마지막 변경 ${new Date(row.changedAt).toLocaleTimeString('ko-KR',{hour12:false})}`:`이번 확인 ${duration(row.endedAt-row.startedAt)} · 마지막 단계 ${phases[row.phase]} · ${new Date(row.changedAt).toLocaleTimeString('ko-KR',{hour12:false})} 확인`;
 }
 function tick(){
  const now=Date.now();let changed=false;
  for(const row of rows.values()){
   const stale=active&&['RUNNING','SUCCESS'].includes(row.status)&&now-row.changedAt>=45_000;
   if(stale!==row.stalled){row.stalled=stale;changed=true;}
  }
  if(changed)render();else writeTimes();
 }
 function start(orders,onSummary){
  reset();notify=onSummary;active=true;const now=Date.now();
  for(const order of orders.slice(0,20))rows.set(order.id,{id:order.id,platform:order.platform,phase:'QUEUE',status:'WAITING',seen:new Set(),startedAt:now,phaseAt:now,changedAt:now,stalled:false});
  render();timer=setInterval(tick,1000);
 }
 function update(value){
  if(!active||!Object.hasOwn(phases,value?.phase)||!rows.has(value.hubOrderId))return;
  const status=Object.hasOwn(states,value.status)?value.status:value.status==='UNKNOWN'?'CHECK_REQUIRED':null;if(!status)return;
  const row=rows.get(value.hubOrderId),now=Date.now();
  if(row.phase!==value.phase){row.seen.add(row.phase);row.phaseAt=now;}
  if(row.phase!==value.phase||row.status!==status){row.changedAt=now;row.stalled=false;}
  row.phase=value.phase;row.status=status;render();
 }
 function finish(result){
  if(!active)return;active=false;clearInterval(timer);timer=null;
  for(const row of rows.values()){
   const matches=Array.isArray(result?.results)?result.results.filter(item=>item?.hubOrderId===row.id):[];
   const value=matches.length===1?matches[0]:null;
   row.status=result?.status==='REVIEW_CANCELLED'?'CANCELLED':['BUSY','ORDER_CHANGED'].includes(result?.status)?'NOT_STARTED':value&&['REGISTERED','PENDING','FAILED','CHECK_REQUIRED'].includes(value.status)?value.status:'CHECK_REQUIRED';
   if(value?.phase&&Object.hasOwn(phases,value.phase))row.phase=value.phase;
   if(row.status==='REGISTERED')row.phase='REGISTER';
   row.changedAt=Date.now();row.endedAt=row.changedAt;row.stalled=false;
  }
  render();
 }
 function reset(){clearInterval(timer);timer=null;active=false;rows.clear();notify=null;lastSummary='';document.querySelectorAll('.order-shipping-progress').forEach(paint);}
 function open(){const details=document.querySelector('.order-shipping-progress:not([hidden])');if(!details)return false;details.open=true;details.scrollIntoView({block:'nearest'});details.querySelector('summary').focus({preventScroll:true});return true;}
 document.addEventListener('moaon-session-changed',reset);
 window.moaonShippingProgress=Object.freeze({start,update,finish,reset,open,mount});
})();
