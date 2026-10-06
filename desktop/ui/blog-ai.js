'use strict';
(()=>{
 const host=document.querySelector('#content-panel-blog .blog-workspace');if(!host)return;
 const contract=window.moaonBlogAiContract;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const box=el('section');box.className='blog-ai blog-connection';box.setAttribute('aria-label','Gemini 블로그 초안');
 box.append(el('h3','Gemini와 블로그 초안 만들기'),el('p','제품 정보와 글의 목적을 알려주세요. 초안을 확인한 뒤 편집기에 적용할 수 있어요.'),el('small','모아온의 기존 Gemini 연결·사용량을 이용합니다. 입력한 자료와 생성 결과는 Gemini 대화 기록에 저장됩니다.'));
 function field(label,id,tag,max){const l=el('label',label),x=el(tag);x.id=id;l.htmlFor=id;if(max)x.maxLength=max;box.append(l,x);return x;}
 const facts=field('제품 정보 · 확인된 사실만 입력','blog-ai-facts','textarea',2000);facts.rows=4;facts.placeholder='제품명, 용량, 원재료, 직접 확인한 특징, 우리는 방법 등';
 const purpose=field('글의 목적 · 독자','blog-ai-purpose','input',250);purpose.placeholder='예: 처음 구매하는 고객에게 제품과 활용법 소개';
 const tone=field('글의 말투','blog-ai-tone','select');contract.tones.forEach(t=>tone.append(el('option',t)));
 const actions=el('div');actions.className='blog-actions';
 const status=el('p','제품 정보를 입력하고 초안 만들기를 눌러 주세요.');status.className='blog-status';status.setAttribute('role','status');
 const result=el('section');result.className='blog-ai-result';result.hidden=true;
 const resultTitle=el('h4'),resultBody=el('div'),checks=el('ul'),apply=el('button','편집기에 적용');resultBody.className='blog-preview-body';apply.type='button';apply.className='content-guide-button';result.append(el('small','Gemini 생성 초안 · 아직 편집기에 적용하지 않았어요.'),resultTitle,resultBody,el('strong','발행 전 확인할 내용'),checks,apply);
 let epoch=0,busy=false,candidate=null;
 const errors={LOGIN_REQUIRED:'모아온에 로그인한 뒤 다시 시도해 주세요.',DISCONNECTED:'모아온 계정을 먼저 연결해 주세요.',SETUP_REQUIRED:'앱 설정의 Gemini 연결 상태를 확인해 주세요.',DISABLED:'Gemini 사용이 꺼져 있어요. 앱 설정에서 확인해 주세요.',FORBIDDEN:'현재 계정에 Gemini 사용 권한이 없어요.',QUOTA_BLOCKED:'Gemini 사용량 한도에 도달했어요. 초기화 후 다시 시도해 주세요.',PENDING:'다른 Gemini 요청이 진행 중이에요. 완료 후 다시 시도해 주세요.',TIMEOUT:'생성 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.',INVALID_OUTPUT:'응답 형식이 맞지 않아 초안을 적용하지 않았어요. 다시 생성해 주세요.',CANCELLED:'요청이 취소됐어요.',SAVE_FAILED:'생성 결과 저장을 확인하지 못했어요. Gemini 대화 기록을 확인해 주세요.'};
 const message=r=>errors[r?.status]||'Gemini 요청을 완료하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.';
 const make=el('button','Gemini 초안 만들기'),check=el('button','Gemini 연결 확인');for(const b of [make,check]){b.type='button';b.className='content-guide-button';actions.append(b);}
 function lock(value){busy=value;make.disabled=check.disabled=value;facts.readOnly=purpose.readOnly=value;tone.disabled=value;}
 check.onclick=async()=>{if(busy)return;const e=epoch;lock(true);status.textContent='Gemini 연결 확인 중…';try{const r=await window.moaonHub.generalChat({operation:'LIST'});if(e!==epoch)return;status.textContent=r.ok&&r.configuration?.ready&&r.configuration?.enabled?'Gemini 연결 준비 완료 · 초안을 생성할 수 있어요.':message(r.ok?r.configuration:r);}catch{if(e===epoch)status.textContent=message();}finally{if(e===epoch)lock(false);}};
 make.onclick=async()=>{if(busy)return;let question;try{question=contract.prompt({facts:facts.value,purpose:purpose.value,tone:tone.value});}catch{status.textContent='제품 정보를 입력해 주세요. 최대 2,000자까지 사용할 수 있어요.';facts.focus();return;}
  const e=epoch;lock(true);candidate=null;result.hidden=true;status.textContent='Gemini가 초안을 작성하고 있어요… 보통 30초 이내에 결과가 표시됩니다.';
  try{const r=await window.moaonHub.generalChat({operation:'GENERATE',input:{requestId:crypto.randomUUID(),conversationId:crypto.randomUUID(),question,reportIds:[],files:[],model:'gemini-3.5-flash-lite'}});if(e!==epoch)return;if(!r.ok){status.textContent=message(r);return;}
   try{candidate=contract.parse(r.turn.answer);}catch{status.textContent=message({status:'INVALID_OUTPUT'});return;}
   resultTitle.textContent=candidate.title;resultBody.textContent=candidate.body;checks.replaceChildren(...(candidate.checks.length?candidate.checks:['입력한 제품 정보와 생성 문구가 일치하는지 확인해 주세요.']).map(t=>el('li',t)));result.hidden=false;status.textContent='초안을 만들었어요. 내용을 확인한 뒤 편집기에 적용해 주세요.';
  }catch{if(e===epoch)status.textContent=message();}finally{if(e===epoch)lock(false);}
 };
 apply.onclick=()=>{if(!candidate)return;const title=document.getElementById('blog-title'),body=document.getElementById('blog-body');if((title.value||body.value)&&!confirm('현재 편집기의 제목과 본문을 Gemini 초안으로 바꿀까요?'))return;title.value=candidate.title;body.value=candidate.body;body.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='편집기에 적용했어요. 수정 후 초안 파일로 저장해 주세요.';};
 box.append(actions,status,result);host.insertBefore(box,host.querySelector('.blog-editor-grid'));
 document.addEventListener('moaon-session-changed',()=>{epoch++;lock(false);candidate=null;facts.value=purpose.value='';tone.selectedIndex=0;result.hidden=true;resultTitle.textContent=resultBody.textContent='';checks.replaceChildren();status.textContent='제품 정보를 입력하고 초안 만들기를 눌러 주세요.';});
})();
