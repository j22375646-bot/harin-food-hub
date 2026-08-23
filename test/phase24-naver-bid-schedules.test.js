'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const schedules=require('../lib/naver/bid-schedules.js');
const runner=require('../lib/naver/bid-schedule-runner.js');

function schedule(overrides={}){
  return {
    platform:'NAVER',ncc_adgroup_id:'grp-1',mode:'OBSERVE',weekdays:[1,2,3,4,5],
    start_minute:540,end_minute:1080,interval_minutes:60,max_changes_per_run:3,
    daily_change_limit:6,allow_increase:false,...overrides
  };
}

function candidate(id,overrides={}){
  return {
    platform:'NAVER',ncc_keyword_id:id,ncc_adgroup_id:'grp-1',keyword:`키워드 ${id}`,
    current_bid:300,minimum_owner_bid:250,maximum_owner_bid:330,
    can_request_approval:true,period_end:'2026-08-23',
    automation:{eligible:true,action:'LOWER',proposed_bid:280,blockers:[]},...overrides
  };
}

function rule(id,overrides={}){
  return {
    ncc_keyword_id:id,ncc_adgroup_id:'grp-1',enabled:true,target_rank:3,target_rank_mode:'REFERENCE_ONLY',
    minimum_bid:270,maximum_bid:500,increase_step:20,decrease_step:30,...overrides
  };
}

test('24-4 validates a Naver-only group schedule and requires one explicit activation confirmation',()=>{
  const observed=schedules.validateNaverBidSchedule(schedule());
  assert.equal(observed.mode,'OBSERVE');
  assert.equal(observed.activation_confirmed_at,null);
  assert.deepEqual(observed.weekdays,[1,2,3,4,5]);

  assert.throws(()=>schedules.validateNaverBidSchedule(schedule({platform:'COUPANG'})),error=>error.code==='NAVER_SCOPE_REQUIRED');
  assert.throws(()=>schedules.validateNaverBidSchedule(schedule({mode:'ACTIVE'})),error=>error.code==='ACTIVATION_CONFIRMATION_REQUIRED');

  const active=schedules.validateNaverBidSchedule(schedule({mode:'ACTIVE',confirm_active:true}));
  assert.equal(active.mode,'ACTIVE');
  assert.match(active.activation_confirmed_at,/^\d{4}-\d{2}-\d{2}T/);
});

test('24-4 only considers a schedule due inside its KST weekday, time, and interval slot',()=>{
  const monday=new Date('2026-08-24T00:10:00.000Z'); // 09:10 KST
  assert.equal(schedules.scheduleDue(schedule(),monday),true);
  assert.equal(schedules.scheduleDue(schedule({last_run_slot:'2026-08-24:09:00'}),monday),false);
  assert.equal(schedules.scheduleDue(schedule({weekdays:[2]}),monday),false);
  assert.equal(schedules.scheduleDue(schedule({start_minute:600}),monday),false);
  assert.equal(schedules.scheduleDue(schedule({mode:'PAUSED'}),monday),false);
});

test('24-4 builds an observe plan from enabled Naver rules and never admits Coupang or unsafe increases',()=>{
  const result=schedules.buildNaverBidSchedulePlan({
    schedule:schedule(),now:new Date('2026-08-23T03:00:00.000Z'),
    candidates:[
      candidate('kw-lower'),
      candidate('kw-raise',{automation:{eligible:true,action:'RAISE',proposed_bid:320,blockers:[]}}),
      candidate('kw-disabled'),
      {...candidate('cp-1'),platform:'COUPANG'}
    ],
    rules:[rule('kw-lower'),rule('kw-raise'),rule('kw-disabled',{enabled:false})]
  });

  assert.equal(result.mode,'OBSERVE');
  assert.equal(result.execute,false);
  assert.deepEqual(result.actions.map(item=>[item.ncc_keyword_id,item.proposed_bid]),[['kw-lower',280]]);
  assert.equal(result.blocked.some(item=>item.code==='INCREASE_NOT_ALLOWED'),true);
  assert.equal(result.actions.some(item=>item.ncc_keyword_id==='cp-1'),false);
});

