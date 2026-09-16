'use strict';
const {valid}=require('../../desktop/assistant-ads-contract.cjs');
const reports=require('./ads-report.js');
const {cipher,TENANT}=require('../integrations/managed-keys.js');
const {telegram}=require('./bots.js');
const failure=code=>Object.assign(Error(code),{code});
async function command({input,worker,db,session,digest,collect=reports.collect,send=telegram,renderCard=require('./briefing-card.js').render,env=process.env}){
 if(!valid(input,worker))throw failure('ASSISTANT_INVALID');
 const rpc=async v=>{const r=await db.rpc('moaon_assistant_ads',{p_actor:session?.userId||null,p_session:session?.id||null,p_hash:session?.hash||null,p_worker_hash:digest,p_input:v});if(r.error)throw failure(['ASSISTANT_AUTH_REQUIRED','ASSISTANT_CONFLICT','ASSISTANT_DISABLED','ASSISTANT_INVALID'].find(c=>r.error.message?.includes(c))||'ASSISTANT_UNAVAILABLE');return r.data;};
 if(input.action==='ADS_CAMPAIGNS'){const state=await rpc({action:'ADS_READ'});const r=await require('../naver/client.js').request('GET','/ncc/campaigns');if(!Array.isArray(r.data)||r.data.length>100)throw failure('ADS_CAMPAIGNS_REQUIRED');return {...state,campaigns:r.data.map(c=>({id:c.nccCampaignId,name:c.name}))};}
 if(input.action==='ADS_WATCHDOG'){await rpc({action:'ADS_READ'});await require('./watchdog.js').check({db,env,send});return rpc({action:'ADS_READ'});}
 if(input.action!=='ADS_TICK')return rpc(input);
 const j=await rpc({action:'CLAIM'});
 if(j.id){
  try{const summary=await collect({start:j.start_date,end:j.end_date,fresh:j.fresh,db,campaignIds:j.campaign_ids||[]});
   if(j.dedupe?.startsWith('change:')){const shift=d=>new Date(Date.parse(d)-7*86400000).toISOString().slice(0,10);const previous=await collect({start:shift(j.start_date),end:shift(j.end_date),fresh:true,db,campaignIds:j.campaign_ids||[]});summary.change=require('./ads-change.js').compare(summary,previous,j.changeSettings);}
   summary.scope={campaignIds:j.campaign_ids||[],mode:j.campaign_ids?.length?'SELECTED':'ALL'};summary.parentJobId=j.parent_id||null;
   if(j.parent_id)summary.revisionComparison=require('./ads-revision.js').compareRevision(summary,j.parentSummary);
   const r=await db.rpc('create_report_version',{p_platform:'NAVER',p_report_type:'ADHOC',p_period_start:j.start_date,p_period_end:j.end_date,p_title:'광고비서 네이버 리포트 ('+j.start_date+'~'+j.end_date+')',p_status:'FINAL',p_summary_json:summary,p_report_html:null,p_revision_note:'광고비서 작업 '+j.id});
   if(r.error)throw failure('ADS_REPORT_SAVE_FAILED');const row=Array.isArray(r.data)?r.data[0]:r.data;if(!row?.id)throw failure('ADS_REPORT_SAVE_FAILED');
   await rpc({action:'FINISH',id:j.id,status:'SUCCEEDED',reportId:row.id,summary,error:null});
  }catch(e){await rpc({action:'FINISH',id:j.id,status:'FAILED',reportId:null,summary:null,error:['ADS_CAMPAIGN_MISSING','ADS_NO_DATA','ADS_DATE_INVALID','ADS_CAMPAIGNS_REQUIRED','ADS_STORED_DATA_REQUIRED','ADS_REPORT_SAVE_FAILED'].includes(e.code)?e.code:'ADS_COLLECTION_FAILED'});}
 }
 const d=await rpc({action:'DELIVERY'});
 if(d.job){let status='UNKNOWN';try{const b=d.bot,token=cipher(env).open({tenantId:TENANT,provider:'TELEGRAM_'+b.slot,revision:b.revision},b.envelope).token;const j=d.job,m=j.summary?.metrics;const show=v=>v===null||v===undefined?'확인 필요':Math.round(v*100)/100;
  const text=j.status==='SUCCEEDED'?'광고비서 리포트 완료\n'+j.start_date+' ~ '+j.end_date+'\n광고비 '+show(m.cost)+'원 · 클릭 '+show(m.clicks)+'\n전환 '+show(m.conversions)+' · ROAS '+show(m.roas)+'%\n자료 상태: '+j.summary.status+'\n광고 전환매출은 순이익이 아닙니다.':'광고 리포트 확인 필요\n'+j.start_date+' ~ '+j.end_date+'\n상태: '+j.status+' · '+j.error_code+'\n모아온 업무비서 → 광고 자동화에서 확인하세요.';
  const change=j.summary?.change;const message=change?'광고 성과 변화 알림\n'+j.start_date+' ~ '+j.end_date+'\n'+change.signals.map(x=>x.label+' '+(x.percent>0?'+':'')+x.percent+'%').join('\n')+'\n직전 7일 대비 · 원인과 전환 지연을 확인하세요.\n통계적 유의성·이익 판단을 의미하지 않습니다.':text;
  await require('./briefing-card.js').send({token,chatId:b.settings.chatId,slot:'AD',text:message+(j.summary?.revisionComparison?'\n\n'+require('./ads-revision.js').describe(j.summary.revisionComparison):'')+'\nAPI 조회: '+(j.summary?.sourceAsOf||'확인 필요'),markup:{inline_keyboard:[[{text:'모아온에서 리포트 확인',url:'https://harin-cafe24-sync.vercel.app'}]]},telegram:send,renderer:renderCard});status='SENT';
 }catch(e){status=e.code==='BOT_REJECTED'?'FAILED':'UNKNOWN';}await rpc({action:'DELIVERED',id:d.job.id,status});}
 return {processed:!!j.id};
}
module.exports={command};
