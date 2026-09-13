/* Local seasonal planning ideas, not live trend/performance predictions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MoaonEventRecommendations=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const rules=[
  [1,'winter','겨울 시즌 세일','겨울 재고 정리','재구매 고객','묶음 구성 · 조건부 할인',1,31],
  [2,'valentine','밸런타인데이','작은 선물 구매','선물 구매 고객','차와 간식 선물 구성 · 샘플 증정',14,14],
  [3,'spring','봄맞이','재구매 유도','기존 구매 고객','봄 차 구성 · 재구매 쿠폰 검토',1,31],
  [3,'school','새학기 준비','새로운 일상 제안','사무실 · 일상용 차 구매 고객','휴대용 티백 묶음 · 배송 혜택 검토',1,4],
  [3,'white','화이트데이','감사 선물 구매','선물 구매 고객','소포장 선물 · 샘플 증정',14,14],
  [4,'april','봄 세일','재구매 유도','봄 차 관심 고객','조건부 할인 · 세트 구성',1,30],
  [5,'family','가정의 달','감사 선물 구매','가족 선물 구매 고객','선물 포장 · 묶음 혜택',1,8],
  [6,'summer','여름맞이','시즌 상품 소개','여름 차 관심 고객','냉침용 차 구성 · 재구매 쿠폰 검토',20,30],
  [7,'vacation','여름 바캉스','휴대용 상품 소개','여행 · 휴가 준비 고객','소포장 묶음 · 조건부 무료배송',1,31],
  [7,'midsummer','한여름 세일','여름 재구매 유도','기존 구매 고객','시즌 묶음 · 조건부 할인',1,31],
  [8,'autumn','가을맞이','다음 시즌 재구매','가을 차 관심 고객','가을 구성 · 재구매 쿠폰 검토',20,31],
  [10,'fall','가을 시즌 할인','재구매 유도','가을 차 관심 고객','시즌 세트 · 조건부 할인',1,31],
  [10,'halloween','할로윈','가벼운 시즌 구성 소개','간식 · 소포장 구매 고객','소포장 구성 · 증정 검토',31,31],
  [11,'blackfriday','블랙프라이데이','재고 정리와 묶음 구매','혜택 관심 고객','선별 상품 할인 · 묶음 구성',0,0],
  [12,'christmas','크리스마스','연말 선물 구매','개인 · 단체 선물 구매 고객','선물세트 · 배송 혜택 검토',25,25]
 ];
 const date=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const valid=d=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 function forMonth(month,holidays=[]){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return [];
  const [y,m]=month.split('-').map(Number);
  const result=rules.filter(r=>r[0]===m).map(([,id,title,goal,audience,benefit,start,end])=>{
   if(id==='blackfriday'){start=1+(4-new Date(Date.UTC(y,10,1)).getUTCDay()+7)%7+22;end=start;}
   return {id,title,goal,audience,benefit,start:date(y,m,start),end:date(y,m,end),dateKind:start===end?'기념일 기준':'추천 운영 기간',preparation:'상품·원가와 할인 후 이익 확인\n재고·포장·배송 마감 확인\n플랫폼별 혜택 설정 확인\n배너·메시지 대상과 발송 계획 준비'};
  });
  for(const [name,months] of [['설날',[1,2]],['추석',[9,10]]]){
   const days=[...new Set((Array.isArray(holidays)?holidays:[]).filter(h=>h?.name===name&&valid(h.date)&&h.date.startsWith(month+'-')).map(h=>h.date))].sort();
   if(!months.includes(m)&&!days.length)continue;
   // Use the first supplied holiday, not an inferred lunar festival day.
   // Missing source dates remain blank and must be entered in the editor.
   const anchor=days[0]||'';
   result.unshift({id:name==='설날'?'seollal':'chuseok',title:name+' 선물전',goal:'명절 선물 · 단체 구매 준비',audience:'가족 · 단체 선물 구매 고객',benefit:'선물세트 · 수량별 혜택 검토',start:anchor?new Date(Date.parse(anchor)-21*86400000).toISOString().slice(0,10):'',end:anchor||'',dateKind:anchor?'조회된 첫 휴일 기준 · 3주 전 준비':'음력 명절 · 날짜 확인 필요',preparation:'명절 날짜와 택배사 출고 마감 확인\n단체 주문 수량·재고·포장 확인\n혜택별 원가와 이익 확인\n배너·메시지 준비'});
  }
  return result;
 }
 return {forMonth};
});
