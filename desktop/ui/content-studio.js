'use strict';
(()=>{
 const platforms=[
  {id:'blog',name:'블로그',mark:'B',format:'글 · 사진',title:'제품의 이야기를 차근차근',description:'제품 소개부터 우리는 방법까지, 사진과 설명을 한 편의 글로 준비하는 공간입니다.',sample:'오늘의 차 한 잔, 이렇게 준비해요',lines:['제품 이야기','사진과 함께 보는 활용법','자주 묻는 질문'],steps:['네이버 블로그 주소와 운영할 계정을 준비하세요.','사용할 제품 사진과 설명을 모아 두세요.','다음 개발에서 글 제작·사진 내보내기를 연결합니다.'],note:'네이버 블로그는 글·사진 제작부터 시작합니다. 공식 글쓰기 API가 종료되어 자동 발행 연결과 구분해 진행합니다.',next:'제품 자료로 블로그 초안 만들기'},
  {id:'youtube',name:'유튜브',mark:'▶',format:'쇼츠 · 영상',title:'한 번 촬영하고, 한 편으로 완성',description:'촬영한 영상과 제품 사진에 자막·설명을 더해 쇼츠와 영상으로 준비하는 공간입니다.',sample:'차 한 잔이 완성되는 순간',lines:['촬영 영상 고르기','자막과 표지 준비','제목·설명 함께 만들기'],steps:['운영할 유튜브 채널과 연결 권한을 확인하세요.','직접 촬영한 영상 또는 제품 사진을 준비하세요.','다음 개발에서 업로드·예약·처리 결과를 시험합니다.'],note:'채널 연결과 업로드 시험은 아직 진행하지 않았습니다. 공개 발행 가능 여부는 연결한 계정과 발행 방식에 따라 확인합니다.',next:'영상 업로드와 예약 공개 시험'},
  {id:'tiktok',name:'틱톡',mark:'♪',format:'짧은 영상',title:'짧게 보여주는 우리 제품',description:'제품의 모습과 사용 장면을 짧은 영상으로 구성하고, 발행 방법을 확인하는 공간입니다.',sample:'오늘은 이 차로 시작해요',lines:['첫 장면 고르기','짧고 읽기 쉬운 자막','채널에 맞는 설명'],steps:['운영할 틱톡 계정을 준비하세요.','직접 촬영한 세로 영상과 사용 가능한 음원을 준비하세요.','발행 서비스 연동을 시험하고 자동·직접 발행을 구분합니다.'],note:'팀 내부용 Direct Post 도구에는 제약이 있어 발행 서비스 연동을 우선 검토합니다. 유행 음원·일부 효과는 틱톡 앱에서 마무리할 수 있습니다.',next:'발행 서비스 연결 가능 범위 확인'},
  {id:'instagram',name:'인스타그램',mark:'◎',format:'카드뉴스 · 릴스',title:'사진 한 장에서 시작하는 콘텐츠',description:'제품 사진으로 카드뉴스와 릴스를 준비하고, 계정 연결부터 하나씩 시험하는 공간입니다.',sample:'우리의 일상에, 차 한 잔',lines:['제품 사진과 브랜드 색상','한 장에 한 가지 이야기','카드뉴스·릴스 미리보기'],steps:['운영할 인스타그램 계정을 확인하세요.','자동 발행에 사용할 프로페셔널 계정을 준비하세요.','다음 개발에서 이미지 시험 발행과 게시물 링크를 확인합니다.'],note:'아직 계정이 연결되지 않은 준비 화면입니다. 콘텐츠 종류별 자동 발행 지원 여부는 연결 시험 후 표시합니다.',next:'제품 카드뉴스와 이미지 시험 발행'}
 ];
 const root=document.querySelector('[data-page="content-studio"]');if(!root)return;
 const tabs=root.querySelector('[role="tablist"]'),panels=root.querySelector('.content-platform-panels');
 function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;}
 platforms.forEach((p,index)=>{
  const tab=node('button','content-platform-tab');tab.type='button';tab.id=`content-tab-${p.id}`;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`content-panel-${p.id}`);tab.setAttribute('aria-selected',String(index===0));tab.tabIndex=index===0?0:-1;tab.dataset.platform=p.id;
  const mark=node('span','content-platform-mark',p.mark);mark.setAttribute('aria-hidden','true');tab.append(mark,node('strong','',p.name),node('small','',p.format));tabs.append(tab);
  const panel=node('section','content-platform-panel');panel.id=`content-panel-${p.id}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.tabIndex=0;panel.hidden=index!==0;panel.dataset.platform=p.id;
  const work=node('div','content-workbench'),intro=node('div','content-intro');
  intro.append(node('span','content-eyebrow',`${p.name} 작업실`),node('h2','',p.title),node('p','content-description',p.description));
  const state=node('div','content-connection-state');state.append(node('span','content-state-dot'),node('strong','','연동 준비'),node('span','','자동 발행 꺼짐'));intro.append(state);
  const guideButton=node('button','content-guide-button','연결 준비 가이드 보기');guideButton.type='button';guideButton.setAttribute('aria-controls',`content-guide-${p.id}`);guideButton.setAttribute('aria-expanded','false');intro.append(guideButton);
  const guide=node('details','content-guide');guide.id=`content-guide-${p.id}`;guide.append(node('summary','',`${p.name} 시작하기`));const steps=node('ol');p.steps.forEach(s=>steps.append(node('li','',s)));guide.append(steps,node('p','content-guide-note',p.note));
  guideButton.onclick=()=>{guide.open=!guide.open;};guide.addEventListener('toggle',()=>{guideButton.setAttribute('aria-expanded',String(guide.open));});
  const preview=node('div','content-preview');preview.setAttribute('aria-label',`${p.name} 콘텐츠 구성 예시`);preview.append(node('span','content-example-label','구성 예시 · 실제 생성물 아님'));
  const paper=node('div',`content-example-paper ${p.id==='blog'?'is-article':'is-visual'}`);paper.append(node('span','content-example-brand','HARIN FOOD'),node('strong','content-example-title',p.sample));const motifs=node('div','content-example-motif');motifs.setAttribute('aria-hidden','true');motifs.append(node('span','content-cup'),node('span','content-leaf'));paper.append(motifs,node('span','content-example-caption',p.format));preview.append(paper);
  work.append(intro,preview);panel.append(work,guide);
  const stages=node('div','content-build-stages');p.lines.forEach((line,i)=>{const card=node('div','content-build-stage');card.append(node('span','',`0${i+1}`),node('strong','',line),node('small','','다음 단계에서 연결'));stages.append(card);});panel.append(stages);
  const footer=node('div','content-next');footer.append(node('div','',`다음 개발 · ${p.next}`),node('span','','계정 연결·콘텐츠 생성·예약 발행은 아직 실행되지 않습니다.'));panel.append(footer);panels.append(panel);
  tab.onclick=()=>select(index);
 });
 function select(index){[...tabs.children].forEach((tab,i)=>{tab.setAttribute('aria-selected',String(index===i));tab.tabIndex=index===i?0:-1;panels.children[i].hidden=index!==i;});}
 tabs.addEventListener('keydown',event=>{const current=[...tabs.children].indexOf(event.target);if(current<0)return;let next=current;if(event.key==='ArrowRight')next=(current+1)%platforms.length;else if(event.key==='ArrowLeft')next=(current+platforms.length-1)%platforms.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=platforms.length-1;else return;event.preventDefault();select(next);tabs.children[next].focus();});
})();
