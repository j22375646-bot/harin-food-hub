'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildLiveNavigationOperationSnapshot,loadLiveNavigationOperationSnapshot}=require('../lib/navigation/live-operation-snapshot.js');
const {MAIN_REMOTE_QUERY_BUDGET,loadPhase28MainDashboard}=require('../lib/dashboard/phase28-main-loader.js');
const {buildNavigationOperationSnapshot}=require('../lib/navigation/operation-snapshot.js');

const now='2026-09-07T06:00:00.000Z';
const csTables=['customer_service_items','coupang_inquiries','coupang_returns','coupang_exchanges'];

function customerServiceFixtures(){
  return {
    customer_service_items:[
      {id:'naver',source_key:'NAVER:INQUIRY:naver',platform:'NAVER',kind:'INQUIRY',completed:false,occurred_at:now},
      {id:'cafe24',source_key:'CAFE24:CANCEL:cafe24',platform:'CAFE24',kind:'CANCEL',completed:false,occurred_at:now},
      {id:'done',source_key:'NAVER:INQUIRY:done',platform:'NAVER',kind:'INQUIRY',completed:true,occurred_at:now}
    ],
    coupang_inquiries:[
      {inquiry_key:'ONLINE:online',inquiry_id:'online',inquiry_type:'ONLINE',answered:false,inquired_at:now},
      {inquiry_key:'CALL_CENTER:call',inquiry_id:'call',inquiry_type:'CALL_CENTER',answered:false,inquired_at:now},
      {inquiry_key:'ONLINE:done',inquiry_id:'done',inquiry_type:'ONLINE',answered:true,inquired_at:now}
    ],
    coupang_returns:[
      {receipt_id:'cancel',cancel_type:'CANCEL',status:'RELEASE_STOP_UNCHECKED',requested_at:now},
      {receipt_id:'refunded',cancel_type:'RETURN',status:'REFUND_COMPLETE',requested_at:now}
    ],
    coupang_exchanges:[
      {exchange_id:'exchange',status:'PROGRESS',requested_at:now},
      {exchange_id:'done',status:'SUCCESS',requested_at:now}
    ]
  };
}

// The boundary double replaces only database I/O. Both production loaders and
// their real CS/status/summary builders still run, using the selected DB fields.
function fixtureDatabase(fixtures=customerServiceFixtures()){
  const failures=new Set();
  const calls=[];
  const db={from(table){
    const call={table,fields:null};
    calls.push(call);
    const query={
      select(fields){call.fields=fields;return query;},
      eq(){return query;},neq(){return query;},in(){return query;},or(){return query;},
      gt(){return query;},gte(){return query;},lt(){return query;},lte(){return query;},
      order(){return query;},limit(){return query;},range(){return query;},maybeSingle(){return query;},
      then(resolve,reject){
        if(failures.has(table))return Promise.resolve({data:null,count:null,error:{code:'SOURCE_UNAVAILABLE'}}).then(resolve,reject);
        const rows=fixtures[table]||[];
        const fields=String(call.fields||'*').split(',');
        const data=fields.includes('*')?rows:rows.map(row=>Object.fromEntries(fields.filter(key=>key in row).map(key=>[key,row[key]])));
        return Promise.resolve({data,count:rows.length,error:null}).then(resolve,reject);
      }
    };
    return query;
  }};
  return {db,calls,failures};
}

test('a Coupang-only unanswered inquiry is included in the shared CS badge',()=>{
  const snapshot=buildLiveNavigationOperationSnapshot({
    generatedAt:now,customerServiceRows:[],
    coupangInquiries:[{inquiry_key:'ONLINE:one',inquiry_id:'one',answered:false,inquired_at:now}]
  });
  assert.equal(snapshot.badges.cs,1);
});

test('live CS counts include every provider source and exclude completed work',async()=>{
  const database=fixtureDatabase();
  const result=await loadLiveNavigationOperationSnapshot({db:database.db,now});
  assert.equal(result.snapshot.badges.cs,6);
  assert.equal(result.partial,false);
});

test('Main CS counts retain channel identities and match the shared open-work boundary',async()=>{
  const database=fixtureDatabase();
  const data=await loadPhase28MainDashboard({db:database.db,now});
  assert.equal(data.customerService.summary.active,6);
  assert.equal(data.customerService.summary.unanswered,3);
  assert.equal(data.customerService.summary.claims,3);
  assert.equal(buildNavigationOperationSnapshot(data).badges.cs,6);
  assert.deepEqual(data.customerService.active.map(item=>item.id).sort(),[
    'CAFE24:CANCEL:cafe24','COUPANG:CANCEL:cancel','COUPANG:EXCHANGE:exchange',
    'COUPANG:INQUIRY:CALL_CENTER:call','COUPANG:INQUIRY:ONLINE:online','NAVER:INQUIRY:naver'
  ]);
  assert.equal(data.coupang.unansweredInquiries,2,'the Coupang summary must not include Naver inquiries');
});

for(const table of csTables){
  test(`live CS stays unknown when ${table} fails and recovers on the next read`,async()=>{
    const database=fixtureDatabase();
    database.failures.add(table);
    const failed=await loadLiveNavigationOperationSnapshot({db:database.db,now});
    assert.equal(failed.snapshot.badges.cs,null);
    assert.equal(failed.partial,true);
    assert.ok(failed.unavailable.includes(table));
    database.failures.delete(table);
    const recovered=await loadLiveNavigationOperationSnapshot({db:database.db,now});
    assert.equal(recovered.snapshot.badges.cs,6);
    assert.equal(recovered.partial,false);
  });

  test(`Main CS stays unknown when ${table} fails`,async()=>{
    const database=fixtureDatabase();
    database.failures.add(table);
    const data=await loadPhase28MainDashboard({db:database.db,now});
    assert.equal(data.customerService.summary.active,null);
    assert.equal(data.customerService.summary.unanswered,null);
    assert.equal(data.customerService.summary.claims,null);
    assert.equal(buildNavigationOperationSnapshot(data).badges.cs,null);
    assert.ok(data.dataHealth.issues.some(issue=>issue.dataset===table));
  });
}

test('a successful empty CS read remains a confirmed zero in Main and the shared badge',async()=>{
  const database=fixtureDatabase({});
  const [live,main]=await Promise.all([
    loadLiveNavigationOperationSnapshot({db:database.db,now}),
    loadPhase28MainDashboard({db:database.db,now})
  ]);
  assert.equal(live.partial,false);
  assert.equal(live.snapshot.badges.cs,0);
  assert.equal(main.customerService.summary.active,0);
  assert.equal(buildNavigationOperationSnapshot(main).badges.cs,0);
});

test('Main reads the extra CS sources within its budget when sales history crosses a month boundary',async()=>{
  const database=fixtureDatabase({});
  const data=await loadPhase28MainDashboard({db:database.db,now:'2026-09-01T06:00:00.000Z'});
  assert.equal(database.calls.length,37);
  assert.equal(data.loaderPerformance.remote_query_count,37);
  assert.ok(database.calls.length<=MAIN_REMOTE_QUERY_BUDGET,'the declared budget must include both new CS source reads');
});
