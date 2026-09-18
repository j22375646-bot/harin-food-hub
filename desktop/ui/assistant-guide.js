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
   const intro=el('aside','','guide-note');intro.append(el('strong','내 계정으로 로그인하셨나요?'),el('p','가족이 함께 쓰더라도 각자 모아온 계정으로 로그인하세요. 내 알림의 시간·요일·수신처는 내 계정에만 저장됩니다. 이미 연결된 봇을 이용할 때는 새 봇이나 서버를 만들 필요가 없어요.'));steps.append(intro);
   step(steps,1,'업무비서를 열고 시작을 눌러요','아래 업무비서 열기를 누르면 텔레그램으로 이동해요. 처음에는 대화창 아래 “시작”을 누르세요. 시작 버튼이 없으면 메시지 칸에 /start를 입력해 보내세요. 인증 코드는 업무비서가 보내므로, 다른 비서만 사용할 때도 업무비서는 먼저 시작해 주세요.',[['/start 복사',()=>copy('/start')]]);
   const bots=el('div','','guide-bot-list');for(const [slot,title,handle,desc] of [['WORK','업무비서','moaon_hub_bot','주문·문의·오늘 마감'],['SOLO','개인비서','moaon_solo_bot','내 할 일·기한'],['STUDY','지식비서','moaon_study_bot','공유 자료·검토할 지식'],['SUP','관리비서','moaon_sup_bot','연결 상태·발송 점검'],['AD','광고비서','moaon_ad_bot','네이버 광고 리포트']]){const card=el('article');card.append(el('strong',title),el('p',desc),el('code','@'+handle));button(card,title+' 열기 ↗',async()=>{try{const r=await window.moaonHub.openAssistantBot(slot);status.textContent=r?.ok?'텔레그램에서 시작 또는 /start를 보내세요.':'열지 못했어요. 사용자명을 복사해 텔레그램에서 검색하세요.';}catch{status.textContent='사용자명을 복사해 텔레그램에서 검색하세요.';}});button(card,'사용자명 복사',()=>copy('@'+handle));bots.append(card);}steps.append(bots);
   step(steps,2,'내 텔레그램 수신처를 인증해요','내 알림 → 내 텔레그램 연결을 여세요. 숫자 ID는 전화번호나 @사용자명이 아닙니다. 모르면 업무비서에 /start를 보낸 뒤 운영자에게 내 숫자 ID를 확인해 달라고 요청하세요. 받은 ID를 입력하고 “인증 코드 보내기”를 누른 뒤, 업무비서가 보낸 6자리 숫자를 입력해 “수신처 인증”을 누르세요. 코드는 10분 안에 입력해야 해요.',[['내 알림에서 연결하기',()=>jump('preferences')]]);
   step(steps,3,'필요한 알림만 골라 저장해요','받고 싶은 비서 카드의 “내 예약 알림 켜기”를 켜고, 받을 시간과 요일을 고르세요. 오전 9시는 09:00이며 모두 한국 시간 기준이에요. 새 주문도 받고 싶으면 “내게 신규 주문 알림 보내기”를 켜세요. 마지막에 “내 알림 설정 저장”을 눌러야 적용됩니다. 여러 비서를 켜면 각 봇에서 알림이 따로 와요.',[['알림 선택하러 가기',()=>jump('preferences')]]);
   step(steps,4,'내 휴대폰으로 시험해 봐요','시험할 비서도 텔레그램에서 먼저 시작하세요. 그다음 해당 카드의 “내게 시험 발송”을 누르고 확인하면 인증한 내 대화창으로 한 번 전송을 요청해요. 잠시 기다려 이미지와 아래 버튼을 확인하세요. 시험 성공은 예약을 자동으로 켜지 않으므로, 3단계에서 예약을 켜고 저장했는지도 확인해 주세요.',[['시험 발송하러 가기',()=>jump('preferences')]]);
   step(steps,5,'AI와 대화하고 싶다면 사용 승인을 받아요','알림 수신 인증과 Hermes AI 대화 권한은 별도예요. 업무비서는 여러 허용 사용자를 설정할 수 있지만, 개인·지식·관리·광고비서는 현재 봇별 한 사람의 AI 대화만 지원해요. 봇에 인사를 보냈는데 승인 코드가 나오거나 답이 없으면 운영자에게 알려 주세요. 알림을 연결했다고 개인 AI 기억이나 대화 권한이 자동으로 분리되는 것은 아닙니다. 운영자 확인 후 봇에 “메뉴”를 보내 사용할 기능을 고르세요.',[['메뉴 문구 복사',()=>copy('메뉴')]]);
  }else if(role==='owner'){
   const note=el('p','현재 앱은 아래에 지정된 모아온 다섯 봇의 사용자명을 확인합니다. 임의로 새 봇을 만든 뒤 토큰만 넣는 방식은 지원하지 않아요. 기존 연결이 있으면 토큰을 다시 만들 필요가 없습니다.','guide-note');steps.append(note);
   step(steps,1,'봇 소유권과 서버를 준비해요','BotFather는 봇 생성·소유권·토큰을 관리하고, Hermes 서버는 실제 AI 대화를 실행해요. BotFather에서 /mybots로 기존 봇을 확인하세요. 별도 봇으로 운영하려면 지원 사용자명 등록 작업이 먼저 필요합니다.',[['BotFather 사용자명 복사',()=>copy('@BotFather')],['/mybots 복사',()=>copy('/mybots')]]);
   step(steps,2,'대화 연결과 수신처를 저장해요','텔레그램 봇 탭에서 해당 봇의 토큰, 대화 ID와 허용 사용자 숫자 ID를 입력해 저장하세요. 본인 계정에서 먼저 /start를 보내야 합니다. 저장된 토큰은 비워두면 유지됩니다. 개인·학습비서는 개인 대화, 업무비서는 개인 또는 그룹을 사용할 수 있어요.',[['텔레그램 봇 설정 열기',()=>jump('bots')]]);
   step(steps,3,'모아온 자료 조회를 연결해요','연결 설정에서 조회 키를 발급하고 관리자가 Hermes 연결기에 등록합니다. 봇 대화 연결과 자료 조회는 별도예요. 토큰은 봇 접속용, 조회 키는 모아온 자료 접근용입니다. 개인 업무는 텔레그램 봇 탭에서 현재 모아온 계정까지 연결하세요.',[['연결 설정 열기',()=>jump('connections')]]);
   step(steps,4,'시험 알림과 실제 대화를 모두 확인해요','저장 후 Hermes 적용에는 약 2분이 걸릴 수 있어요. 상태 새로고침으로 “Hermes 실행 중”을 확인하고 시험 알림을 보내세요. 시험 알림 성공은 메시지 전송 확인입니다. AI 답변과 업무 자료 조회도 각각 확인해야 합니다.',[['연결 상태·시험 알림',()=>jump('bots')]]);
   step(steps,5,'예약 브리핑과 메뉴를 정해요','각 사용자의 개인 수신처와 예약은 ‘내 알림’에서 설정하세요. 공용 예약·알림은 관리자가 함께 운영하는 기존 예약이므로 개인 설정과 중복 발송되지 않게 확인하세요. 봇 메뉴에서 항목과 순서를 바꾸고, 텔레그램에서 “메뉴”를 보내 다시 표시하세요. 표시된 설명은 현재 연결 상태를 뜻하지 않습니다.',[['예약·알림 열기',()=>jump('automation')],['봇 메뉴 열기',()=>jump('menus')]]);
  }else if(root.renderHermesGuide){root.renderHermesGuide(steps);}
 }
 render();
 const faq=el('section','','guide-faq');faq.append(el('h2','막히는 순간, 여기서 찾아보세요'));const label=el('label','도움말 검색','guide-search'),search=el('input');search.type='search';search.placeholder='예: 계정 이전, 알림, 토큰, 그룹';label.append(search);faq.append(label);view.append(faq);
 const entries=[
 ['다른 가족의 텔레그램 계정도 연결할 수 있나요?','가능해요. 가족마다 본인 모아온 계정으로 로그인하고, 본인 텔레그램에서 사용할 봇에 /start를 보낸 뒤 내 알림에서 본인의 숫자 ID를 인증하세요. 봇 소유권을 옮기거나 봇 토큰을 새로 발급할 필요는 없습니다. 하나의 개인 대화 ID를 여러 모아온 계정이 함께 인증할 수는 없어요.','preferences'],
 ['내 알림과 공용 예약을 모두 켜야 하나요?','개인에게 받을 알림은 내 알림에서 설정하면 됩니다. 공용 예약은 관리자가 지정한 공용 수신처를 위한 별도 설정이에요. 개인 설정으로 이전된 수신처는 공용 비서 브리핑·신규 주문·광고 일일 알림을 건너뛰지만, 광고 주간·수동 발송이나 다른 공용 수신처나 여러 비서 예약은 각각 발송될 수 있습니다.','preferences'],
 ['개인화가 어디까지 되어 있나요?','개인 수신처, 받을 비서, 시간·요일, 신규 주문 알림과 개인 브리핑의 배정 업무가 계정별로 구분됩니다. 봇 연결과 메뉴, 공용 제품 지식, 광고 자료 수집은 공용입니다. AI 기억·대화 지침은 개인별로 완전히 분리된 기능이 아니에요. 업무비서 외 네 봇의 AI 대화와 개인비서 업무 연결도 현재 단일 사용자 기준입니다.','preferences'],
 ['다른 모아온 계정으로 로그인했더니 메뉴가 적어요','현재 모아온 앱은 관리자 계정으로 로그인해 사용합니다. 비관리자 계정의 앱 진입은 아직 지원 범위가 아닙니다. 기존 가족 관리자 계정도 각자 로그인하면 개인 알림이 구분되지만, 공용 설정은 함께 변경할 수 있어요. 같은 계정을 함께 쓰면 같은 개인 설정을 보므로 가족마다 별도 계정을 사용하세요.','preferences'],
 ['시험 이미지는 오는데 AI 대화가 안 돼요','알림 인증과 AI 대화 허용은 별도입니다. 업무비서는 운영자가 허용 사용자에 숫자 ID를 추가하고 저장·서버 적용을 확인합니다. 개인·지식·관리·광고비서의 AI 대화는 현재 봇마다 한 사용자만 설정할 수 있어 다른 가족의 개인 알림 연결과 별개입니다. Hermes가 연결 승인 코드를 안내하면 운영자가 그 코드를 승인해야 해요. 개인 알림 인증만으로 AI 대화 권한이 생기지는 않습니다.','preferences'],
 ['봇이 답을 하지 않아요','사용하려는 봇에서 /start를 보냈는지, 저장한 대화 ID와 허용 사용자 ID가 맞는지 확인하세요. Hermes 실행 상태도 새로고침하세요. 승인 코드가 있으면 운영자가 확인해야 합니다. 알림 전송 성공만으로 AI 연결까지 완료된 것은 아닙니다.','bots'],
 ['내 업무가 없거나 권한 오류가 나요','개인비서에 연결된 텔레그램 ID와 현재 모아온 계정 연결을 확인하세요. 본인에게 배정된 미완료 업무만 표시됩니다. 담당자·계정·봇 설정이 바뀌면 예전 버튼은 사용할 수 없으니 목록을 다시 여세요.','bots'],
 ['오전 9시 알림이 오지 않아요','내 알림에서 수신처가 인증되었는지, 해당 비서의 예약 스위치·요일·시간을 저장했는지 확인하세요. 해당 봇에서 /start를 보내고 시험 발송도 해보세요. 휴대폰의 텔레그램 알림이 꺼져 있지 않은지도 확인하세요. 계속 안 오면 운영자에게 Hermes 실행 상태 확인을 요청하세요.','preferences'],
 ['메뉴를 바꿨는데 예전 버튼이 보여요','모아온에서 메뉴 저장 후 해당 봇에 “메뉴”를 보내세요. 예전 메시지의 버튼과 새 하단 메뉴는 다를 수 있습니다. 오래된 업무 버튼 대신 새 목록에서 다시 선택하세요.','menus'],
 ['텔레그램 계정을 새로 만들어 옮기고 싶어요','기존 봇은 유지할 수 있어요. 새 계정에서 각 봇에 /start를 보낸 뒤, 기존 계정의 BotFather에서 /mybots → 봇 선택 → Transfer Ownership으로 소유권을 이전합니다. 이어서 운영자가 모아온의 허용 사용자·수신처·개인 계정 연결을 새 숫자 ID로 변경해야 해요. 봇 소유권 이전만으로 이 설정이 자동 변경되지는 않습니다. 새 계정에서 동작 확인 후 기존 ID 접근을 해제하세요.','bots'],
 ['전화번호만 바꾸려는데 새 계정이 필요할까요?','번호만 바꾸려면 Telegram 설정의 전화번호 변경을 먼저 살펴보세요. 기존 계정을 유지하는 방식입니다. 완전히 새 계정으로 이전하면 기존 텔레그램 대화 기록이 새 대화창에 자동 합쳐지지 않아요. Hermes 자료·기억의 새 사용자 연결은 별도 확인이 필요합니다.',null],
 ['엄마나 동료도 같은 봇을 쓰게 하고 싶어요','각자 모아온 계정으로 로그인하고 내 알림에서 본인의 개인 수신처를 인증하면 시간·요일·알림 종류를 따로 저장할 수 있어요. 다른 가족의 ID를 대신 입력하지 마세요. AI 대화 사용 승인은 운영자가 별도로 확인하며, 공용 봇 연결 변경은 다른 사용자에게도 영향을 줄 수 있습니다.','preferences'],
 ['광고 이미지 브리핑도 받을 수 있나요?','내 알림의 광고비서 카드에서 예약 시간과 요일을 저장하고 시험 발송해 보세요. 보고서는 저장된 네이버 광고 자료를 사용하므로 이미지에 적힌 대상 기간을 확인하세요. 광고 API 연결·자료 수집은 관리자가 공용 설정에서 준비해야 합니다.','preferences'],
 ['봇 토큰·조회 키·숫자 ID는 무엇이 다른가요?','봇 토큰은 BotFather에서 발급하는 봇 접속 정보, 조회 키는 모아온 자료 접근 정보입니다. 두 값은 채팅에 보내지 말고 지정된 설정칸이나 설치 입력에만 넣으세요. 숫자 ID는 사용자를 구분하는 값이며 @사용자명과 다릅니다. 숫자 ID 확인 방법은 운영자에게 안내받으세요.','connections'],
 ['학습봇에 보내면 바로 모두가 알게 되나요?','학습봇이 제출한 등록안을 모아온의 학습·지식에서 검토·승인해야 공유 지식에 반영됩니다. 모델을 재훈련하는 기능이 아니라 자료를 저장하고 찾아 쓰는 방식이에요. 개인 대화와 공유 지식은 구분됩니다.','learning'],
 ['복사해서 바로 써볼 질문이 있나요?','업무비서: “오늘 업무를 채널별로 요약하고 자료 기준도 알려 줘.” 개인비서: “이 메모를 정리하고 다음 행동을 추천해 줘.” 학습비서: “이 자료를 출처와 함께 공유 지식 등록안으로 정리해 줘.” 업무 등록안은 승인 전 실제 업무가 아닙니다.',null]
 ];
 const details=[];for(const [title,text,target] of entries){const d=el('details'),summary=el('summary',title);d.append(summary,el('p',text));if(target)button(d,'관련 설정으로 이동 →',()=>jump(target));faq.append(d);details.push(d);}
 const empty=el('p','맞는 도움말이 없어요. “연결”, “계정”, “알림”처럼 짧은 단어로 찾아보세요.');empty.hidden=true;faq.append(empty);search.oninput=()=>{const term=search.value.trim().toLocaleLowerCase();let found=0;details.forEach(d=>{d.hidden=!d.textContent.toLocaleLowerCase().includes(term);if(!d.hidden)found++;});empty.hidden=found>0;};
 const sources=el('footer','','guide-sources');sources.append(el('p','Telegram 공식 안내 · 확인 기준 2026.09.16 · 메뉴 이름은 앱 버전에 따라 달라질 수 있어요.'));button(sources,'봇 관리·소유권 이전 안내 주소 복사',()=>copy('https://core.telegram.org/bots/features#transfer-ownership'));button(sources,'전화번호 변경 안내 주소 복사',()=>copy('https://telegram.org/faq#q-how-do-i-change-my-phone-number'));view.append(sources);
 root.querySelectorAll('[data-bot-slot]').forEach(card=>button(card,'연결이 어려우면 가이드 보기 →',()=>{role='owner';render();open();}));
})();
