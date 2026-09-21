'use strict';
(()=>{
 const panel=document.getElementById('content-panel-blog');if(!panel)return;
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text)x.textContent=text;return x;};
 panel.querySelector('.content-build-stages').remove();panel.querySelector('.content-next').remove();
 panel.querySelector('.content-connection-state strong').textContent='주소 확인부터 시작';
 const guide=panel.querySelector('.content-guide');guide.replaceChildren(el('summary','','네이버 블로그 연결·발행 가이드'));
 const steps=el('ol');[
 '주소 연결: 네이버에서 운영할 블로그 홈을 열고 주소를 복사하세요. 아래에 https://blog.naver.com/아이디 형태로 넣고 공개 페이지 확인을 누르세요. 게시글 주소가 아닌 홈 주소를 사용해 주세요.',
 '계정 확인: 블로그 열기를 눌러 기본 브라우저에서 네이버에 로그인하세요. 내 프로필과 블로그 관리·글쓰기 메뉴가 보이는지 확인하세요. 다른 가족 계정이면 네이버에서 계정을 바꾸세요. 모아온 로그인과 네이버 로그인은 서로 별개입니다.',
 '초안 준비: Gemini에 확인된 제품 정보와 글의 목적을 입력해 초안을 만들거나 직접 작성하세요. 생성 결과는 편집기에 적용한 뒤 수정할 수 있어요. 제목과 본문을 작성하고 오른쪽 미리보기를 확인하세요. 초안 파일 저장으로 보관하고 다음에 불러올 수 있어요. 파일에는 작성 내용이 들어 있으니 본인 폴더에 보관하세요.',
 '발행: 제목·본문 복사를 누르고 네이버 글쓰기에서 붙여넣으세요. 제품 사진은 네이버 편집기에 직접 추가하세요. 줄바꿈·사진·공개 범위를 확인한 뒤 네이버의 발행 버튼으로 마무리하세요.',
 '결과 확인: 발행한 글을 네이버에서 직접 열어 확인하세요. 모아온은 공개 페이지 응답만 시험하며, 계정 소유권·로그인·발행 완료를 자동 확인하지 않습니다.'
 ].forEach(t=>steps.append(el('li','',t)));guide.append(steps,el('p','content-guide-note','네이버 공식 글쓰기 API가 종료되어 현재 자동·예약 발행은 지원하지 않아요. API 키나 비밀번호를 모아온에 입력할 필요가 없습니다. 초안은 자동 저장되지 않으며 앱을 종료하기 전에 파일로 저장해 주세요.'));
 const area=el('div','blog-workspace');
 const connection=el('section','blog-connection');connection.append(el('h3','','내 블로그 연결 준비'),el('p','','공개 주소 접속과 네이버 계정 로그인을 구분해서 확인해요.'));
 const addressLabel=el('label','','블로그 홈 주소'),address=el('input');address.id='blog-address';address.type='url';address.placeholder='https://blog.naver.com/아이디';address.maxLength=200;addressLabel.htmlFor=address.id;
 const controls=el('div','blog-actions'),status=el('p','blog-status','아직 확인하지 않았어요.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 let revision=0,sessionEpoch=0;address.addEventListener('input',()=>{revision++;status.textContent='주소가 변경됐어요. 공개 페이지 확인을 다시 눌러 주세요.';});
 async function call(action,value){const epoch=sessionEpoch;const result=await window.moaonHub.blogWorkspace({action,value});if(epoch!==sessionEpoch)throw Error('Session changed');return result;}
 function button(text,parent,work){const b=el('button','content-guide-button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await work();}catch{status.textContent='처리하지 못했어요. 입력 내용·파일 형식·네트워크를 확인한 뒤 다시 시도해 주세요.';}finally{b.disabled=false;}};parent.append(b);return b;}
 button('공개 페이지 확인',controls,async()=>{const current=revision;status.textContent='네이버 공개 페이지 응답 확인 중… 최대 12초 정도 걸려요.';const r=await call('probe',address.value);if(current!==revision)return;status.textContent=`${r.message} (${new Date(r.checkedAt).toLocaleString('ko-KR')})`;});
 button('블로그 열기',controls,async()=>{await call('open',address.value);status.textContent='기본 브라우저로 열었어요. 네이버의 내 프로필과 글쓰기 메뉴를 직접 확인해 주세요.';});
 connection.append(addressLabel,address,controls,status,el('small','','이 주소는 현재 작업 화면에서만 유지됩니다. 공개 페이지 응답은 로그인·소유권 확인이 아닙니다.'));
 const grid=el('div','blog-editor-grid'),editor=el('section','blog-editor'),preview=el('section','blog-draft-preview');
 editor.append(el('h3','','블로그 초안'),el('p','','제품의 실제 정보와 직접 촬영한 사진으로 이야기를 준비하세요.'));
 function field(label,id,tag,max){const l=el('label','',label),x=el(tag);x.id=id;x.maxLength=max;l.htmlFor=id;editor.append(l,x);return x;}
 const title=field('제목','blog-title','input',150),body=field('본문','blog-body','textarea',30000);title.placeholder='예: 작두콩깍지차, 우리는 방법을 소개해요';body.placeholder='제품 소개, 실제 용량, 우리는 방법, 자주 묻는 질문을 차례로 적어 보세요.';body.rows=14;
 const count=el('small'),draftState=el('p','blog-status','작성 후 초안 파일로 저장해 주세요.');draftState.setAttribute('role','status');
 const heading=el('h3','','제목 미리보기'),article=el('div','blog-preview-body','작성한 내용이 여기에 표시됩니다.');preview.append(el('span','content-eyebrow','글 미리보기 · 네이버 발행 화면과 다를 수 있어요'),heading,article);
 let saved='';const signature=()=>JSON.stringify({title:title.value,body:body.value});
 const render=()=>{heading.textContent=title.value||'제목 미리보기';article.textContent=body.value||'작성한 내용이 여기에 표시됩니다.';count.textContent=`제목 ${title.value.length}/150자 · 본문 ${body.value.length.toLocaleString()}/30,000자`;draftState.textContent=signature()===saved?'파일로 저장한 상태예요.':'자동 저장되지 않아요. 작업을 마치면 초안 파일을 저장해 주세요.';};title.oninput=body.oninput=render;
 const actions=el('div','blog-actions');
 button('제목·본문 복사',actions,async()=>{await call('copy',{title:title.value,body:body.value});draftState.textContent='복사했어요. 네이버 글쓰기에 붙여넣고 사진을 추가해 주세요.';});
 button('초안 파일 저장',actions,async()=>{const current=signature();const r=await call('save',JSON.parse(current));if(r.ok){saved=current;render();}else draftState.textContent='저장을 취소했어요. 작성 내용은 화면에 남아 있어요.';});
 button('초안 불러오기',actions,async()=>{if((title.value||body.value)&&signature()!==saved&&!confirm('저장하지 않은 초안이 있어요. 파일을 불러와 현재 내용을 바꿀까요?'))return;const r=await call('load',null);if(r.ok){title.value=r.draft.title;body.value=r.draft.body;saved=signature();render();}});
 editor.append(count,actions,draftState);grid.append(editor,preview);area.append(connection,grid);panel.append(area);render();
 // Do not retain draft text across the Moaon logout/sample transition.
 document.addEventListener('moaon-session-changed',()=>{sessionEpoch++;revision++;address.value='';title.value='';body.value='';saved='';render();status.textContent='아직 확인하지 않았어요.';});
})();
