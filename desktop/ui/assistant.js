'use strict';
(()=>{const root=document.querySelector('[data-page="assistant"]');if(!root)return;const $=id=>document.getElementById(id),key='moaon.assistant.briefing-draft.v1';const defaults={time:'09:00',days:['0','1','2','3','4'],topics:['orders','tasks','cs']};const names={orders:'발송할 주문',tasks:'오늘 마감 업무',cs:'확인할 고객 문의',analysis:'네이버 보고서 요약'};const dayNames=['월','화','수','목','금','토','일'];
function tab(name){root.querySelectorAll('[data-assistant-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.assistantTab===name)));root.querySelectorAll('[data-assistant-view]').forEach(v=>v.hidden=v.dataset.assistantView!==name);}
root.querySelectorAll('[data-assistant-tab],[data-assistant-go]').forEach(b=>b.onclick=()=>tab(b.dataset.assistantTab||b.dataset.assistantGo));
function read(){return {time:$('assistant-time').value,days:[...root.querySelectorAll('[name=day]:checked')].map(n=>n.value),topics:[...root.querySelectorAll('[name=topic]:checked')].map(n=>n.value)};}
function valid(v){return v&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)&&Array.isArray(v.days)&&v.days.length>0&&v.days.length<=7&&v.days.every(n=>/^[0-6]$/.test(n))&&Array.isArray(v.topics)&&v.topics.length>0&&v.topics.length<=4&&v.topics.every(n=>Object.hasOwn(names,n));}
function preview(){const v=read();$('assistant-preview-schedule').textContent=(v.days.map(n=>dayNames[Number(n)]).join(' · ')||'요일을 선택하세요')+' / '+(v.time||'시간 선택')+' · 한국 시간';const host=$('assistant-preview-topics');host.replaceChildren();for(const id of v.topics){const card=document.createElement('p');const title=document.createElement('strong');title.textContent=names[id];const text=document.createElement('span');text.textContent='조회 연결 후 실제 내용이 표시됩니다.';card.append(title,text);host.append(card);}}
function fill(v){$('assistant-time').value=v.time;root.querySelectorAll('[name=day]').forEach(n=>n.checked=v.days.includes(n.value));root.querySelectorAll('[name=topic]').forEach(n=>n.checked=v.topics.includes(n.value));preview();}
try{const raw=localStorage.getItem(key);const saved=raw&&raw.length<500?JSON.parse(raw):null;if(valid(saved)){fill(saved);$('assistant-save-status').textContent='이 PC에 저장한 초안 · 자동 발송 꺼짐';}else fill(defaults);}catch{fill(defaults);$('assistant-save-status').textContent='저장한 초안을 읽지 못해 기본값을 표시합니다.';}
$('assistant-briefing-form').oninput=()=>{preview();$('assistant-save-status').textContent='변경한 내용이 아직 저장되지 않았습니다.';};$('assistant-briefing-form').onsubmit=e=>{e.preventDefault();const v=read();if(!valid(v)){$('assistant-save-status').textContent='시간, 요일과 담을 내용을 하나 이상 선택해 주세요.';return;}try{localStorage.setItem(key,JSON.stringify(v));$('assistant-save-status').textContent='이 PC에 초안을 저장했어요. 예약·발송은 시작되지 않습니다.';}catch{$('assistant-save-status').textContent='초안을 저장하지 못했습니다. 다시 시도해 주세요.';}};
$('assistant-reset').onclick=()=>{fill(defaults);$('assistant-save-status').textContent='기본값으로 바꿨어요. 초안 저장을 누르면 반영됩니다.';};
const examples={orders:['오늘 업무 한눈에','질문 예시','오늘 발송할 주문과 마감 업무를 정리해 줘.','연결 후 동작','모아온에서 채널별 주문·업무를 조회하고, 자료 기준 시각과 함께 알려드립니다. 현재는 실제 자료를 조회하지 않습니다.'],analysis:['네이버 보고서에 질문','질문 예시','선택한 네이버 보고서에서 달라진 지표와 확인할 점을 알려줘.','연결 후 동작','선택한 보고서와 근거를 확인해 답변합니다. 다른 채널 자료나 전체 매출로 확대 해석하지 않습니다.'],briefing:['아침 업무 브리핑','질문 예시','평일 오전 9시에 오늘 챙길 일을 보내줘.','연결 후 동작','지정한 시간에 실제 자료를 조회하고 Telegram으로 전달합니다. 지금은 브리핑 화면에서 초안만 준비할 수 있습니다.'],hermes:['Hermes 연결 준비','준비할 정보','카페24 Hermes 서버, 사용할 AI 제공자, 사용 한도를 준비하세요.','다음 연결 단계','모아온 조회 API가 준비되면 전용 권한을 연결합니다. 비서에게 운영 DB 전체나 발급·출고 권한을 제공하지 않습니다.'],telegram:['Telegram 봇 만들기','1. 전용 봇 만들기','Telegram에서 공식 @BotFather를 열고 /newbot을 보내 이름과 bot으로 끝나는 사용자명을 지정하세요.','2. 연결 단계에서 등록','봇 토큰은 보안 저장 기능이 준비된 뒤 이 화면에 입력합니다. 본인 계정을 확인하고 테스트 메시지를 수신한 후 알림을 켭니다.']};
function detail(id){const data=examples[id];if(!data)return;$('assistant-detail-title').textContent=data[0];const host=$('assistant-detail-content');host.replaceChildren();for(let i=1;i<data.length;i++){const n=document.createElement(i%2?'h3':'p');n.textContent=data[i];host.append(n);}$('assistant-detail').showModal();}
root.querySelectorAll('[data-assistant-example],[data-assistant-guide]').forEach(b=>b.onclick=()=>detail(b.dataset.assistantExample||b.dataset.assistantGuide));$('assistant-detail-close').onclick=()=>$('assistant-detail').close();

let reading=false;
$('assistant-read').onclick=async()=>{
 if(reading)return;reading=true;$('assistant-read').disabled=true;$('assistant-read-status').textContent='모아온 자료를 확인하고 있어요…';$('assistant-read-results').replaceChildren();
 try{
  const data=await window.moaonHub.readAssistant();
  if(!data.sources)throw Error(data.status);
  $('assistant-api-state').textContent=data.status==='READY'?'조회 가능':'일부 확인 필요';
  $('assistant-read-status').textContent='조회 '+new Date(data.retrievedAt).toLocaleString('ko-KR')+' · 저장 자료 기준 · 원본 수집 시각 확인 필요';
  const add=(title,lines)=>{const card=document.createElement('section'),h=document.createElement('h3');h.textContent=title;card.append(h);for(const line of lines){const n=document.createElement('p');n.textContent=line;card.append(n);}$('assistant-read-results').append(card);};
  const n=v=>v===null||v===undefined?'확인 필요':v.toLocaleString('ko-KR')+'건',labels={NAVER:'네이버',CAFE24:'카페24',COUPANG:'쿠팡'},s=data.sources;
  add('발송할 주문',s.orders.channels?s.orders.channels.map(c=>labels[c.platform]+' · 발급 전 '+n(c.counts?.ACTIVE)+' / 배송대기 '+n(c.counts?.REGISTER)+' / 배송중 '+n(c.counts?.IN_TRANSIT)):['주문 자료를 확인하지 못했어요.']);
  add('나의 마감 업무',s.tasks.counts?['오늘 마감 '+n(s.tasks.counts.dueToday),'기한 지난 업무 '+n(s.tasks.counts.overdue)]:['업무 자료 확인 필요 · 조회 실패 또는 범위 초과']);
  add('미답변 문의',s.cs.channels?s.cs.channels.map(c=>labels[c.platform]+' · '+n(c.unanswered)):['문의 자료를 확인하지 못했어요.']);
  add('네이버 저장 보고서',s.reports.items?s.reports.items.length?s.reports.items.slice(0,5).map(r=>r.title+' · '+(r.periodStart?.slice(0,10)||'기간 확인 필요')):['저장 보고서가 없어요.']:['보고서를 확인하지 못했어요.']);
 }catch(e){$('assistant-api-state').textContent='확인 필요';$('assistant-read-status').textContent=e.message==='LOGIN_REQUIRED'?'로그인 후 다시 확인해 주세요.':'자료를 확인하지 못했어요. 서버 연결 상태를 확인한 뒤 다시 시도해 주세요.';}
 finally{reading=false;$('assistant-read').disabled=false;}
};
})();
