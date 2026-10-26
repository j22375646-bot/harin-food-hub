'use strict';
// Display-only state. Shipment actions and retries remain owned by Main.
(()=>{
 const phases={QUEUE:'요청 확인',CONFIRM:'최종 승인',CHECK:'주문 재확인',PREPARE:'상품 준비',ISSUE:'송장 발급',REGISTER:'쇼핑몰 등록',TRACKING:'배송 조회'};
 const states={WAITING:'순서 대기',WAIT_USER:'확인창 승인 대기',RUNNING:'처리 중',SUCCESS:'이 단계 확인 완료',PENDING:'기존 요청 처리 대기',REGISTERED:'등록 완료',FAILED:'실패 · 확인 필요',CHECK_REQUIRED:'결과 확인 필요',CANCELLED:'요청 취소',NOT_STARTED:'시작하지 않음'};
 let lookups=new Map(),rows=new Map(),timer,active=false,notify,lastSummary='',batchIds=new Set(),resumeBaseline=new Map(),epoch=0,revision=0;
 let wanted=[],watchKey='',watchSeq=0,pollTimer,pollWork=null,scopeKey=null,failures=0;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const duration=ms=>{const seconds=Math.max(0,Math.floor(ms/1000));return seconds<60?seconds+'초':Math.floor(seconds/60)+'분 '+seconds%60+'초';};
 const stamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR',{hour12:false}):'확인 필요';
 const retryAt=row=>row.status==='PENDING'&&Number.isFinite(Date.parse(row.nextAttemptAt))?Date.parse(row.nextAttemptAt):null;
 const overdue=row=>retryAt(row)!==null&&Date.now()>=retryAt(row);
 function label(row){
  const channel={CAFE24:'Cafe24',COUPANG:'쿠팡',NAVER:'네이버'}[row.platform]||'쇼핑몰';
  const phase=row.phase==='ISSUE'?'우체국 송장 발급':row.phase==='REGISTER'?channel+' 송장 등록':phases[row.phase];
  if(row.syncError)return phase+' · 상태 조회 확인 필요';
  if(row.status==='REGISTERED')return channel+' 송장 등록 완료';
  if(retryAt(row)!==null)return phase+(overdue(row)?' · 재시도 실행 확인 필요':' · 자동 재시도 대기');
  if(row.stalled)return phase+' · 응답 확인 필요';
  if(row.status==='RUNNING')return phase+' 중';
  if(row.status==='PENDING')return phase+' · 처리 대기';
  if(row.status==='FAILED')return phase+' 실패';
  if(row.status==='CHECK_REQUIRED')return phase+' · 결과 확인 필요';
  if(row.source==='SERVER'&&row.status==='SUCCESS')return phase+' 확인 완료 · 다음 단계 확인';
  return states[row.status];
 }
 function tone(row){
  if(row.syncError)return 'attention';
  if(row.stalled||overdue(row)||row.status==='CHECK_REQUIRED')return 'attention';
  if(row.status==='FAILED')return 'error';
  if(row.status==='REGISTERED')return 'complete';
  if(row.status==='RUNNING')return 'active';
  return 'waiting';
 }
 function mount(order,container,onOpen,onContinue){
  const details=el('div','order-shipping-progress');details.dataset.orderId=order.hubOrderId;if(['CAFE24','COUPANG'].includes(order.platform)&&!lookups.has(order.hubOrderId))lookups.set(order.hubOrderId,'LOADING');
  details.dataset.canContinue=String(typeof onContinue==='function');
  details.dataset.storedInvoice=/^\d{13}$/.test(order.details?.invoice?.number||'')?'yes':'unknown';
  const heading=el('button','shipping-progress-badge');heading.type='button';heading.setAttribute('aria-expanded','false');
  const dot=el('i');dot.setAttribute('aria-hidden','true');
  heading.append(dot,el('span','shipping-progress-label'),el('span','shipping-progress-chevron'));
  const body=el('div','shipping-progress-detail');body.popover='auto';body.setAttribute('role','region');body.setAttribute('aria-label','송장 진행 상세');
  body.id='shipping-popover-'+order.hubOrderId;heading.setAttribute('aria-controls',body.id);
  function position(){const r=heading.getBoundingClientRect(),gap=8,pad=12;body.dataset.anchorTop=String(r.top);body.dataset.anchorLeft=String(r.left);body.style.width=Math.min(460,innerWidth-pad*2)+'px';const h=body.getBoundingClientRect().height;body.style.left=Math.max(pad,Math.min(r.left,innerWidth-body.offsetWidth-pad))+'px';body.style.top=Math.max(pad,r.bottom+gap+h<=innerHeight-pad?r.bottom+gap:r.top-h-gap)+'px';}
  heading.addEventListener('click',event=>{event.stopPropagation();if(body.matches(':popover-open'))body.hidePopover();else{body.showPopover();position();}});
  body.addEventListener('toggle',()=>heading.setAttribute('aria-expanded',String(body.matches(':popover-open'))));
  body.addEventListener('click',event=>event.stopPropagation());
  const open=el('button','secondary-action','주문 상세 확인');open.type='button';
  open.addEventListener('click',event=>{event.stopPropagation();onOpen();});
  const facts=el('dl','shipping-progress-facts');
  for(const [key,title] of [['phase','마지막 단계'],['changed','마지막 변경'],['checked','서버 확인'],['retry','자동 재시도'],['invoice','기존 송장']]){facts.append(el('dt','',title),el('dd','shipping-progress-'+key));}
  const check=el('button','secondary-action','상태 다시 확인');check.type='button';
  check.addEventListener('click',async event=>{event.stopPropagation();if(check.disabled)return;check.disabled=true;check.textContent='상태 확인 중…';try{await recheck(order.hubOrderId);}finally{check.disabled=false;check.textContent='상태 다시 확인';}});
  const resume=el('button','secondary-action shipping-progress-continue','기존 작업 확인·이어가기');resume.type='button';resume.hidden=typeof onContinue!=='function';resume.title='기존 요청을 확인합니다. 새 송장은 발급하지 않습니다.';
  resume.addEventListener('click',event=>{event.stopPropagation();if(!resume.disabled&&typeof onContinue==='function')onContinue();});
  const actions=el('div','shipping-progress-actions');actions.append(check,open,resume);
  body.append(el('p','shipping-progress-reason'),el('small','shipping-progress-time'),facts,el('p','shipping-progress-next'),actions);
  details.append(heading,body);container.append(details);paint(details);return details;
 }
 function paint(details){
  const row=rows.get(details.dataset.orderId);details.hidden=!row;
  if(!row){
   const state=lookups.get(details.dataset.orderId),loading=state==='LOADING';details.hidden=!state||(state==='UNKNOWN'&&details.dataset.storedInvoice!=='yes');
   details.dataset.progressState=state||'';details.dataset.tone=loading?'waiting':'attention';details.setAttribute('aria-busy',String(loading));
   const heading=details.querySelector('.shipping-progress-badge'),label=loading?'송장 상태 확인 중…':'송장 진행 기록 확인 필요';heading.disabled=loading;heading.setAttribute('aria-label',label);details.querySelector('.shipping-progress-label').textContent=label;
   details.querySelector('.shipping-progress-reason').textContent=loading?'서버의 송장 진행 기록을 조회하고 있습니다.':'진행 기록을 확인하지 못했습니다. 저장된 송장번호와 주문 상태를 유지하며 다시 확인하세요.';
   details.querySelector('.shipping-progress-time').textContent='';details.querySelectorAll('.shipping-progress-facts dd').forEach(n=>n.textContent='확인 필요');details.querySelector('.shipping-progress-next').textContent='새 송장을 발급하지 않고 기존 기록만 다시 조회합니다.';details.querySelector('.shipping-progress-continue').hidden=true;
   return;
  }
  details.setAttribute('aria-busy','false');details.querySelector('.shipping-progress-badge').disabled=false;details.querySelector('.shipping-progress-continue').hidden=details.dataset.canContinue!=='true';
  details.dataset.progressState=row.status;details.dataset.tone=tone(row);
  details.querySelector('.shipping-progress-label').textContent=label(row);
  details.querySelector('.shipping-progress-badge').setAttribute('aria-label',label(row)+' · 진행 상세');
  details.querySelector('.shipping-progress-reason').textContent=reason(row);
  const resume=details.querySelector('.shipping-progress-continue');if(resume){resume.disabled=active&&batchIds.has(row.id);resume.textContent=row.status==='REGISTERED'?'등록 결과 확인':'기존 작업 확인·이어가기';}
  writeTime(details,row);
 }
 function reason(row){
  if(row.syncError){const why={TIMEOUT:'조회 응답 시간이 초과됐습니다.',RATE_LIMITED:'서버가 조회 횟수를 제한했습니다.',SETUP_REQUIRED:'서버 상태 조회 연결을 확인해야 합니다.',MISSING_RECORD:'이번 조회에서 기존 작업 기록을 찾지 못했습니다.'}[row.syncCode]||'서버 상태를 다시 확인하지 못했습니다.';return why+' 마지막 확인 단계는 유지합니다. 발급 실패로 확정된 것이 아닙니다.';}
  if(row.source==='SERVER'&&row.status==='REGISTERED')return '서버의 쇼핑몰 등록 성공 기록입니다. 현재 배송상태 또는 배송 완료를 뜻하지 않습니다.';
  if(row.source==='SERVER'&&row.status==='SUCCESS')return '이 단계의 서버 성공 기록입니다. 다음 단계의 실행 또는 완료는 별도 확인이 필요합니다.';
  if(row.status==='REGISTERED')return '쇼핑몰 송장 등록이 확인됐습니다. 배송 완료를 뜻하지 않습니다.';
  if(retryAt(row)!==null)return overdue(row)?'서버의 재시도 예정 시각이 지났습니다. 실제 재시작 여부는 아직 확인되지 않았습니다.':'서버가 자동 재시도 시각을 예약했습니다. 예정된 대기이며 현재 실행 중이라는 뜻은 아닙니다.';
  if(row.status==='FAILED')return phases[row.phase]+' 단계의 실패 기록이 확인됐습니다. 세부 원인은 확인 필요하며 기존 송장·등록 상태를 먼저 확인하세요.';
  if(row.status==='CHECK_REQUIRED')return '요청의 완료 여부가 확인되지 않았습니다. 기존 송장·등록 상태를 먼저 확인하세요.';
  if(row.status==='WAIT_USER')return '최종 확인창에서 승인하거나 취소해 주세요.';
  if(row.status==='NOT_STARTED')return '이번 요청은 시작하지 않았습니다. 기존 요청 상태는 별도로 확인하세요.';
  if(row.status==='CANCELLED')return '이번 요청을 취소했습니다. 기존에 접수한 작업이 취소된다는 뜻은 아닙니다.';
  if(row.stalled)return '45초 이상 단계 변화가 확인되지 않았습니다. 실패로 확정된 것은 아니며 마지막 단계와 경과 시간을 유지합니다.';
  if(row.status==='PENDING')return '기존 요청이 대기 상태입니다. 실행 여부와 다음 재시도 시각은 아직 확인되지 않았습니다.';
  if(row.status==='WAITING')return '앞선 작업 또는 최초 확인 응답을 기다리고 있습니다.';
  return row.phase==='TRACKING'?'등록 후 배송 조회를 확인하고 있습니다.':'다른 메뉴를 이용해도 진행 상황을 확인할 수 있습니다.';
 }
 function presentation(row){
  const next=row.status==='REGISTERED'?'배송 진행은 주문 상세에서 별도로 확인하세요.':row.status==='WAIT_USER'?'열린 최종 확인창에서 승인하거나 취소해 주세요.':row.syncError||row.stalled||overdue(row)||['FAILED','CHECK_REQUIRED','SUCCESS'].includes(row.status)?'상태 다시 확인 후 주문 상세에서 기존 송장·등록 상태를 확인하세요.':retryAt(row)!==null?'예정 시각 이후 상태를 다시 확인하세요. 별도 재발급은 하지 마세요.':'다른 메뉴를 이용해도 됩니다. 상태 확인은 발급·등록을 새로 실행하지 않습니다.';
  return {label:label(row),tone:tone(row),reason:reason(row),next,invoice:row.invoicePresent?'확인된 송장 있음 · 최신 상태는 주문 상세 확인':'기존 송장 유무 확인 필요',retry:retryAt(row)===null?'예정된 자동 재시도 확인 안 됨':stamp(row.nextAttemptAt)+(overdue(row)?' · 예정 시각 경과 · 실행 미확인':' · '+duration(retryAt(row)-Date.now())+' 후')};
 }
 function summary(){
  const all=[...batchIds].map(id=>rows.get(id)).filter(Boolean),count=status=>all.filter(row=>status.includes(row.status)).length;
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
  const p=presentation(row);
  const values={phase:phases[row.phase],changed:stamp(new Date(row.changedAt).toISOString()),checked:row.serverCheckedAt?stamp(row.serverCheckedAt):'이번 앱의 진행 응답 기준',retry:p.retry,invoice:row.invoicePresent?p.invoice:details.dataset.storedInvoice==='yes'?'저장된 송장 있음 · 최신 상태는 주문 상세 확인':p.invoice};
  for(const [key,value] of Object.entries(values)){const node=details.querySelector('.shipping-progress-'+key);if(node)node.textContent=value;}
  const next=details.querySelector('.shipping-progress-next');if(next)next.textContent=p.next;
  if(row.source==='SERVER'){time.textContent=`마지막 단계 기록 ${new Date(row.changedAt).toLocaleTimeString('ko-KR',{hour12:false})} · ${duration(Date.now()-row.changedAt)} 경과 · 최근 서버 조회 ${new Date(row.serverCheckedAt).toLocaleTimeString('ko-KR',{hour12:false})}`;return;}
  time.textContent=active?`${phases[row.phase]} 단계 확인 후 ${duration(Date.now()-row.phaseAt)} 경과 · 마지막 변경 ${new Date(row.changedAt).toLocaleTimeString('ko-KR',{hour12:false})}`:`이번 확인 ${duration(row.endedAt-row.startedAt)} · 마지막 단계 ${phases[row.phase]} · ${new Date(row.changedAt).toLocaleTimeString('ko-KR',{hour12:false})} 확인`;
 }
 function tick(){
  const now=Date.now();let changed=false;
  for(const row of rows.values()){
   const stale=retryAt(row)===null&&(row.status==='PENDING'||(row.source==='SERVER'?row.status==='RUNNING':active&&batchIds.has(row.id)&&['RUNNING','SUCCESS'].includes(row.status)))&&now-row.changedAt>=45_000;
   if(stale!==row.stalled){row.stalled=stale;changed=true;}
  }
  if(changed||[...rows.values()].some(row=>retryAt(row)!==null))render();else writeTimes();
 }
 function start(orders,onSummary,continuing=false){
  resumeBaseline.clear();if(continuing)for(const order of orders.slice(0,20)){const old=rows.get(order.id);if(old)resumeBaseline.set(order.id,{...old,seen:new Set(old.seen)});}
  epoch++;batchIds=new Set(orders.map(order=>order.id));notify=onSummary;lastSummary='';active=true;const now=Date.now();
  for(const order of orders.slice(0,20))rows.set(order.id,{id:order.id,platform:order.platform,phase:resumeBaseline.get(order.id)?.phase||'QUEUE',status:'WAITING',invoicePresent:resumeBaseline.get(order.id)?.invoicePresent===true,source:'LOCAL',version:++revision,seen:new Set(),startedAt:now,phaseAt:now,changedAt:now,stalled:false});
  render();clock();
 }
 function update(value){
  if(!active||!batchIds.has(value?.hubOrderId)||!Object.hasOwn(phases,value?.phase)||!rows.has(value.hubOrderId))return;
  const status=Object.hasOwn(states,value.status)?value.status:value.status==='UNKNOWN'?'CHECK_REQUIRED':null;if(!status)return;
  const row=rows.get(value.hubOrderId),now=Date.now();
  if(/^\d{13}$/.test(value.invoiceNumber||''))row.invoicePresent=true;
  if(row.phase!==value.phase){row.seen.add(row.phase);row.phaseAt=now;}
  if(row.phase!==value.phase||row.status!==status){row.changedAt=now;row.stalled=false;}
  row.phase=value.phase;row.status=status;row.version=++revision;render();
 }
 function finish(result){
  if(!active)return;active=false;
  for(const row of [...batchIds].map(id=>rows.get(id)).filter(Boolean)){
   const matches=Array.isArray(result?.results)?result.results.filter(item=>item?.hubOrderId===row.id):[];
   const value=matches.length===1?matches[0]:null;
   const previous=resumeBaseline.get(row.id);
   if(previous&&!value){
    rows.set(row.id,{...previous,version:++revision,...(!['REVIEW_CANCELLED','BUSY'].includes(result?.status)?{syncError:true,syncCode:'UNAVAILABLE'}:{})});continue;
   }
   if(/^\d{13}$/.test(value?.invoiceNumber||''))row.invoicePresent=true;
   row.status=result?.status==='REVIEW_CANCELLED'?'CANCELLED':['BUSY','ORDER_CHANGED'].includes(result?.status)?'NOT_STARTED':value&&['REGISTERED','PENDING','FAILED','CHECK_REQUIRED'].includes(value.status)?value.status:'CHECK_REQUIRED';
   if(value?.phase&&Object.hasOwn(phases,value.phase))row.phase=value.phase;
   if(row.status==='REGISTERED')row.phase='REGISTER';
   row.changedAt=Date.now();row.endedAt=row.changedAt;row.stalled=false;row.version=++revision;
  }
  resumeBaseline.clear();render();clock();schedule(0);
 }
 function clock(){const needs=active||[...rows.values()].some(row=>row.status==='PENDING'||row.source==='SERVER'&&row.status==='RUNNING');if(needs&&!timer)timer=setInterval(tick,1000);else if(!needs&&timer){clearInterval(timer);timer=null;}}
 function syncStatus(text){const note=document.getElementById('shipping-progress-sync');if(note){note.hidden=!text;note.textContent=text;}}
 function capture(){return {epoch,versions:new Map(wanted.map(id=>[id,rows.get(id)?.version||0]))};}
 function merge(feed,ticket){
  if(ticket.epoch!==epoch)return;
  if(scopeKey&&scopeKey!==feed.scopeKey){reset();syncStatus('계정·사업장 변경 · 다시 연결해 주세요.');return;}
  scopeKey=feed.scopeKey;
  for(const item of feed.items||[]){
   if(!wanted.includes(item.hubOrderId)||!Object.hasOwn(phases,item.phase)||!Object.hasOwn(states,item.status)&&item.status!=='UNKNOWN')continue;
   const old=rows.get(item.hubOrderId);
   if((old?.version||0)!==ticket.versions.get(item.hubOrderId)||active&&batchIds.has(item.hubOrderId))continue;
   lookups.set(item.hubOrderId,item.status==='UNKNOWN'?'UNKNOWN':'READY');
   if(item.status==='UNKNOWN'){if(old){old.syncError=true;old.syncCode='MISSING_RECORD';old.version=++revision;}continue;}
   if(old?.source==='LOCAL'&&old.status==='REGISTERED'){old.syncError=false;continue;}
   if(old?.source==='SERVER'&&(item.requestId===old.requestId?Date.parse(item.updatedAt)<old.changedAt:Date.parse(item.createdAt)<Date.parse(old.createdAt)))continue;
   const changed=!old||old.phase!==item.phase||old.status!==item.status||old.requestId!==item.requestId||old.changedAt!==Date.parse(item.updatedAt);
   rows.set(item.hubOrderId,{id:item.hubOrderId,platform:item.platform,phase:item.phase,status:item.status,requestId:item.requestId,createdAt:item.createdAt,nextAttemptAt:item.nextAttemptAt,invoicePresent:old?.invoicePresent===true,source:'SERVER',serverCheckedAt:feed.checkedAt,changedAt:Date.parse(item.updatedAt),phaseAt:Date.parse(item.updatedAt),startedAt:Date.parse(item.createdAt),endedAt:Date.parse(item.updatedAt),version:changed?++revision:old.version,stalled:['RUNNING','PENDING'].includes(item.status)&&!(item.status==='PENDING'&&Number.isFinite(Date.parse(item.nextAttemptAt)))&&Date.now()-Date.parse(item.updatedAt)>=45_000,syncError:false,seen:new Set()});
  }
  for(const id of wanted)if(!rows.has(id)&&lookups.get(id)==='LOADING')lookups.set(id,'UNKNOWN');
  // Cache only a small number of previously visited rows; no local disk persistence.
  if(rows.size>200)for(const [id] of rows){if(!wanted.includes(id)&&!batchIds.has(id))rows.delete(id);if(rows.size<=200)break;}
  render();clock();
 }
 function schedule(delay){clearTimeout(pollTimer);if(wanted.length)pollTimer=setTimeout(()=>void poll(),delay);}
 function watch(orders){
  const ids=orders.filter(order=>['CAFE24','COUPANG'].includes(order.platform)&&/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(order.hubOrderId)).slice(0,20).map(order=>order.hubOrderId),key=ids.join(',');
  if(key===watchKey)return;
  for(const id of lookups.keys())if(!ids.includes(id)&&!rows.has(id))lookups.delete(id);
  watchKey=key;wanted=ids;watchSeq++;failures=0;for(const id of ids)if(!rows.has(id))lookups.set(id,'LOADING');render();clearTimeout(pollTimer);window.moaonHub?.cancelShippingProgress?.();
  if(!ids.length){syncStatus('');return;}
  schedule(0);
 }
 function poll(){
  if(pollWork)return pollWork;
  clearTimeout(pollTimer);if(!wanted.length||typeof window.moaonHub?.readShippingProgress!=='function')return Promise.resolve();
  let done;const work=new Promise(resolve=>{done=resolve;});pollWork=work;
  const ids=[...wanted],seq=watchSeq,ticket=capture();let delay=60000;
  let syncCode='UNAVAILABLE';void(async()=>{try{
   if(document.hidden&&!active)return;
   const result=await window.moaonHub.readShippingProgress(ids);
   if(seq!==watchSeq)return;
   if(result?.status==='READY'){
    merge(result.value,ticket);if(!wanted.length)return;
    const uncertain=wanted.some(id=>rows.get(id)?.syncError);
    failures=uncertain?failures+1:0;
    syncStatus(uncertain?'일부 송장 상태 확인 필요 · 기존 표시 유지':'송장 상태 · '+new Date(result.value.checkedAt).toLocaleTimeString('ko-KR',{hour12:false})+' 서버 확인');
    delay=active||result.value.items.some(item=>['RUNNING','PENDING'].includes(item.status))?2000:60000;
    if(!active&&result.value.items.some(item=>['RUNNING','PENDING'].includes(item.status)&&Date.now()-Date.parse(item.updatedAt)>60000))delay=15000;
    if(uncertain)delay=Math.min(60000,5000*2**Math.min(failures-1,4));
   }else if(['LOGIN_REQUIRED','FORBIDDEN','WORKSPACE_CHANGED','DISCONNECTED'].includes(result?.status)){
    reset();syncStatus('송장 상태 접근 확인 필요 · 다시 연결해 주세요.');
    if(typeof document.dispatchEvent==='function')document.dispatchEvent(new CustomEvent('moaon-shipping-access-lost',{detail:result.status}));
   }else if(['BUSY','CANCELLED'].includes(result?.status)){delay=2000;}
   else {syncCode=result?.status;throw Error('Read unavailable');}
  }catch{
   if(seq===watchSeq){failures++;for(const id of ids){if(!rows.has(id))lookups.set(id,'ERROR');const row=rows.get(id);if(row&&!(active&&batchIds.has(id))){row.syncError=true;row.syncCode=syncCode;row.version=++revision;}}render();syncStatus('송장 상태 확인 필요 · 기존 표시 유지');delay=Math.min(60000,5000*2**Math.min(failures-1,4));}
  }finally{if(pollWork===work)pollWork=null;done();schedule(seq===watchSeq?delay:0);}})();return work;
 }
 async function recheck(id){
  if(!wanted.length||!/^HR-(?:C24|CP)-[A-F0-9]{8}$/.test(id))return;
  if(!wanted.includes(id)){
   wanted=[id,...wanted].slice(0,20);watchSeq++;clearTimeout(pollTimer);window.moaonHub?.cancelShippingProgress?.();
   const seq=watchSeq;if(pollWork)await pollWork;if(seq!==watchSeq)return;
  }
  return poll();
 }
 function closePopovers(){document.querySelectorAll('.shipping-progress-detail:popover-open').forEach(n=>n.hidePopover());}
 window.addEventListener('resize',closePopovers);document.addEventListener('scroll',event=>{if(event.target?.closest?.('.shipping-progress-detail'))return;document.querySelectorAll('.shipping-progress-detail:popover-open').forEach(n=>{const r=n.parentElement.querySelector('.shipping-progress-badge').getBoundingClientRect();if(Math.abs(r.top-Number(n.dataset.anchorTop))>1||Math.abs(r.left-Number(n.dataset.anchorLeft))>1)n.hidePopover();});},true);
 function reset(){closePopovers();epoch++;watchSeq++;watchKey='';wanted=[];scopeKey=null;lookups.clear();batchIds.clear();resumeBaseline.clear();clearTimeout(pollTimer);clearInterval(timer);timer=null;active=false;rows.clear();notify=null;lastSummary='';window.moaonHub?.cancelShippingProgress?.();syncStatus('');document.querySelectorAll('.order-shipping-progress').forEach(paint);}
 function open(){const details=document.querySelector('.order-shipping-progress:not([hidden])');if(!details)return false;details.scrollIntoView({block:'nearest'});const trigger=details.querySelector('.shipping-progress-badge');if(trigger.getAttribute('aria-expanded')!=='true')trigger.click();trigger.focus({preventScroll:true});return true;}
 document.addEventListener('moaon-session-changed',reset);
 window.moaonShippingProgress=Object.freeze({start,update,finish,reset,open,mount,watch,poll,recheck,snapshot:()=>[...rows.values()].map(row=>({...row,presentation:presentation(row)}))});
})();
