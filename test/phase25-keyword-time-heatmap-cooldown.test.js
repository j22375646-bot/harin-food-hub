'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const analysis=require('../lib/naver/bid-performance-analysis.js');
const schedules=require('../lib/naver/bid-schedules.js');
const scheduleStore=require('../lib/naver/bid-schedule-store.js');

function schedule(overrides={}){
  return {
    platform:'NAVER',ncc_adgroup_id:'grp-1',mode:'ACTIVE',weekdays:[1,2,3,4,5],
    start_minute:540,end_minute:1080,interval_minutes:60,max_changes_per_run:3,
    daily_change_limit:6,time_slots:null,allow_increase:true,confirm_active:true,
    cooldown_minutes:360,...overrides
  };
}

function rule(){
  return {
    platform:'NAVER',ncc_keyword_id:'nkw-1',ncc_adgroup_id:'grp-1',enabled:true,
    target_rank:3,target_rank_mode:'REFERENCE_ONLY',minimum_bid:70,maximum_bid:1000,
    increase_step:20,decrease_step:20
  };
}

function candidate(){
  return {
    platform:'NAVER',ncc_keyword_id:'nkw-1',ncc_adgroup_id:'grp-1',keyword:'작두콩차',
    current_bid:300,minimum_owner_bid:70,maximum_owner_bid:1000,
    period_start:'2026-08-25',period_end:'2026-08-25',
    automation:{eligible:true,action:'RAISE',proposed_bid:320}
  };
}

test('25-5 builds a 24-hour heatmap from actual Naver rows without filling missing hours with zero',()=>{
  const result=analysis.buildBidOperatingScope({
    scope:{type:'ADGROUP',id:'grp-1',label:'작두콩 광고그룹'},
    period:{since:'2026-08-18',until:'2026-08-24'},
    hourPayload:[{id:'grp-1',data:[
      {hh24:'09',impCnt:40,clkCnt:4,salesAmt:800,ccnt:1,convAmt:9000},
      {hh24:'20',impCnt:70,clkCnt:8,salesAmt:1400,ccnt:2,convAmt:18000}
    ]}]
  });

  assert.equal(result.phase,'25-5');
  assert.equal(result.hour_status,'READY');
  assert.equal(result.hours.length,24);
  assert.equal(result.hours.find(item=>item.hour===9).orders,1);
  assert.equal(result.hours.find(item=>item.hour===20).roas,1285.7);
  assert.equal(result.hours.find(item=>item.hour===10).cost,null);
  assert.equal(result.hours.find(item=>item.hour===10).available,false);
  assert.equal(result.sources.hour.kind,'NAVER_ACTUAL_BREAKDOWN');
});

test('25-5 loads hour breakdown only for the selected Naver operating scope',async()=>{
  const calls=[];
  const db={from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{ncc_adgroup_id:'grp-1',ncc_campaign_id:'cmp-1',name:'작두콩 광고그룹',status:'ELIGIBLE',user_lock:false},error:null};}};}};
  const api={async request(method,uri,query){calls.push({method,uri,query});return {data:[]};}};

  await analysis.loadBidOperatingScope({db,api,adgroupId:'grp-1',now:new Date('2026-08-25T03:00:00.000Z')});

  assert.deepEqual(calls.map(item=>item.query.breakdown),['pcMblTp','regnR3Nm','hh24']);
  assert.ok(calls.every(item=>item.method==='GET'&&item.uri==='/stats'&&item.query.id==='grp-1'));
});

test('25-5 validates an owner-selectable cooldown and defaults existing schedules to six hours',()=>{
  const legacy=schedules.validateNaverBidSchedule(schedule({cooldown_minutes:undefined}));
  const oneDay=schedules.validateNaverBidSchedule(schedule({cooldown_minutes:1440}));

  assert.equal(legacy.cooldown_minutes,360);
  assert.equal(oneDay.cooldown_minutes,1440);
  assert.throws(()=>schedules.validateNaverBidSchedule(schedule({cooldown_minutes:90})),error=>error.code==='COOLDOWN_INVALID');
  assert.match(scheduleStore.SCHEDULE_FIELDS,/cooldown_minutes/);
});

test('25-5 blocks a repeated keyword change until its cooldown expires and exposes the next safe time',()=>{
  const now=new Date('2026-08-25T05:00:00.000Z');
  const recentChanges=[{target_key:'nkw-1',status:'VERIFIED',executed_at:'2026-08-25T02:00:00.000Z'}];
  const blocked=schedules.buildNaverBidSchedulePlan({
    schedule:schedule(),candidates:[candidate()],rules:[rule()],recentChanges,now,
    dailyExecutedCount:0,automationEnabled:true
  });

  assert.equal(blocked.actions.length,0);
  assert.equal(blocked.blocked[0].code,'CHANGE_COOLDOWN_ACTIVE');
  assert.equal(blocked.blocked[0].cooldown_until,'2026-08-25T08:00:00.000Z');
  assert.equal(blocked.blocked[0].remaining_minutes,180);

  const released=schedules.buildNaverBidSchedulePlan({
    schedule:schedule(),candidates:[candidate()],rules:[rule()],recentChanges,
    now:new Date('2026-08-25T08:00:00.000Z'),dailyExecutedCount:0,automationEnabled:true
  });
  assert.equal(released.actions.length,1);
});

test('25-5 never applies Naver cooldown records to another keyword or platform',()=>{
  const state=schedules.changeCooldownState({
    keywordId:'nkw-1',recentChanges:[
      {target_key:'nkw-2',platform:'NAVER',executed_at:'2026-08-25T04:00:00.000Z'},
      {target_key:'nkw-1',platform:'COUPANG',executed_at:'2026-08-25T04:00:00.000Z'}
    ],now:new Date('2026-08-25T05:00:00.000Z'),cooldownMinutes:360
  });

  assert.equal(state.locked,false);
  assert.equal(state.cooldown_until,null);
});

test('25-5 renders a V8 hour heatmap and owner-selectable cooldown without adding a Coupang write path',()=>{
  const root=path.join(__dirname,'..');
  const scope=fs.readFileSync(path.join(root,'app','_analysis','keyword-operating-scope-panel.js'),'utf8');
  const schedulePanel=fs.readFileSync(path.join(root,'app','_analysis','keyword-bid-schedule-panel.js'),'utf8');
  const operationsTable=fs.readFileSync(path.join(root,'app','_analysis','keyword-operations-table.js'),'utf8');
  const scopeCss=fs.readFileSync(path.join(root,'app','_analysis','harin-analysis-v8.css'),'utf8');

  assert.match(scope,/focus==='HOUR'/);
  assert.match(scope,/값이 없는 시간은 0으로 채우지 않고 확인 필요/);
  assert.match(scopeCss,/\.keywordHourGrid\{[^}]*repeat\(12/);
  assert.match(scopeCss,/@media\(max-width:700px\)[\s\S]*?\.keywordHourGrid\{grid-template-columns:repeat\(6/);
  assert.match(schedulePanel,/같은 키워드 변경 휴지기/);
  assert.match(schedulePanel,/\[1440,'24시간'\]/);
  assert.match(operationsTable,/<details open className="keywordOpsAdgroupWorkspace keywordOpsScopePane"/);
  assert.doesNotMatch(schedulePanel,/COUPANG/);
});
