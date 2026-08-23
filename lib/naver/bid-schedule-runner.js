'use strict';

const supabaseModule=require('../cafe24/supabase.js');
const client=require('./client.js');
const schedules=require('./bid-schedules.js');
const scheduleStore=require('./bid-schedule-store.js');
const ruleStore=require('./bid-rule-store.js');
const financialChangeModule=require('../changes/financial-change.js');

const enabled=value=>String(value||'').trim().toLowerCase()==='true';

async function loadGroupContextDefault({db,schedule}){
  const keywords=await db.from('naver_keywords').select('ncc_keyword_id,ncc_adgroup_id,keyword,bid_amount,status,user_lock,updated_at').eq('ncc_adgroup_id',schedule.ncc_adgroup_id).limit(500);
  if(keywords.error)throw keywords.error;
  const rules=(await ruleStore.listNaverBidRules({db})).filter(item=>item.ncc_adgroup_id===schedule.ncc_adgroup_id&&item.enabled===true);
  const ids=rules.map(item=>item.ncc_keyword_id);
  let links=[];
  if(ids.length){
    const result=await db.from('naver_keyword_product_links').select('ncc_keyword_id,master_product_id,updated_at').in('ncc_keyword_id',ids).limit(500);
    if(result.error)throw result.error;
    links=result.data||[];
  }
  return {keywords:keywords.data||[],rules,links};
}

function snapshotFor(action,context,slot){
  const link=(context.links||[]).find(item=>String(item.ncc_keyword_id)===action.ncc_keyword_id);
  const decrease=action.proposed_bid<action.current_bid;
  return {
    scope:'naver-bid-proposal',ncc_keyword_id:action.ncc_keyword_id,keyword:action.keyword,
    current_bid:action.current_bid,recommended_bid:action.proposed_bid,
    minimum_owner_bid:Number(action.candidate.minimum_owner_bid),maximum_owner_bid:Number(action.candidate.maximum_owner_bid),
    metrics:{current_cpc:null},
    product_target:link?{master_product_id:link.master_product_id,source:'SCHEDULE_LINK'}:null,
    period_start:action.candidate.period_start,period_end:action.candidate.period_end,
    formula_version:'n24-scheduled-position-estimate-v1',external_execution_locked:false,
    recommendation_ready:true,manual_decrease_only:decrease,
    automation:{eligible:true,action:action.action,proposed_bid:action.proposed_bid,source:'NAVER_AVERAGE_POSITION_ESTIMATE',target_rank:action.target_rank,target_rank_mode:'REFERENCE_ONLY',run_slot:slot},
    execution_phase:'24-4'
  };
}

function compactAction(action){
  return {ncc_keyword_id:action.ncc_keyword_id,keyword:action.keyword,action:action.action,current_bid:action.current_bid,proposed_bid:action.proposed_bid,clamped:action.clamped,target_rank:action.target_rank,target_rank_mode:'REFERENCE_ONLY'};
}

