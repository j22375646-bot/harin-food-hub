'use strict';
(()=>{
 const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const root=$('insight-ai');if(!root)return;
 const messages={DISABLED:'분석 AI 사용이 꺼져 있어요. 기존 보고서는 계속 볼 수 있어요.',SETUP_REQUIRED:'분석 AI 계정과 자료 처리 설정을 확인해야 해요.',BLOCKED:'설명할 자료가 충분하지 않아요. 보고서 근거를 확인해 주세요.',PARTIAL:'일부 자료 확인 필요',STALE:'이전 자료 · 현재 행동 판단 보류',READY:'분석 초안',COMPLETE:'자료 확인 완료',BUDGET_BLOCKED:'설정한 사용 한도에 도달했어요.',QUOTA_BLOCKED:'공급자 사용 한도에 도달했어요. 나중에 다시 시도해 주세요.',TIMEOUT:'응답 시간이 초과됐어요. 사용량 확인 후 다시 시도해 주세요.',INVALID_OUTPUT:'근거 검증을 통과하지 못해 답변을 표시하지 않았어요.',PENDING:'근거에 맞는 설명을 작성하고 있어요…',OUT_OF_SCOPE:'현재 네이버 광고 자료의 범위를 벗어난 질문이에요.',CANCELLED:'화면의 대기를 취소했어요. 이미 시작한 요청에는 사용량이 발생할 수 있어요.',FORBIDDEN:'사업장 접근 권한을 확인해 주세요.',LOGIN_REQUIRED:'사업장에 다시 연결해 주세요.'};
 let reports=[],ids=[],generation=0,busy=false,run=null,runs=[],configuration=null,questionOpen=false,loaded=false,status='',historyBusy=false;
 let historyGeneration=0,pendingQuestion='',transcriptResize=null,draftText='',restored=false;
 Object.assign(messages,{SUCCEEDED:'분석 초안을 만들었어요.',SCOPE_BLOCKED:'현재 네이버 광고 자료로는 확인할 수 없는 질문이에요.',QUESTION_PRIVACY_BLOCKED:'개인정보가 포함된 질문은 보낼 수 없어요. 개인정보를 제외하고 다시 질문해 주세요.',ALREADY_PROCESSED:'이미 처리한 요청이에요. 분석 기록을 확인해 주세요.'});
 const button=(label,action)=>{const b=el('button','',label);b.type='button';b.onclick=action;return b;};
 const date=v=>typeof v==='string'?v.slice(0,10):'확인 필요';
 const time=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleString('ko-KR'):'확인 필요';};
 function notice(code){status=messages[code]||'요청을 마치지 못했어요. 연결과 자료 상태를 확인한 뒤 다시 시도해 주세요.';}
 function restorePendingDraft(){if(pendingQuestion)draftText=pendingQuestion;const input=$('insight-ai-question');if(input&&pendingQuestion){input.value=pendingQuestion;pendingQuestion='';}}
 function cancel(){restorePendingDraft();generation++;busy=false;void window.moaonHub?.cancelInsightAi?.();notice('CANCELLED');render();}
 function discardDraft(){draftText='';pendingQuestion='';const input=$('insight-ai-question');if(input)input.value='';}
 function clear(){if(busy)void window.moaonHub?.cancelInsightAi?.();discardDraft();generation++;historyGeneration++;busy=false;historyBusy=false;reports=[];ids=[];run=null;runs=[];restored=false;configuration=null;questionOpen=false;loaded=false;status='사업장 연결 후 네이버 저장 보고서를 선택해 주세요.';render();}
 function setScope({reportIds=[],snapshotHash}={}){
  const next=[...new Set(reportIds)].filter(id=>reports.some(r=>r.id===id)).slice(0,2);
  if(JSON.stringify(next)===JSON.stringify(ids)&&(!snapshotHash||snapshotHash===run?.snapshotHash))return;
  if(busy)void window.moaonHub?.cancelInsightAi?.();discardDraft();generation++;busy=false;ids=next;run=null;status='선택한 저장 보고서만 설명합니다. 새 질문은 이 자료에서 시작해요.';render();
 }
 function setReports(value){
  if(!Array.isArray(value))return;
  const old=JSON.stringify(reports.map(r=>[r.id,r.periodStart,r.periodEnd,r.createdAt]));
  reports=value.slice(0,20);
  if(old!==JSON.stringify(reports.map(r=>[r.id,r.periodStart,r.periodEnd,r.createdAt]))){if(ids.some(id=>!reports.some(r=>r.id===id))){if(busy)void window.moaonHub?.cancelInsightAi?.();discardDraft();generation++;busy=false;run=null;}ids=ids.filter(id=>reports.some(r=>r.id===id));if(!ids.length&&reports.length)ids=[reports[0].id];}
  render();if(!loaded&&reports.length){loaded=true;void loadHistory();}
 }
 function closeQuestion(focus=false){if(!busy)draftText=$('insight-ai-question')?.value??draftText;questionOpen=false;render();if(focus)$('insight-ai-launcher')?.focus({preventScroll:true});}
 function openQuestion(){window.moaonGeneralChat?.close();window.moaonInsights?.closeDetail(false);questionOpen=true;render();window.moaonInsights?.ensure();$('insight-ai-question')?.focus({preventScroll:true});}
 async function loadHistory(){
  if(historyBusy||!window.moaonHub?.insightAi)return;const expected=++historyGeneration;historyBusy=true;render();
  try{const response=await window.moaonHub.insightAi({operation:'LIST'});if(expected!==historyGeneration)return;if(response?.ok){const received=Array.isArray(response.runs)?response.runs:[];runs=run?.id?[run,...received.filter(r=>r.id!==run.id)]:received;configuration=response.configuration||null;if(!restored){restored=true;const latest=runs.find(r=>(r.reportIds||[]).length&&(r.reportIds||[]).every(id=>reports.some(p=>p.id===id)));if(!run&&latest){run=latest;ids=[...latest.reportIds];}}if(!busy&&configuration?.status&&(!run||['DISABLED','SETUP_REQUIRED'].includes(configuration.status)))notice(configuration.status);}else if(!busy)notice(response?.status);}
  catch{if(expected===historyGeneration&&!busy)notice('UNAVAILABLE');}finally{if(expected===historyGeneration){historyBusy=false;render();}}
 }
 async function generate(kind){
  if(busy||historyBusy||!ids.length||!window.moaonHub?.insightAi)return;
  const question=kind==='QUESTION'?$('insight-ai-question').value.trim():'';
  if(kind==='QUESTION'&&(!question||Array.from(question).length>500||(run?.turn||0)>=6))return;
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const input={requestId:[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'),reportIds:[...ids],question,kind};
  if(kind==='QUESTION'&&run?.id)input.parentRunId=run.id;
  const expected=++generation;busy=true;draftText='';pendingQuestion=question;notice('PENDING');render();
  try{const response=await window.moaonHub.insightAi({operation:'GENERATE',input});if(expected!==generation)return;
   if(response?.ok&&response.run){run=response.run;draftText='';pendingQuestion='';notice(run.status);if(run.id)runs=[run,...runs.filter(r=>r.id!==run.id)].slice(0,50);}
   else notice(response?.status);
  }catch{if(expected===generation)notice('UNAVAILABLE');}finally{if(expected===generation){busy=false;restorePendingDraft();render();}}
 }
 async function remove(id){
  if(busy)return;const expected=++generation;busy=true;render();
  try{const response=await window.moaonHub.insightAi({operation:'DELETE',runId:id});if(expected!==generation)return;if(response?.ok&&response.deleted){runs=runs.filter(r=>r.id!==id);if(run?.id===id){run=null;}status='분석 기록을 삭제했어요.';}else notice(response?.status);}
  catch{if(expected===generation)notice('UNAVAILABLE');}finally{if(expected===generation){busy=false;render();}}
 }
 async function deleteConversation(){
  if(busy||!run)return;
  const chain=[];let item=run;while(item&&chain.length<6&&!chain.includes(item.id)){chain.push(item.id);item=runs.find(r=>r.id===item.parentRunId&&r.snapshotHash===run.snapshotHash&&JSON.stringify(r.reportIds)===JSON.stringify(run.reportIds));}
  const dialog=el('dialog','insight-ai');dialog.setAttribute('aria-label','대화 삭제 확인');dialog.append(el('h2','','이 대화를 삭제할까요?'),el('p','','현재 대화와 연결된 이전 답변을 삭제합니다. 다른 대화는 유지됩니다.'));
  const no=button('취소',()=>dialog.close()),yes=button('대화 삭제',async()=>{dialog.close();for(const id of chain){await remove(id);if(runs.some(r=>r.id===id))break;}render();});dialog.append(no,yes);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.querySelector('.app-area').append(dialog);dialog.showModal();no.focus({preventScroll:true});
 }
 function renderChat(draft,hadFocus){
  const panel=el('aside','insight-ai insight-ai-chat');panel.id='insight-ai-chat';panel.dataset.aiPanel='';panel.setAttribute('aria-labelledby','insight-ai-chat-title');
  const head=el('header','insight-ai-chat-heading'),title=el('h2','','모아온 AI');title.id='insight-ai-chat-title';head.append(title,button('닫기',()=>closeQuestion(true)));panel.append(head);const context=el('p','insight-ai-page-context',`현재 화면 · ${$('app-breadcrumb-page')?.textContent||'모아온'} · 화면 데이터 자동 전송 안 함`);panel.append(context);const tools=el('div','insight-ai-chat-tools');const fresh=button('새 대화',()=>{if(busy)return;discardDraft();run=null;status='새 대화 · 선택한 네이버 보고서를 사용합니다.';render();});fresh.disabled=busy;tools.append(fresh);const history=el('details','');history.append(el('summary','','대화 기록'));for(const item of runs){const choice=button(item.question||`${date(item.createdAt)} · 보고서 분석`,()=>{if(busy)return;discardDraft();run=item;ids=[...(item.reportIds||[])];notice(item.status);render();});choice.disabled=busy;history.append(choice);}if(!runs.length)history.append(el('p','','저장된 대화가 없어요.'));tools.append(history);if(run){const del=button('대화 삭제',deleteConversation);del.disabled=busy;tools.append(del);}panel.append(tools);const scopePicker=root.querySelector('.insight-ai-picker');if(scopePicker){const copy=scopePicker.cloneNode(true);copy.querySelectorAll('input').forEach((input,i)=>{input.onchange=()=>{const report=reports[i];setScope({reportIds:input.checked?[...ids,report.id]:ids.filter(id=>id!==report.id)});};});panel.append(copy);}
  panel.append(el('p','insight-ai-chat-scope','사용 자료 · 네이버 광고 보고서\n'+ids.map(id=>{const report=reports.find(r=>r.id===id);return `${date(report?.periodStart)} — ${date(report?.periodEnd)}`;}).join(' / ')));
  const transcript=el('div','insight-ai-transcript');transcript.setAttribute('role','log');transcript.setAttribute('aria-label','선택한 네이버 자료의 대화');transcript.setAttribute('aria-live','polite');transcript.tabIndex=0;
  const chain=[];let cursor=run;const seen=new Set();
  while(cursor&&chain.length<6&&!seen.has(cursor.id)){seen.add(cursor.id);chain.unshift(cursor);const parent=runs.find(r=>r.id===cursor.parentRunId);cursor=parent&&run.snapshotHash&&parent.snapshotHash===run.snapshotHash&&JSON.stringify(parent.reportIds)===JSON.stringify(run.reportIds)?parent:null;}
  function bubble(role,text){const item=el('article',`insight-ai-message is-${role}`);item.append(el('strong','',role==='user'?'나':'네이버 분석 AI'),el('p','',text));transcript.append(item);return item;}
  for(const turn of chain){if(turn.question)bubble('user',turn.question);const reply=turn.answer||(turn.cards||[]).map(c=>`${c.observation}\n${c.hypothesis}\n다음 확인 · ${c.nextCheck}`).join('\n\n');const item=bubble('assistant',reply||messages[turn.status]||'답변을 확인할 수 없어요.');for(const id of [...new Set((turn.cards||[]).flatMap(c=>c.evidenceRefs||[]))]){const evidence=button('보고서 근거 보기',()=>{closeQuestion();showRoute('insights');window.moaonInsights?.showReport(id);});evidence.dataset.aiEvidence=id;item.append(evidence);}if((turn.nextChecks||[]).length||(turn.exclusions||[]).length){const limits=el('details','insight-ai-chat-limits');limits.append(el('summary','','확인할 점·자료 한계'));for(const text of [...(turn.nextChecks||[]),...(turn.exclusions||[])])limits.append(el('p','',text));item.append(limits);}item.append(el('small','',`${date(turn.createdAt)} · ${messages[turn.dataState]||'자료 확인 필요'}`));}
  if(!chain.length)transcript.append(el('p','insight-ai-chat-empty',configuration?.ready===false?'AI 연결 준비 필요 · CLOVA 계정 연결 후 답변할 수 있어요.':configuration?.enabled===false?'분석 AI 사용이 꺼져 있어요. 기존 보고서는 계속 볼 수 있어요.':'선택한 네이버 광고 보고서에서 궁금한 점을 질문해 주세요. 답변은 자료 확인 후 생성됩니다.'));
  if(busy&&pendingQuestion)bubble('user',pendingQuestion);
  if(busy)bubble('assistant',messages.PENDING);
  panel.append(transcript);
  const composer=el('div','insight-ai-composer'),suggestions=el('div','insight-ai-suggestions');suggestions.setAttribute('aria-label','질문 예시');
  for(const text of ['광고 성과가 달라진 이유는?','다음에 확인할 항목은?']){const choice=button(text,()=>{const input=$('insight-ai-question');input.value=text;input.dispatchEvent(new Event('input'));input.focus({preventScroll:true});});choice.disabled=busy;suggestions.append(choice);}composer.append(suggestions);
  const label=el('label','','이 자료에 질문하기');label.htmlFor='insight-ai-question';const input=el('textarea');input.id='insight-ai-question';input.dataset.aiQuestion='';input.maxLength=500;input.rows=3;input.value=busy?'':draft;input.disabled=busy;input.placeholder='네이버 광고 자료에 대해 질문해 주세요';input.setAttribute('aria-describedby','insight-ai-question-help');
  const help=el('p','insight-ai-meta');help.id='insight-ai-question-help';const send=button('질문 보내기',()=>generate('QUESTION'));send.dataset.aiSend='';const unavailable=configuration?.enabled===false||configuration?.ready===false;
  const update=()=>{const length=Array.from(input.value.trim()).length;help.textContent=`${length} / 500자 · ${run?.turn||0} / 6턴 · 개인정보는 입력하지 마세요`;send.disabled=busy||historyBusy||!ids.length||!length||length>500||(run?.turn||0)>=6||unavailable;};input.oninput=()=>{pendingQuestion='';draftText=input.value;update();};input.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();if(!send.disabled)void generate('QUESTION');}};update();
  composer.append(label,input,help);const state=el('p','insight-ai-chat-status',status);state.setAttribute('role','status');composer.append(state);const controls=el('div','insight-ai-actions');controls.append(send);if(busy)controls.append(button('대기 취소',cancel));composer.append(controls);panel.append(composer);document.querySelector('.app-area').append(panel);
  transcript.scrollTop=transcript.scrollHeight;let followLatest=true;transcript.addEventListener('scroll',()=>{followLatest=transcript.scrollHeight-transcript.clientHeight-transcript.scrollTop<12;});transcriptResize=new ResizeObserver(()=>{if(followLatest)transcript.scrollTop=transcript.scrollHeight;});transcriptResize.observe(transcript);requestAnimationFrame(()=>{if(transcript.isConnected)transcript.scrollTop=transcript.scrollHeight;});if(hadFocus&&!busy)input.focus({preventScroll:true});
 }
 const launcher=button('CLOVA 분석 대화',()=>questionOpen?closeQuestion(true):openQuestion());
 launcher.id='insight-ai-launcher';launcher.className='insight-ai-launcher';launcher.setAttribute('aria-controls','insight-ai-chat');root.before(launcher);
 function render(){
  launcher.setAttribute('aria-expanded',String(questionOpen));launcher.setAttribute('aria-label',questionOpen?'AI 대화창 닫기':'AI 대화창 열기');
  const draft=busy?'':($('insight-ai-question')?.value??draftText);if(!busy)draftText=draft;const hadFocus=document.activeElement?.id==='insight-ai-question';transcriptResize?.disconnect();$('insight-ai-chat')?.remove();document.querySelector('.app-area')?.classList.toggle('has-global-ai',questionOpen);
  root.replaceChildren();root.setAttribute('aria-busy',String(busy));
  const heading=el('header','insight-ai-heading');heading.append(el('div','',undefined));heading.firstChild.append(el('h2','','선택한 보고서 살펴보기'),el('p','','네이버 광고 · 저장 보고서에 근거한 AI 설명'));
  const badge=el('span','insight-ai-badge','AI 초안');heading.append(badge);root.append(heading);
  const chooser=el('details','insight-ai-picker'),summary=el('summary','',`${ids.length} / 2개 선택 · ${ids.map(id=>{const r=reports.find(r=>r.id===id);return `${date(r?.periodStart)} — ${date(r?.periodEnd)}`;}).join(' / ')||'보고서 선택'}`);chooser.append(summary);
  const choices=el('fieldset','insight-ai-scope');choices.append(el('legend','','분석할 보고서 · 최대 두 개'));
  for(const report of reports){const label=el('label','insight-ai-choice');const input=el('input');input.type='checkbox';input.checked=ids.includes(report.id);input.disabled=busy||!input.checked&&ids.length>=2;input.onchange=()=>setScope({reportIds:input.checked?[...ids,report.id]:ids.filter(id=>id!==report.id)});label.append(input,el('span','',`${report.title} · ${date(report.periodStart)} — ${date(report.periodEnd)}`));choices.append(label);}
  if(!reports.length)choices.append(el('p','','저장된 보고서를 조회하면 선택할 수 있어요.'));chooser.append(choices);root.append(chooser);
  const actions=el('div','insight-ai-actions'),go=button('선택한 자료 설명하기',()=>generate('SUMMARY'));
  go.disabled=busy||historyBusy||!ids.length||configuration?.enabled===false||configuration?.ready===false;go.dataset.aiGenerate='';
  const ask=button('이 자료에 질문하기',openQuestion);ask.dataset.aiOpen='';ask.setAttribute('aria-controls','insight-ai-chat');ask.setAttribute('aria-expanded',String(questionOpen));ask.disabled=!ids.length;actions.append(go,ask);if(busy)actions.append(button('대기 취소',cancel));root.append(actions);
  const state=el('p','insight-ai-status',status||'버튼을 누르면 분석을 생성해요. 페이지 조회에는 생성 요청이 발생하지 않아요.');state.setAttribute('role','status');root.append(state);
  if(run){
   const meta=el('p','insight-ai-meta',`${messages[run.dataState]||run.dataState||'자료 확인 필요'} · ${date(run.period?.start)} — ${date(run.period?.end)} · ${run.provider||'엔진 확인 필요'} ${run.model||''} · 생성 ${time(run.createdAt)}${run.reused?' · 저장 결과 재사용':''}`);root.append(meta,el('p','insight-ai-meta',`원천 수집 시각 ${time(run.sourceAsOf)} · 전체 주문 매출과 다른 네이버 광고 자료`));
   const cards=el('div','insight-ai-cards');for(const c of (run.cards||[]).slice(0,5)){const card=el('article','insight-ai-card');card.append(el('h3','',c.observation),el('p','',c.hypothesis),el('strong','','다음 확인'),el('p','',c.nextCheck));const evidence=el('div','insight-ai-evidence');for(const id of c.evidenceRefs||[]){const b=button('보고서 근거 보기',()=>{closeQuestion();window.moaonInsights?.showReport(id);});b.dataset.aiEvidence=id;evidence.append(b);}card.append(evidence);cards.append(card);}root.append(cards);
   if(run.answer)root.append(el('p','insight-ai-answer',run.answer));
   for(const check of run.nextChecks||[])root.append(el('p','',check));
   const caveats=el('ul','insight-ai-caveats');for(const text of run.exclusions||[])caveats.append(el('li','',text));root.append(caveats);
   const usage=run.usage;root.append(el('p','insight-ai-meta',usage?`사용량 · 입력 ${usage.promptTokens??'확인 필요'} / 출력 ${usage.completionTokens??'확인 필요'} 토큰`:'사용량 확인 필요'));
   const chain=[];let prior=runs.find(r=>r.id===run.parentRunId);while(prior&&chain.length<5&&!chain.some(r=>r.id===prior.id)&&prior.snapshotHash===run.snapshotHash&&JSON.stringify(prior.reportIds)===JSON.stringify(run.reportIds)){chain.unshift(prior);prior=runs.find(r=>r.id===prior.parentRunId);}
   if(chain.length){const conversation=el('details','insight-ai-history');conversation.append(el('summary','','이 자료의 이전 대화'));for(const turn of chain){if(turn.question)conversation.append(el('h3','',turn.question));if(turn.answer)conversation.append(el('p','',turn.answer));}root.append(conversation);}
  }
  if(questionOpen)renderChat(draft,hadFocus);
  const history=el('details','insight-ai-history');history.append(el('summary','','분석 기록'));const reload=button('기록 새로 조회',loadHistory);reload.disabled=busy||historyBusy||!reports.length;history.append(reload);
  for(const item of runs){const row=el('div','insight-ai-history-row'),open=button(`${date(item.period?.start)} — ${date(item.period?.end)} · ${time(item.createdAt)} · ${messages[item.status]||item.status}`,()=>{discardDraft();generation++;busy=false;run=item;ids=(item.reportIds||[]).filter(id=>reports.some(r=>r.id===id));questionOpen=false;notice(item.status);render();});open.disabled=busy;row.append(open);const del=button('기록 삭제',()=>remove(item.id));del.disabled=busy;row.append(del);history.append(row);}if(!runs.length)history.append(el('p','','저장된 분석 기록이 없어요.'));root.append(history);
 }
 new MutationObserver(()=>{const n=document.querySelector('.insight-ai-page-context');if(n)n.textContent=`현재 화면 · ${$('app-breadcrumb-page')?.textContent||'모아온'} · 화면 데이터 자동 전송 안 함`;}).observe($('app-breadcrumb-page'),{childList:true,characterData:true,subtree:true});
 window.moaonInsightAI=Object.freeze({setScope,setReports,clear,openQuestion,closeQuestion});
 window.addEventListener('moaon-ai-keys-changed',event=>{if(event.detail?.provider!=='CLOVA')return;historyGeneration++;historyBusy=false;configuration=null;loaded=false;if(reports.length){loaded=true;void loadHistory();}});
 document.querySelector('.app-area')?.addEventListener('keydown',event=>{if(event.key==='Escape'&&questionOpen){event.preventDefault();closeQuestion(true);}});
 root.addEventListener('keydown',event=>{if(event.key==='Escape'&&questionOpen){event.preventDefault();closeQuestion(true);}});render();
})();