test('24-4 clamps recommendations to the saved 24-3 safety rule and enforces run and daily limits',()=>{
  const result=schedules.buildNaverBidSchedulePlan({
    schedule:schedule({mode:'ACTIVE',confirm_active:true,max_changes_per_run:2,daily_change_limit:2}),
    now:new Date('2026-08-23T03:00:00.000Z'),dailyExecutedCount:1,automationEnabled:true,
    candidates:[
      candidate('kw-1',{automation:{eligible:true,action:'LOWER',proposed_bid:200,blockers:[]}}),
      candidate('kw-2',{automation:{eligible:true,action:'LOWER',proposed_bid:270,blockers:[]}})
    ],
    rules:[rule('kw-1'),rule('kw-2')]
  });

  assert.equal(result.execute,true);
  assert.equal(result.actions.length,1);
  assert.equal(result.actions[0].ncc_keyword_id,'kw-1');
  assert.equal(result.actions[0].current_bid,300);
  assert.equal(result.actions[0].proposed_bid,270);
  assert.equal(result.actions[0].clamped,true);
  assert.equal(result.blocked.some(item=>item.code==='DAILY_LIMIT_REACHED'),true);
});

test('24-4 leaves active schedules blocked when the server automation kill switch is off or evidence is stale',()=>{
  const inactive=schedules.buildNaverBidSchedulePlan({
    schedule:schedule({mode:'ACTIVE',confirm_active:true}),now:new Date('2026-08-23T03:00:00.000Z'),
    automationEnabled:false,candidates:[candidate('kw-1')],rules:[rule('kw-1')]
  });
  assert.equal(inactive.execute,false);
  assert.equal(inactive.status,'SETUP_REQUIRED');

  const stale=schedules.buildNaverBidSchedulePlan({
    schedule:schedule(),now:new Date('2026-08-23T03:00:00.000Z'),
    candidates:[candidate('kw-old',{period_end:'2026-08-18'})],rules:[rule('kw-old')]
  });
  assert.equal(stale.actions.length,0);
  assert.equal(stale.blocked[0].code,'STALE_PERFORMANCE_DATA');
});

test('24-4 converts the official PC and mobile position estimate into one bounded step, not a claimed live rank',async()=>{
  const api={
    async request(method,uri,query,body){
      assert.equal(method,'POST');
      assert.equal(uri,'/estimate/average-position-bid/keyword');
      const bid=body.device==='PC'?420:460;
      return {status:200,data:{estimate:body.items.map(item=>({keyword:item.key,position:item.position,bid}))}};
    }
  };
  const rows=await schedules.buildEstimateCandidates({
    api,now:new Date('2026-08-23T03:00:00.000Z'),
    keywords:[{ncc_keyword_id:'nkw-1',ncc_adgroup_id:'grp-1',keyword:'작두콩차',bid_amount:300,status:'ELIGIBLE',user_lock:false}],
    rules:[rule('nkw-1',{increase_step:20,target_rank:2})]
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].automation.action,'RAISE');
  assert.equal(rows[0].automation.proposed_bid,320);
  assert.equal(rows[0].estimate.target_bid,460);
  assert.equal(rows[0].estimate.notice,'네이버의 PC·모바일 목표 순위 예상값이며 실제 노출 순위를 보장하지 않습니다.');
});

test('24-4 batches large estimate requests and keeps a mobile-only result labelled as mobile',async()=>{
  const calls=[];
  const api={async request(method,uri,query,body){
    calls.push({device:body.device,count:body.items.length});
    if(body.device==='PC')throw new Error('temporary PC estimate failure');
    return {status:200,data:{estimate:body.items.map(item=>({keyword:item.key,position:item.position,bid:250}))}};
  }};
  const keywords=Array.from({length:101},(_,index)=>({ncc_keyword_id:`nkw-${index}`,ncc_adgroup_id:'grp-1',keyword:`작두콩차 ${index}`,bid_amount:300,status:'ELIGIBLE',user_lock:false}));
  const rules=keywords.map(item=>rule(item.ncc_keyword_id));
  const rows=await schedules.buildEstimateCandidates({api,keywords,rules,now:new Date('2026-08-23T03:00:00.000Z')});
  assert.equal(rows.length,101);
  assert.equal(rows[0].estimate.pc_bid,null);
  assert.equal(rows[0].estimate.mobile_bid,250);
  assert.deepEqual(calls.filter(item=>item.device==='MOBILE').map(item=>item.count),[50,50,1]);
  assert.equal(calls.every(item=>item.count<=schedules.ESTIMATE_BATCH_SIZE),true);
});

test('24-4 observe runs persist the plan but never create or execute a provider change',async()=>{
  const finished=[];let writeCalls=0;
  const current=schedule({weekdays:[0]});
  const result=await runner.runDueNaverBidSchedules({
    now:new Date('2026-08-23T03:10:00.000Z'),automationEnabled:true,db:{},
    api:{request:async(method,uri,query,body)=>({status:200,data:{estimate:body.items.map(item=>({keyword:item.key,bid:250,position:item.position}))}})},
    store:{
      listNaverBidSchedules:async()=>[current],claimRun:async()=>({reused:false,run:{id:'run-1'}}),
      dailyExecutedCount:async()=>0,finishRun:async input=>finished.push(input)
    },
    loadGroupContext:async()=>({keywords:[{ncc_keyword_id:'nkw-1',ncc_adgroup_id:'grp-1',keyword:'작두콩차',bid_amount:300,status:'ELIGIBLE',user_lock:false}],rules:[rule('nkw-1')],links:[]}),
    financialChanges:{createNaverBidPreview:async()=>{writeCalls++;},confirmAndExecute:async()=>{writeCalls++;}}
  });
  assert.equal(result.runs[0].status,'OBSERVED');
  assert.equal(writeCalls,0);
  assert.equal(finished[0].planned,1);
});

