/* Shared, deterministic event planning rules. No network or storage access. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MoaonEventTools=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const checkNames={banner:'배너 · 상세페이지',stock:'상품 · 사은품 재고',coupon:'할인 · 쿠폰 설정',message:'메시지 · 대상 확인'};
 const costNames={price:'정상 판매가',quantity:'예상 판매수량',unitCost:'개당 상품 원가',feeRate:'판매 수수료율 %',shipping:'개당 배송비',gift:'개당 사은품 비용',adBudget:'행사 광고비 합계'};
 const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const shift=(v,n)=>new Date(Date.parse(v+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 function normalize(v){
  if(v===undefined)v={};
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['checks','costs','targetOrders','messageDraft','link','utmSource','utmMedium','utmCampaign'].includes(k)))throw Error('행사 준비 정보를 확인해주세요.');
  const checks=v.checks||{},costs=v.costs||{};
  if(typeof checks!=='object'||Array.isArray(checks)||Object.keys(checks).some(k=>!Object.hasOwn(checkNames,k))||Object.values(checks).some(v=>typeof v!=='boolean'))throw Error('준비 체크를 확인해주세요.');
  if(typeof costs!=='object'||Array.isArray(costs)||Object.keys(costs).some(k=>!Object.hasOwn(costNames,k)))throw Error('비용 항목을 확인해주세요.');
  for(const [k,n] of Object.entries(costs))if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||n<0||n>(k==='feeRate'?100:k==='quantity'?100000:100000000)||k!=='feeRate'&&!Number.isInteger(n)||['price','quantity'].includes(k)&&n===0))throw Error('금액과 수량은 범위 안의 숫자로 입력해주세요.');
  if(v.targetOrders!=null&&(!Number.isInteger(v.targetOrders)||v.targetOrders<1||v.targetOrders>1000000))throw Error('목표 주문 건수를 확인해주세요.');
  const result={checks:Object.fromEntries(Object.keys(checkNames).map(k=>[k,checks[k]===true])),costs:Object.fromEntries(Object.keys(costNames).map(k=>[k,costs[k]??null])),targetOrders:v.targetOrders??null};
  for(const [k,max] of [['messageDraft',600],['link',500],['utmSource',50],['utmMedium',50],['utmCampaign',80]]){if(v[k]!==undefined&&(typeof v[k]!=='string'||v[k].length>max))throw Error('메시지와 링크 길이를 확인해주세요.');result[k]=(v[k]||'').trim();}
  if(result.link){let u;try{u=new URL(result.link);}catch{throw Error('상품 링크를 확인해주세요.');}if(u.protocol!=='https:'||u.username||u.password)throw Error('https 상품 링크를 입력해주세요.');}
  return result;
 }
 function profit(execution,campaign={}){
  const e=normalize(execution),c=e.costs,missing=Object.keys(costNames).filter(k=>c[k]===null);if(missing.length)return {status:'UNKNOWN',missing:missing.map(k=>costNames[k])};
  const discount=campaign.discountType==='PERCENT'?Math.round(c.price*campaign.discountValue/100):campaign.discountType==='AMOUNT'?campaign.discountValue:0;
  if(!Number.isFinite(discount)||discount<0||discount>c.price)return {status:'INVALID',missing:['할인이 판매가보다 큽니다.']};
  const price=c.price-discount,revenue=price*c.quantity,fees=Math.round(revenue*c.feeRate/100),cost=(c.unitCost+c.shipping+c.gift)*c.quantity+c.adBudget+fees;
  return {status:'ESTIMATE',price,revenue,fees,cost,profit:revenue-cost,margin:revenue?(revenue-cost)/revenue*100:null};
 }
 function reminders(row,today){
  if(!day(today)||row?.type!=='EVENT'||row.status!=='OPEN'||row.eventConfigInvalid||!day(row.date)||!day(row.endDate||row.date)||(row.endDate||row.date)<today)return [];
  const list=[],c=row.campaign||{};
  if(row.execution&&row.date<=shift(today,3)){const e=normalize(row.execution),missing=Object.keys(checkNames).filter(k=>!e.checks[k]);if(missing.length)list.push({kind:'preparation',key:'event-prepare:'+row.id+':'+row.date,text:'준비 '+missing.length+'개 남음 · '+missing.map(k=>checkNames[k]).join(', ')});}
  if(c.messageStatus==='PLANNED'&&day(c.messagePlannedDate)&&c.messagePlannedDate<=today)list.push({kind:'message',key:'event-message:'+row.id+':'+c.messagePlannedDate,text:'발송 예정일 '+c.messagePlannedDate+' · 아직 미발송'});
  return list;
 }
 function duplicate(row,date){
  if(!day(date)||!day(row.date)||!day(row.endDate||row.date))throw Error('복제 날짜를 확인해주세요.');
  const e=normalize(row.execution),copy=JSON.parse(JSON.stringify(row));delete copy.id;delete copy.sourceMonth;
  return {...copy,title:row.title+' · 복사',status:'OPEN',date,endDate:shift(date,Math.round((Date.parse(row.endDate||row.date)-Date.parse(row.date))/86400000)),plan:{...row.plan,stage:'DRAFT',review:''},campaign:{...row.campaign,messageStatus:row.campaign?.messageStatus==='NOT_PLANNED'?'NOT_PLANNED':'PLANNED',messagePlannedDate:'',messageSentDate:''},execution:{...e,checks:normalize().checks,messageDraft:'',utmCampaign:''}};
 }
 function trackedLink(execution){const e=normalize(execution);if(!e.link)return '';const url=new URL(e.link);for(const [key,v] of [['utm_source',e.utmSource],['utm_medium',e.utmMedium],['utm_campaign',e.utmCampaign]])if(v)url.searchParams.set(key,v);return url.href;}
 function draft(row,channel='문자'){const c=row.campaign||{},benefit=c.discountType==='PERCENT'?c.discountValue+'% 할인':c.discountType==='AMOUNT'?c.discountValue.toLocaleString('ko-KR')+'원 할인':row.plan?.benefit||'행사 혜택을 확인해주세요.';return [channel==='SNS'?'이번 행사 소식':channel==='카카오'?'하린식품 소식을 전해드려요.':'하린식품 행사 안내',row.title,row.date+' ~ '+(row.endDate||row.date),benefit,c.discountConditions,trackedLink(row.execution)].filter(Boolean).join('\n');}
 const templates=[{name:'재구매 감사',goal:'재구매 고객 감사 행사',audience:'재구매 고객',benefit:'감사 혜택을 기획해주세요.'},{name:'시즌 선물전',goal:'시즌 선물세트 판매',audience:'선물 구매 고객',benefit:'선물세트 혜택을 기획해주세요.'},{name:'신상품 소개',goal:'신상품 첫 구매',audience:'신상품 관심 고객',benefit:'첫 구매 혜택을 기획해주세요.'}];
 return {normalize,profit,reminders,duplicate,trackedLink,draft,templates,checkNames,costNames,day,shift};
});