async function runOne({db,api,store,financialChanges,loadGroupContext,schedule,now,automationEnabled}){
  const slot=schedules.scheduleSlot(schedule,now);
  const claimed=await store.claimRun({db,schedule,slot});
  if(claimed.reused)return {ncc_adgroup_id:schedule.ncc_adgroup_id,slot,status:'SKIPPED',reused:true};
  const runId=claimed.run.id;
  try{
    const context=await loadGroupContext({db,schedule});
    const candidates=await schedules.buildEstimateCandidates({api,keywords:context.keywords,rules:context.rules,now});
    const dailyCount=await store.dailyExecutedCount({db,adgroupId:schedule.ncc_adgroup_id,now});
    const plan=schedules.buildNaverBidSchedulePlan({schedule,candidates,rules:context.rules,now,dailyExecutedCount:dailyCount,automationEnabled});
    const actions=plan.actions.map(compactAction);
    if(plan.mode==='OBSERVE'||!plan.execute){
      const status=plan.status==='SETUP_REQUIRED'?'SETUP_REQUIRED':'OBSERVED';
      await store.finishRun({db,runId,schedule,status,planned:plan.actions.length,executed:0,blocked:plan.blocked.length,details:{actions,blocked:plan.blocked.slice(0,50),estimate_notice:'네이버의 PC·모바일 목표 순위 예상값이며 실제 노출 순위를 보장하지 않습니다.'},slot});
      return {ncc_adgroup_id:schedule.ncc_adgroup_id,slot,status,planned:plan.actions.length,executed:0,blocked:plan.blocked.length};
    }
    const results=[];
    for(const action of plan.actions){
      try{
        const snapshot=snapshotFor(action,context,slot);
        if(action.action==='RAISE'&&!snapshot.product_target){
          throw Object.assign(new Error('증액은 연결 상품과 광고 목표가 준비된 키워드만 자동 적용할 수 있습니다.'),{code:'PRODUCT_LINK_REQUIRED'});
        }
        const safeSlot=slot.replace(/[^0-9:-]/g,'');
        const preview=await financialChanges.createNaverBidPreview(snapshot,action.proposed_bid,{
          db,idempotencyKey:`naver-schedule:${schedule.ncc_adgroup_id}:${safeSlot}:${action.ncc_keyword_id}:${action.proposed_bid}`.slice(0,128),
          actor:'naver-bid-schedule'
        });
        const applied=await financialChanges.confirmAndExecute(preview.request.id,{db,actor:'naver-bid-schedule',note:'사장님이 활성화한 네이버 광고그룹 자동운영 스케줄'});
        if(applied.verified!==true)throw Object.assign(new Error('네이버 반영 뒤 재조회 값이 일치하지 않습니다.'),{code:'VERIFY_FAILED'});
        results.push({ok:true,ncc_keyword_id:action.ncc_keyword_id,request_id:preview.request.id,proposed_bid:action.proposed_bid,verified:true});
      }catch(error){results.push({ok:false,ncc_keyword_id:action.ncc_keyword_id,proposed_bid:action.proposed_bid,code:error.code||'EXECUTION_FAILED',error:String(error.message||error).slice(0,300)});}
    }
    const executed=results.filter(item=>item.ok).length,failed=results.length-executed;
    const status=failed?(executed?'PARTIAL':'FAILED'):'COMPLETED';
    await store.finishRun({db,runId,schedule,status,planned:plan.actions.length,executed,blocked:plan.blocked.length+failed,details:{actions,results,blocked:plan.blocked.slice(0,50)},errorMessage:failed?'일부 네이버 입찰 변경을 다시 확인해야 합니다.':null,slot});
    return {ncc_adgroup_id:schedule.ncc_adgroup_id,slot,status,planned:plan.actions.length,executed,blocked:plan.blocked.length+failed};
  }catch(error){
    await store.finishRun({db,runId,schedule,status:'FAILED',planned:0,executed:0,blocked:1,details:{code:error.code||'RUN_FAILED'},errorMessage:String(error.message||error).slice(0,500),slot}).catch(()=>{});
    return {ncc_adgroup_id:schedule.ncc_adgroup_id,slot,status:'FAILED',error:String(error.message||error).slice(0,300),code:error.code||'RUN_FAILED'};
  }
}

async function runDueNaverBidSchedules({
  db=supabaseModule.getSupabase(),api=client,store=scheduleStore,financialChanges=financialChangeModule,
  loadGroupContext=loadGroupContextDefault,now=new Date(),automationEnabled=enabled(process.env.NAVER_BID_AUTOMATION_ENABLED)
}={}){
  const all=await store.listNaverBidSchedules({db});
  const due=all.filter(item=>schedules.scheduleDue(item,now));
  const runs=[];
  for(const schedule of due)runs.push(await runOne({db,api,store,financialChanges,loadGroupContext,schedule,now,automationEnabled}));
  return {platform:'NAVER',checked_at:now.toISOString(),automation_enabled:automationEnabled,due_count:due.length,runs};
}

module.exports={loadGroupContextDefault,runDueNaverBidSchedules,snapshotFor};