test('24-4 active runs use idempotent financial changes and retain the live verification result',async()=>{
  const finished=[];const calls=[];
  const current=schedule({mode:'ACTIVE',confirm_active:true,weekdays:[0]});
  const result=await runner.runDueNaverBidSchedules({
    now:new Date('2026-08-23T03:10:00.000Z'),automationEnabled:true,db:{},
    api:{request:async(method,uri,query,body)=>({status:200,data:{estimate:body.items.map(item=>({keyword:item.key,bid:250,position:item.position}))}})},
    store:{
      listNaverBidSchedules:async()=>[current],claimRun:async()=>({reused:false,run:{id:'run-2'}}),
      dailyExecutedCount:async()=>0,finishRun:async input=>finished.push(input)
    },
    loadGroupContext:async()=>({keywords:[{ncc_keyword_id:'nkw-1',ncc_adgroup_id:'grp-1',keyword:'작두콩차',bid_amount:300,status:'ELIGIBLE',user_lock:false}],rules:[rule('nkw-1')],links:[]}),
    financialChanges:{
      createNaverBidPreview:async(snapshot,bid,options)=>{calls.push({kind:'preview',snapshot,bid,options});return {request:{id:'change-1'}};},
      confirmAndExecute:async id=>{calls.push({kind:'execute',id});return {verified:true,request:{status:'VERIFIED'}};}
    }
  });
  assert.equal(result.runs[0].status,'COMPLETED');
  assert.deepEqual(calls.map(item=>item.kind),['preview','execute']);
  assert.match(calls[0].options.idempotencyKey,/naver-schedule:grp-1:/);
  assert.equal(finished[0].executed,1);
});

test('24-4 schedule API is owner-only and the cron endpoint rejects unauthenticated callers',async()=>{
  const scheduleRoute=await import(`${pathToFileURL(path.join(__dirname,'..','app','api','naver','bid-schedules','route.js')).href}?test=${Date.now()}`);
  const cronRoute=await import(`${pathToFileURL(path.join(__dirname,'..','app','api','cron','naver-bid-automation','route.js')).href}?test=${Date.now()}`);
  const getResponse=await scheduleRoute.GET(new Request('https://hub.example/api/naver/bid-schedules'));
  const postResponse=await scheduleRoute.POST(new Request('https://hub.example/api/naver/bid-schedules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(schedule())}));
  const cronResponse=await cronRoute.GET(new Request('https://hub.example/api/cron/naver-bid-automation'));
  assert.equal(getResponse.status,401);
  assert.equal(postResponse.status,401);
  assert.equal(cronResponse.status,401);
});

test('24-4 reuses the already running AWS hourly order trigger on a Vercel Hobby project',()=>{
  const root=path.join(__dirname,'..');
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  const hourly=fs.readFileSync(path.join(root,'app','api','cron','hourly-orders','route.js'),'utf8');
  assert.equal(vercel.crons.some(item=>item.path==='/api/cron/naver-bid-automation'),false);
  assert.match(hourly,/runDueNaverBidSchedules\(\{db\}\)/);
  assert.match(hourly,/NAVER_BID_SCHEDULES/);
  assert.match(hourly,/maxDuration = 300/);
});

test('24-4 renders the schedule control only in the Naver campaign and adgroup workspace',()=>{
  const tableSource=fs.readFileSync(path.join(__dirname,'..','app','_analysis','keyword-operations-table.js'),'utf8');
  const panelSource=fs.readFileSync(path.join(__dirname,'..','app','_analysis','keyword-bid-schedule-panel.js'),'utf8');
  assert.match(tableSource,/import KeywordBidSchedulePanel from '.\/keyword-bid-schedule-panel\.js'/);
  assert.match(tableSource,/!isCoupang&&groupEnabled&&adgroupId!=='ALL'/);
  assert.match(panelSource,/platform:'NAVER'/);
  assert.match(panelSource,/관찰만/);
  assert.match(panelSource,/자동 적용/);
  assert.doesNotMatch(panelSource,/\/api\/coupang\//);
});
