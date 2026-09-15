'use strict';
(()=>{
 const root=document.querySelector('[data-page=assistant]');if(!root)return;
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
 const button=(parent,text,fn,cls='')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;parent.append(b);return b;};
 const tab=el('button','연결 가이드');tab.type='button';tab.dataset.assistantTab='guide';tab.setAttribute('aria-pressed','false');const tabs=root.querySelector('.assistant-tabs');tabs.insertBefore(tab,tabs.children[1]);
 const view=el('section','','assistant-guide');view.dataset.assistantView='guide';view.hidden=true;root.append(view);
 const status=el('p','','guide-copy-status');status.setAttribute('role','status');
 function open(){root.querySelectorAll('[data-assistant-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));root.querySelectorAll('[data-assistant-view]').forEach(v=>v.hidden=v!==view);}
 tab.onclick=open;
 const jump=(name)=>{const target=root.querySelector('[data-assistant-tab="'+name+'"]');if(target){target.click();target.scrollIntoView({block:'nearest'});}};
 async function copy(text){try{const r=await window.moaonHub.copyEventText(text);if(r?.ok===false)throw Error();status.textContent='복사했어요. 텔레그램 검색 또는 메시지 입력칸에 붙여 넣으세요.';}catch{status.textContent='복사하지 못했어요. 표시된 내용을 직접 선택해 복사해 주세요.';}}
 const banner=el('aside','','guide-entry');banner.append(el('div','처음 연결하시나요?','guide-entry-title'),el('p','기존 봇 사용부터 알림 설정, 계정 이전까지 순서대로 안내해 드릴게요.'));button(banner,'연결 가이드 보기 →',open);root.querySelector('[data-assistant-view=home]')?.prepend(banner);
 const head=el('div','','guide-heading');head.append(el('span','START HERE','guide-eyebrow'),el('h2','처음이어도, 하나씩 연결해요'),el('p','처음 사용하는 분과 봇을 관리하는 분의 준비 과정이 달라요. 내 상황부터 선택해 주세요.'));view.append(head);
 const roles=el('div','','guide-role-tabs');roles.setAttribute('aria-label','연결 안내 대상');view.append(roles);
 const body=el('div');view.append(body,status);
 let role='user';const choices=[];
 for(const [key,title,desc] of [['user','기존 봇 사용하기','이미 있는 모아온 봇에 참여해요'],['owner','운영자 설정하기','연결·권한·알림을 관리해요'],['hermes','Hermes 서버 연결','서버 준비부터 자동화 점검까지']]){const b=button(roles,'',()=>{role=key;render();});b.dataset.guideRole=key;b.append(el('strong',title),el('span',desc));choices.push(b);}
 function step(parent,n,title,text,actions=[]){const card=el('article','','guide-step');card.append(el('span',String(n).padStart(2,'0'),'guide-step-number'));const content=el('div');content.append(el('h3',title),el('p',text));const controls=el('div','','guide-actions');for(const [label,fn] of actions)button(controls,label,fn);content.append(controls);card.append(content);parent.append(card);}
 function render(){choices.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guideRole===role)));body.replaceChildren();const steps=el('div','','guide-steps');body.append(steps);
  if(role==='user'){
   step(steps,1,'필요한 봇을 골라요','업무비서는 주문·문의·브리핑, 개인비서는 내 업무·아이디어, 학습비서는 제품·운영 자료 정리에 사용해요. 아래 사용자명을 텔레그램에서 검색하세요.');
   const bots=el('div','','guide-bot-list');for(const [title,handle] of [['업무비서','moaon_hub_bot'],['개인비서','moaon_solo_bot'],['학습비서','moaon_study_bot']]){const card=el('article');card.append(el('strong',title),el('code','@'+handle));button(card,'사용자명 복사',()=>copy('@'+handle));bots.append(card);}steps.append(bots);
   step(steps,2,'시작을 누르고 사용 권한을 받아요','봇 대화에서 시작 또는 /start를 보내세요. 응답이 없으면 운영자에게 내 텔레그램 숫자 ID의 허용 여부를 확인해 달라고 요청하세요. @사용자명과 숫자 ID는 다릅니다. 연결 승인 코드가 나오면 운영자에게 전달하세요.',[['/start 복사',()=>copy('/start')]]);
   step(steps,3,'내 업무를 연결해요','개인비서의 업무 조회·완료 기능은 모아온 계정 연결이 필요해요. 현재 개인·학습비서는 각각 한 개의 개인 텔레그램 계정을 연결하는 구조입니다. 모아온에 가입했다고 자동 연결되지는 않아요. 운영자와 연결 대상을 먼저 확인하세요.',[['텔레그램 봇 설정 보기',()=>jump('bots')]]);
   step(steps,4,'메뉴로 첫 대화를 시작해요','권한 연결이 끝나면 “메뉴”를 보내세요. 업무비서의 업무 브리핑이나 개인비서의 오늘 내 업무를 눌러 확인할 수 있어요. 원래 대화처럼 질문해도 됩니다.',[['메뉴 복사',()=>copy('메뉴')],['메뉴 설정 보기',()=>jump('menus')]]);
  }else if(role==='owner'){
   const note=el('p','현재 앱은 아래에 지정된 모아온 세 봇의 사용자명을 확인합니다. 임의로 새 봇을 만든 뒤 토큰만 넣는 방식은 지원하지 않아요. 기존 연결이 있으면 토큰을 다시 만들 필요가 없습니다.','guide-note');steps.append(note);
   step(steps,1,'봇 소유권과 서버를 준비해요','BotFather는 봇 생성·소유권·토큰을 관리하고, Hermes 서버는 실제 AI 대화를 실행해요. BotFather에서 /mybots로 기존 봇을 확인하세요. 별도 봇으로 운영하려면 지원 사용자명 등록 작업이 먼저 필요합니다.',[['BotFather 사용자명 복사',()=>copy('@BotFather')],['/mybots 복사',()=>copy('/mybots')]]);
   step(steps,2,'대화 연결과 수신처를 저장해요','텔레그램 봇 탭에서 해당 봇의 토큰, 대화 ID와 허용 사용자 숫자 ID를 입력해 저장하세요. 본인 계정에서 먼저 /start를 보내야 합니다. 저장된 토큰은 비워두면 유지됩니다. 개인·학습비서는 개인 대화, 업무비서는 개인 또는 그룹을 사용할 수 있어요.',[['텔레그램 봇 설정 열기',()=>jump('bots')]]);
   step(steps,3,'모아온 자료 조회를 연결해요','연결 설정에서 조회 키를 발급하고 관리자가 Hermes 연결기에 등록합니다. 봇 대화 연결과 자료 조회는 별도예요. 토큰은 봇 접속용, 조회 키는 모아온 자료 접근용입니다. 개인 업무는 텔레그램 봇 탭에서 현재 모아온 계정까지 연결하세요.',[['연결 설정 열기',()=>jump('connections')]]);
   step(steps,4,'시험 알림과 실제 대화를 모두 확인해요','저장 후 Hermes 적용에는 약 2분이 걸릴 수 있어요. 상태 새로고침으로 “Hermes 실행 중”을 확인하고 시험 알림을 보내세요. 시험 알림 성공은 메시지 전송 확인입니다. AI 답변과 업무 자료 조회도 각각 확인해야 합니다.',[['연결 상태·시험 알림',()=>jump('bots')]]);
   step(steps,5,'예약 브리핑과 메뉴를 정해요','예약·알림에서 봇별 시간·요일·발송 스위치·내용을 저장하세요. 시간은 한국 시간 기준입니다. 봇 메뉴에서 항목과 순서를 바꾸고, 텔레그램에서 “메뉴”를 보내 다시 표시하세요. 표시된 설명은 현재 연결 상태를 뜻하지 않습니다.',[['예약·알림 열기',()=>jump('automation')],['봇 메뉴 열기',()=>jump('menus')]]);
  }else if(root.renderHermesGuide){root.renderHermesGuide(steps);}
 }
 render();
 const faq=el('section','','guide-faq');faq.append(el('h2','막히는 순간, 여기서 찾아보세요'));const label=el('label','도움말 검색','guide-search'),search=el('input');search.type='search';search.placeholder='예: 계정 이전, 알림, 토큰, 그룹';label.append(search);faq.append(label);view.append(faq);
 const entries=[
 ['봇이 답을 하지 않아요','사용하려는 봇에서 /start를 보냈는지, 저장한 대화 ID와 허용 사용자 ID가 맞는지 확인하세요. Hermes 실행 상태도 새로고침하세요. 승인 코드가 있으면 운영자가 확인해야 합니다. 알림 전송 성공만으로 AI 연결까지 완료된 것은 아닙니다.','bots'],
 ['내 업무가 없거나 권한 오류가 나요','개인비서에 연결된 텔레그램 ID와 현재 모아온 계정 연결을 확인하세요. 본인에게 배정된 미완료 업무만 표시됩니다. 담당자·계정·봇 설정이 바뀌면 예전 버튼은 사용할 수 없으니 목록을 다시 여세요.','bots'],
 ['오전 9시 알림이 오지 않아요','예약·알림에서 발송 스위치, 선택 요일, 한국 시간, 수신 대화 ID를 확인하세요. Hermes 서버도 실행 중이어야 합니다. 발송 이력과 시험 알림을 확인하고, 텔레그램 알림 음소거 여부도 확인하세요.','automation'],
 ['메뉴를 바꿨는데 예전 버튼이 보여요','모아온에서 메뉴 저장 후 해당 봇에 “메뉴”를 보내세요. 예전 메시지의 버튼과 새 하단 메뉴는 다를 수 있습니다. 오래된 업무 버튼 대신 새 목록에서 다시 선택하세요.','menus'],
 ['텔레그램 계정을 새로 만들어 옮기고 싶어요','기존 봇은 유지할 수 있어요. 새 계정에서 각 봇에 /start를 보낸 뒤, 기존 계정의 BotFather에서 /mybots → 봇 선택 → Transfer Ownership으로 소유권을 이전합니다. 이어서 운영자가 모아온의 허용 사용자·수신처·개인 계정 연결을 새 숫자 ID로 변경해야 해요. 봇 소유권 이전만으로 이 설정이 자동 변경되지는 않습니다. 새 계정에서 동작 확인 후 기존 ID 접근을 해제하세요.','bots'],
 ['전화번호만 바꾸려는데 새 계정이 필요할까요?','번호만 바꾸려면 Telegram 설정의 전화번호 변경을 먼저 살펴보세요. 기존 계정을 유지하는 방식입니다. 완전히 새 계정으로 이전하면 기존 텔레그램 대화 기록이 새 대화창에 자동 합쳐지지 않아요. Hermes 자료·기억의 새 사용자 연결은 별도 확인이 필요합니다.',null],
 ['엄마나 동료도 같은 봇을 쓰게 하고 싶어요','업무비서는 운영자가 허용 사용자와 개인·그룹 수신처를 설정합니다. 그룹에서는 봇을 추가한 뒤 /메뉴 대신 /moaon@moaon_hub_bot 같은 봇 지정 명령을 사용하면 명확해요. 개인·학습비서는 현재 각각 한 개인 계정만 연결하므로 다른 사용자로 바꾸면 기존 사용자의 접근이 바뀝니다. 다른 사람의 개인 대화가 자동 공유되는 것은 아닙니다.','bots'],
 ['봇 토큰·조회 키·숫자 ID는 무엇이 다른가요?','봇 토큰은 BotFather에서 발급하는 봇 접속 정보, 조회 키는 모아온 자료 접근 정보입니다. 두 값은 채팅에 보내지 말고 지정된 설정칸이나 설치 입력에만 넣으세요. 숫자 ID는 사용자를 구분하는 값이며 @사용자명과 다릅니다. 숫자 ID 확인 방법은 운영자에게 안내받으세요.','connections'],
 ['학습봇에 보내면 바로 모두가 알게 되나요?','학습봇이 제출한 등록안을 모아온의 학습·지식에서 검토·승인해야 공유 지식에 반영됩니다. 모델을 재훈련하는 기능이 아니라 자료를 저장하고 찾아 쓰는 방식이에요. 개인 대화와 공유 지식은 구분됩니다.','learning'],
 ['복사해서 바로 써볼 질문이 있나요?','업무비서: “오늘 업무를 채널별로 요약하고 자료 기준도 알려 줘.” 개인비서: “이 메모를 정리하고 다음 행동을 추천해 줘.” 학습비서: “이 자료를 출처와 함께 공유 지식 등록안으로 정리해 줘.” 업무 등록안은 승인 전 실제 업무가 아닙니다.',null]
 ];
 const details=[];for(const [title,text,target] of entries){const d=el('details'),summary=el('summary',title);d.append(summary,el('p',text));if(target)button(d,'관련 설정으로 이동 →',()=>jump(target));faq.append(d);details.push(d);}
 const empty=el('p','맞는 도움말이 없어요. “연결”, “계정”, “알림”처럼 짧은 단어로 찾아보세요.');empty.hidden=true;faq.append(empty);search.oninput=()=>{const term=search.value.trim().toLocaleLowerCase();let found=0;details.forEach(d=>{d.hidden=!d.textContent.toLocaleLowerCase().includes(term);if(!d.hidden)found++;});empty.hidden=found>0;};
 const sources=el('footer','','guide-sources');sources.append(el('p','Telegram 공식 안내 · 확인 기준 2026.09.16 · 메뉴 이름은 앱 버전에 따라 달라질 수 있어요.'));button(sources,'봇 관리·소유권 이전 안내 주소 복사',()=>copy('https://core.telegram.org/bots/features#transfer-ownership'));button(sources,'전화번호 변경 안내 주소 복사',()=>copy('https://telegram.org/faq#q-how-do-i-change-my-phone-number'));view.append(sources);
 root.querySelectorAll('[data-bot-slot]').forEach(card=>button(card,'연결이 어려우면 가이드 보기 →',()=>{role='owner';render();open();}));
})();
