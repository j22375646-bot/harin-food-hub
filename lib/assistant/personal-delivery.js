'use strict';
const {cipher,TENANT}=require('../integrations/managed-keys.js');
const cards=require('./briefing-card.js');
const names={WORK:'업무비서',SOLO:'개인비서',SUP:'관리비서',STUDY:'학습비서',AD:'광고비서'};
const platforms={NAVER:'네이버',CAFE24:'카페24',COUPANG:'쿠팡'};
const count=v=>Number.isSafeInteger(v)&&v>=0?v+'건':'확인 필요';
const metric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.round(v*100)/100:'확인 필요';
const fail=code=>Object.assign(Error(code),{code});
const args=(digest,input)=>({p_actor:null,p_session:null,p_hash:null,p_worker_hash:digest,p_input:input});
async function rpc(db,digest,input,name='moaon_assistant_preferences'){
 const r=await db.rpc(name,args(digest,input));
 if(r.error)throw fail(['ASSISTANT_AUTH_REQUIRED','ASSISTANT_CONFLICT','ASSISTANT_DISABLED','ASSISTANT_INVALID'].find(c=>r.error.message?.includes(c))||'ASSISTANT_UNAVAILABLE');
 return r.data;
}
function workText(data,slot){
 const sources=data?.sources||{},lines=['모아온 '+names[slot]+' 브리핑'];
 for(const [platform,label] of Object.entries(platforms)){
  const channel=sources.orders?.channels?.find(c=>c.platform===platform),counts=channel?.status==='READY'?channel.counts:null;
  lines.push(label+' · 발급 전 '+count(counts?.ACTIVE)+' / 배송대기 '+count(counts?.REGISTER));
 }
 // The loader is explicitly scoped to the claim's recipient, never the read-key issuer.
 const tasks=sources.tasks,counts=tasks?.status==='READY'&&tasks.scope==='ASSIGNED_TO_ME'?tasks.counts:null;
 lines.push('내 업무 · 오늘 마감 '+count(counts?.dueToday)+' / 기한 초과 '+count(counts?.overdue));
 for(const [platform,label] of Object.entries(platforms)){
  const channel=sources.cs?.channels?.find(c=>c.platform===platform);
  lines.push(label+' · 미답변 '+count(sources.cs?.status==='READY'?channel?.unanswered:null));
 }
 lines.push('조회: '+(data?.retrievedAt||'확인 필요'),'모아온 저장 자료 기준 · 원본 수집 시각 확인 필요');
 return lines.join('\n');
}
function roleText(data,slot,now){
 const lines=['모아온 '+names[slot]+' 브리핑'];
 if(slot==='SUP'){
  let issues=0,complete=Array.isArray(data?.bots);
  const states=Object.entries(names).map(([key,name])=>{
   const bot=data?.bots?.find(b=>b.slot===key);let state='확인 필요';
   if(bot?.enabled===false)state='연결 꺼짐';
   else if(bot?.enabled===true){const age=now.getTime()-Date.parse(bot.checkedAt);if(age>=0&&age<300000&&bot.status==='RUNNING')state='실행 확인';}
   if(state==='확인 필요')issues++;
   return name+' · '+state;
  });
  lines.push('연결 확인 필요 · '+count(complete?issues:null),...states,'발송 실패 · 24시간 · '+count(data?.deliveries?.failed),'결과 확인 필요 · 24시간 · '+count(data?.deliveries?.unknown));
  lines.push('봇 실행 신호와 일반 브리핑 발송 이력 기준 · 광고 발송 이력은 광고 자동화에서 확인하세요.','Hermes 중단 시 이 브리핑도 중단됩니다.');
 }else{
  if(data?.knowledgeEnabled===false)lines.push('지식 공유 꺼짐 · 모아온에서 연결 설정을 확인하세요.');
  else if(data?.knowledgeEnabled!==true)lines.push('공유 지식 자료 확인 필요');
  else{
   lines.push('검토 대기 · '+count(data.pending),'공유 지식 · '+count(data.published),'최근 7일 등록·수정 지식 · 최대 3개');
   if(Array.isArray(data.recent)){
    for(const item of data.recent.slice(0,3))lines.push('지식 · '+String(item.title||'제목 확인 필요').replace(/\s+/g,' ').slice(0,100));
    if(!data.recent.length)lines.push('최근 7일 등록·수정 지식이 없어요.');
   }else lines.push('최근 지식 자료 확인 필요');
  }
  lines.push('승인·저장된 공유 지식 기준 · 개인 대화 기억이나 AI 모델 재학습이 아닙니다.');
 }
 lines.push('조회: '+(data?.retrievedAt||'확인 필요'));
 return lines.join('\n');
}
async function latestAd({db}){
 // Reuse a completed report. Personal recipients never trigger new provider collection.
 const r=await db.from('reports').select('period_start,period_end,summary_json,created_at').eq('platform','NAVER').eq('status','FINAL').eq('is_latest',true).contains('summary_json',{advertisingAssistant:true}).order('created_at',{ascending:false}).limit(1);
 if(r.error||!Array.isArray(r.data))throw fail('ASSISTANT_UNAVAILABLE');
 return r.data[0]||null;
}
function adText(report,now){
 const s=report?.summary_json,lines=['모아온 광고비서 브리핑'];
 if(!s){lines.push('저장된 광고 리포트 확인 필요','원본 집계 기간: 확인 필요','원본 API 조회: 확인 필요');return lines.join('\n');}
 const m=s.metrics||{},asOf=typeof s.sourceAsOf==='string'?s.sourceAsOf:null,age=asOf?now.getTime()-Date.parse(asOf):NaN;
 lines.push('원본 집계 기간: '+(report.period_start||'확인 필요')+' ~ '+(report.period_end||'확인 필요'));
 lines.push('원본 집계 범위: '+(s.scope?.mode==='ALL'?'전체 캠페인':s.scope?.mode==='SELECTED'&&Array.isArray(s.scope.campaignIds)?'선택 '+s.scope.campaignIds.length+'개 캠페인':'확인 필요'));
 const yesterday=new Date(now.getTime()+9*3600000-86400000).toISOString().slice(0,10);
 if(report.period_end!==yesterday)lines.push('최신 집계 확인 필요 · 전일 마감 기준 리포트가 아닙니다.');
 lines.push('광고비 '+metric(m.cost)+'원 · 클릭 '+metric(m.clicks),'전환 '+metric(m.conversions)+' · ROAS '+metric(m.roas)+'%');
 lines.push('자료 경과: '+(Number.isFinite(age)&&age>=0?Math.floor(age/3600000)+'시간':'확인 필요'));
 lines.push('자료 상태: '+(['OBSERVED','PARTIAL'].includes(s.status)?s.status:'확인 필요'),'API 조회: '+(asOf&&Number.isFinite(Date.parse(asOf))?asOf:'확인 필요'),'기존 저장 리포트 재사용 · 이번 발송에서 API를 다시 조회하지 않았습니다.','광고 전환매출은 순이익이 아닙니다.');
 return lines.join('\n');
}
async function buildText({db,digest,delivery,now=new Date(),load=require('../dashboard/workspace-assistant-loader.js').loadWorkspaceAssistant,loadAd=latestAd}){
 const scopes=Array.isArray(delivery.scopes)?delivery.scopes:[];
 if(delivery.kind==='NEW_ORDER'){
  const lines=['모아온 신규 주문 알림'];
  for(const [platform,label] of Object.entries(platforms)){
   const group=scopes.includes('orders')?delivery.groups?.find(g=>g.platform===platform):null;
   // Absent channels are not asserted to be zero; only claim-verified groups are shown.
   if(group)lines.push(label+' · 신규 주문 '+count(group.count));
  }
  if(lines.length===1)lines.push('신규 주문 자료 확인 필요');
  lines.push('모아온 저장 자료에서 새로 확인한 주문 · 주문·배송에서 처리 상태를 확인하세요.');
  return lines.join('\n');
 }
 if(['WORK','SOLO'].includes(delivery.slot)){
  const allowed=['orders','cs','tasks'].filter(scope=>scopes.includes(scope));
  let data;try{if(allowed.length){data=await load({db,context:{tenantId:TENANT,userId:delivery.userId},scopes:allowed,now});data={...data,sources:Object.fromEntries(allowed.map(scope=>[scope,data?.sources?.[scope]]))};}}catch{}
  return workText(data,delivery.slot);
 }
 if(delivery.slot==='AD'){let report;try{if(scopes.includes('reports'))report=await loadAd({db});}catch{}return adText(report,now);}
 let data;try{data=await rpc(db,digest,{action:'AUTO_BRIEF',slot:delivery.slot},'moaon_assistant_bot_automation');}catch{}
 return roleText(data,delivery.slot,now);
}
async function tick({db,digest,env=process.env,send=require('./bots.js').telegram,renderCard=cards.render,build=buildText,now=new Date()}){
 const due=await rpc(db,digest,{action:'PREF_DUE'}),result={processed:0,sent:0,failed:0,unknown:0};
 for(const item of (due?.jobs||[]).slice(0,4)){
  let claimed;
  try{claimed=await rpc(db,digest,{...item,action:'PREF_CLAIM'});}catch(e){
   // A preference/binding change between poll and claim skips only this recipient.
   if(['ASSISTANT_CONFLICT','ASSISTANT_DISABLED','ASSISTANT_AUTH_REQUIRED'].includes(e.code))continue;
   throw e;
  }
  if(claimed?.claimed!==true)continue;
  const delivery=claimed;let status='FAILED',attempted=false;
  try{
   if(!delivery?.userId||!names[delivery.slot]||!/^\d{1,20}$/.test(delivery.chatId)||delivery.bot?.slot!==delivery.slot)throw fail('ASSISTANT_INVALID');
   const b=delivery.bot,token=cipher(env).open({tenantId:TENANT,provider:'TELEGRAM_'+b.slot,revision:b.revision},b.envelope).token;
   let text=await build({db,digest,delivery,now});
   if(delivery.kind==='TEST')text='모아온 '+names[delivery.slot]+' 시험 발송\n'+text;
   await cards.send({token,chatId:delivery.chatId,slot:delivery.slot,text,markup:{inline_keyboard:[[{text:'모아온에서 확인',url:'https://harin-cafe24-sync.vercel.app'}]]},renderer:renderCard,telegram:async(...p)=>{attempted=true;return send(...p);}});
   status='SENT';
  }catch(e){status=!attempted||e.code==='BOT_REJECTED'||e.code==='BOT_INVALID'?'FAILED':'UNKNOWN';}
  // A result-write failure must not repeat the Telegram request; the DB claim stays consumed.
  await rpc(db,digest,{action:'PREF_RESULT',userId:item.userId,slot:item.slot,id:item.id,status});
  result.processed++;result[status.toLowerCase()]++;
 }
 return result;
}
module.exports={tick,buildText,workText,roleText,latestAd,adText};
