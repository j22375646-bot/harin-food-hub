(()=>{
 const root=document.querySelector('[data-page=assistant]');if(!root)return;
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
 const tab=el('button','학습·지식');tab.type='button';tab.dataset.assistantTab='learning';tab.setAttribute('aria-pressed','false');root.querySelector('.assistant-tabs').append(tab);
 const view=el('section','','assistant-learning');view.dataset.assistantView='learning';view.hidden=true;root.append(view);
 view.append(el('h2','자료를 검토하고, 함께 쓰는 지식으로'),el('p','학습봇이 정리한 자료를 확인하세요. 승인한 내용만 공유 지식에 반영됩니다. 개인 대화와 기억은 공유하지 않습니다.','assistant-help'));
 const status=el('p','','assistant-help');status.id='assistant-learning-status';status.setAttribute('role','status');view.append(status);
 const controls=el('div','','assistant-actions'),list=el('div','','assistant-bot-grid');view.append(controls,list);
 let data={proposals:[],knowledge:[]},filter='PENDING',busy=false,epoch=0;
 const button=(parent,text,fn,cls='')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;parent.append(b);return b;};
 const dialog=el('dialog','','assistant-dialog'),heading=el('h2'),description=el('p'),actions=el('div','','assistant-actions');dialog.append(heading,description,actions);root.append(dialog);let pending;
 button(actions,'취소',()=>dialog.close());button(actions,'확인',()=>{const f=pending;dialog.close();f?.();}).id='assistant-learning-confirm';dialog.onclose=()=>pending=null;
 const confirm=(title,text,fn)=>{heading.textContent=title;description.textContent=text;pending=fn;dialog.showModal();};
 for(const [key,label] of [['PENDING','검토 대기'],['APPROVED','승인 이력'],['REJECTED','반려 이력'],['KNOWLEDGE','공유 지식']]){const b=button(controls,label,()=>{filter=key;render();});b.dataset.learningFilter=key;}
 button(controls,'새로고침',()=>load());
 function render(){controls.querySelectorAll('[data-learning-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.learningFilter===filter)));list.replaceChildren();const rows=filter==='KNOWLEDGE'?data.knowledge:data.proposals.filter(p=>p.status===filter);if(!rows.length){list.append(el('p',filter==='PENDING'?'아직 검토할 자료가 없어요. @moaon_study_bot에 자료와 “공유 지식 등록안으로 정리해 줘”를 보내세요.':'표시할 항목이 없어요.','assistant-help'));return;}
  for(const p of rows){const card=el('article','','assistant-card');card.dataset.learningId=p.id;list.append(card);card.append(el('h3',p.title),el('p',new Date(p.updated_at).toLocaleString('ko-KR')+' · 버전 '+p.revision,'assistant-help'));
   if(filter==='KNOWLEDGE'){const body=el('p',p.body);body.style.whiteSpace='pre-wrap';card.append(body);continue;}
   card.append(el('p','출처: '+p.source,'assistant-help'));const details=el('details'),summary=el('summary','정리 내용 · 원본 지식 비교');details.append(summary);card.append(details);
   const field=(label,value,max)=>{const l=el('label',label,'assistant-field'),n=el('textarea');n.value=value;n.maxLength=max;n.rows=label==='정리 본문'?9:2;n.disabled=p.status!=='PENDING';l.append(n);details.append(l);return n;};
   const title=field('제목',p.title,160),body=field('정리 본문',p.body,7200),source=field('출처',p.source,300);
   const original=data.knowledge.find(k=>k.id===p.target_id),conflict=p.target_id&&(!original||original.revision!==p.base_revision);
   if(p.target_id){const before=el('p',original?'현재 공유 지식 (버전 '+original.revision+')\n'+original.body:'기존 자료를 찾을 수 없습니다.');before.style.whiteSpace='pre-wrap';details.append(before);}else details.append(el('p','새 공유 지식으로 등록됩니다.','assistant-help'));
   if(conflict)card.append(el('p','기존 지식이 변경되었어요. 학습봇에서 최신 자료를 기준으로 새 수정안을 제출하세요.','assistant-help'));
   if(p.status==='PENDING'){const buttons=el('div','','assistant-actions');card.append(buttons);button(buttons,'수정 저장',()=>run({action:'LEARN_EDIT',id:p.id,revision:p.revision,title:title.value.trim(),body:body.value.trim(),source:source.value.trim()}));const approve=button(buttons,'공유 지식으로 승인',()=>{if(title.value!==p.title||body.value!==p.body||source.value!==p.source){status.textContent='변경한 내용을 먼저 수정 저장하세요.';details.open=true;return;}confirm('공유 지식으로 승인할까요?','승인하면 업무비서 등 연결된 봇이 이 자료를 조회할 수 있습니다.',()=>run({action:'LEARN_APPROVE',id:p.id,revision:p.revision}));},'assistant-primary');approve.disabled=!!conflict;button(buttons,'반려',()=>confirm('등록안을 반려할까요?','공유 지식은 변경되지 않으며 검토 이력이 남습니다.',()=>run({action:'LEARN_REJECT',id:p.id,revision:p.revision})));}
  }
 }
 async function load(){return run({action:'LEARN_READ'});}
 async function run(input){if(busy)return;busy=true;const version=epoch;view.setAttribute('aria-busy','true');status.textContent='자료를 확인하고 있어요…';try{await root.assistantCommonLoad;const r=await window.moaonHub.assistantAutomation(input);if(version!==epoch)return;if(!r.ok){status.textContent=r.code==='ASSISTANT_CONFLICT'?'자료가 변경되었어요. 새로고침 후 다시 확인하세요.':r.code==='ASSISTANT_INVALID'?'제목·본문·출처를 모두 입력하고 길이를 확인하세요.':'처리 결과 확인 필요 · 새로고침으로 상태를 확인하세요.';return;}const next=input.action==='LEARN_READ'?r:await window.moaonHub.assistantAutomation({action:'LEARN_READ'});if(version!==epoch)return;if(!next.ok)throw Error();data=next.value;render();status.textContent=input.action==='LEARN_APPROVE'?'승인했어요. 공유 지식에 반영됐습니다.':input.action==='LEARN_EDIT'?'수정 내용을 저장했어요.':input.action==='LEARN_REJECT'?'반려했어요. 공유 지식은 변경되지 않았습니다.':'학습 자료를 확인했어요.';}catch{status.textContent='연결 결과 확인 필요 · 새로고침해 주세요.';}finally{busy=false;view.removeAttribute('aria-busy');}}
 tab.onclick=()=>{root.querySelectorAll('[data-assistant-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));root.querySelectorAll('[data-assistant-view]').forEach(v=>v.hidden=v!==view);load();};
 document.querySelectorAll('[data-action=hub-disconnect]').forEach(b=>b.addEventListener('click',()=>{epoch++;data={proposals:[],knowledge:[]};list.replaceChildren();dialog.close();status.textContent='로그인 후 확인하세요.';}));
})();
