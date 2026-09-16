'use strict';
(()=>{const root=document.querySelector('[data-page=assistant]');if(!root)return;
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
 const button=(p,label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;p.append(b);return b;};
 const view=el('section');view.dataset.assistantView='cases';view.hidden=true;root.append(view);
 const tab=button(root.querySelector('.assistant-tabs'),'자동화 센터',()=>{root.querySelectorAll('[data-assistant-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));root.querySelectorAll('[data-assistant-view]').forEach(v=>v.hidden=v!==view);run({action:'CASE_READ'});});tab.dataset.assistantTab='cases';tab.setAttribute('aria-pressed','false');
 view.append(el('h2','발견부터 처리 확인까지'),el('p','송장 발급 전 주문과 미답변 문의를 채널별로 추적합니다. 실제 주문·문의 내용을 변경하지 않습니다.','assistant-help'));
 const status=el('p','','assistant-help');status.id='assistant-cases-status';status.setAttribute('role','status');view.append(status);
 const config=el('section','','assistant-card'),label=el('label','자동 추적·업무비서 알림 켜기','assistant-check'),enabled=el('input');enabled.type='checkbox';label.prepend(enabled);config.append(label);view.append(config);
 let state=null,busy=false,epoch=0;
 button(config,'추적 설정 저장',()=>state&&run({action:'CASE_SAVE',revision:state.revision,enabled:enabled.checked}));button(config,'지금 점검·기록',()=>run({action:'CASE_TEST'}));button(config,'새로고침',()=>run({action:'CASE_READ'}));
 config.append(el('p','자동 추적은 약 10분 간격입니다. 같은 점검에서 생긴 업데이트는 한 메시지로 묶습니다. 알림은 연결된 업무비서 수신처로 08~20시(한국 시간)에 보냅니다. 꺼진 상태의 수동 점검도 확인 항목을 기록하지만 알림은 보내지 않습니다.','assistant-help'));
 const list=el('div');list.id='assistant-cases-list';const history=el('details','','assistant-card');view.append(list,history);
 const names={OPEN:'확인 대기',IN_PROGRESS:'처리 중',SNOOZED:'잠시 보류',RESOLVED:'저장 상태 변경 확인'},events={DETECTED:'발견',REOPENED:'다시 확인 대상',RESOLVED:'추적 종료',REMINDER:'보류 시간 도래',TAKE:'처리 중 표시',SNOOZE:'30분 보류',RESUME:'추적 재개'};
 function render(){enabled.checked=state.enabled;list.replaceChildren();list.append(el('h3','진행 중 '+state.activeCount+'건 · 최근 최대 100건'),el('p','마지막 점검: '+(state.checkedAt?new Date(state.checkedAt).toLocaleString('ko-KR'):'아직 없음'),'assistant-help'));
  if(state.sources?.length)list.append(el('p','자료 확인 필요: '+state.sources.join(', '),'assistant-help'));
  for(const c of state.cases){const card=el('details','','assistant-card');card.append(el('summary',c.platform+' · '+(c.kind==='ORDER'?'송장 발급 전 주문':'미답변 문의')+' · '+names[c.status]),el('p','참조: '+c.source_id),el('p','자료: '+(c.observed_state==='UNKNOWN'?'확인 필요 · 마지막 관측 이후 누락 또는 조회 실패':'모아온 저장 상태')+' · 마지막 관측 '+new Date(c.last_seen_at).toLocaleString('ko-KR'),'assistant-help'));
   if(c.snooze_until)card.append(el('p','보류 종료: '+new Date(c.snooze_until).toLocaleString('ko-KR')));
   if(c.status!=='RESOLVED'){for(const [verb,title] of [['TAKE','처리 중 표시'],['SNOOZE','30분 뒤 확인'],['RESUME','추적 재개']])button(card,title,()=>run({action:'CASE_ACT',id:c.id,revision:c.revision,verb}));}
   const records=state.events.filter(e=>e.case_id===c.id);for(const e of records.slice(0,8))card.append(el('p',new Date(e.created_at).toLocaleString('ko-KR')+' · '+events[e.kind]+' · '+({SENT:'알림 전송',PENDING:'알림 대기',UNKNOWN:'전송 확인 필요',FAILED:'전송 실패',SKIPPED:'발송 안 함'})[e.delivery],'assistant-help'));list.append(card);
  }
  const runs=el('details','','assistant-card');runs.append(el('summary','최근 자동화 실행 기록'));for(const r of state.runs||[])runs.append(el('p',new Date(r.started_at).toLocaleString('ko-KR')+' · '+({RUNNING:'점검 중',SUCCEEDED:'점검 완료',PARTIAL:'일부 자료 확인 필요',UNKNOWN:'실행 결과 확인 필요'})[r.status]+' · 관측 '+(r.observations??'?')+'건'));list.append(runs);
  history.replaceChildren(el('summary','추적 기준·자동화 범위'),el('p','저장된 주문이 발급 전 확인 대상을 벗어나거나 문의에 답변 완료 표시가 확인되면 추적을 종료합니다. 목록에서 사라진 항목은 완료로 추정하지 않습니다. 원본 수집 시각은 확인되지 않으므로 실시간 배송·답변 완료를 보장하지 않습니다.'),el('p','동일 채널·종류·참조는 한 확인 항목으로 관리합니다. 처리 중 표시는 알림을 줄이며, 30분 보류 후에도 미처리 상태가 확인되면 한 번 알립니다. 수신처가 바뀌면 기존 대기 알림은 건너뜁니다. 작업 실패·전송 불확실은 기록에 남고 무조건 재전송하지 않습니다.'));
 }
 async function run(v){if(busy)return;busy=true;const current=epoch;status.textContent='확인 중…';view.querySelectorAll('button').forEach(b=>b.disabled=true);try{const r=await window.moaonHub.assistantAutomation(v);if(current!==epoch)return;if(!r.ok){status.textContent='확인 필요 · '+r.code;return;}state=r.value;render();status.textContent='확인했어요. 저장 자료 기준입니다.';}catch{status.textContent='결과를 확인하지 못했어요. 새로고침해 주세요.';}finally{busy=false;view.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 document.querySelectorAll('[data-action=hub-disconnect]').forEach(b=>b.addEventListener('click',()=>{epoch++;state=null;list.replaceChildren();history.replaceChildren();status.textContent='로그인 후 확인하세요.';}));
})();
