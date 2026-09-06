const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const auth=require('../lib/dashboard-auth.js');
const supabase=require('../lib/cafe24/supabase.js');
const adapter=require('../lib/ui/phase28-adapters/orders.js');
const readDatabase=require('./helpers/orders-audit-db.js');

test('a failed Naver source does not hide healthy Cafe24 pages',async()=>{
  const previousSecret=process.env.DASHBOARD_SESSION_SECRET;
  const getSupabase=supabase.getSupabase;
  process.env.DASHBOARD_SESSION_SECRET='test-only-orders-audit-secret';
  const db=readDatabase({cafe24_orders:[{order_id:'C1',order_date:new Date().toISOString(),payment_status:'PAID',paid_amount:10000}]},table=>table==='naver_commerce_orders'?{code:'TIMEOUT'}:null);
  supabase.getSupabase=()=>db;
  try{
    const route=await import(pathToFileURL(path.resolve(__dirname,'../app/api/orders/page/route.js')));
    const headers={cookie:`${auth.COOKIE_NAME}=${auth.createSessionToken()}`};
    const response=await route.GET(new Request('http://localhost/api/orders/page?platform=CAFE24',{headers}));
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.orders[0].externalOrderId,'C1');
    assert.equal(result.orderReadStates.find(channel=>channel.platform==='NAVER').status,'FAILED');
    const failedOnly=await route.GET(new Request('http://localhost/api/orders/page?platform=NAVER',{headers}));
    assert.equal(failedOnly.status,502);
  }finally{
    supabase.getSupabase=getSupabase;
    if(previousSecret===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=previousSecret;
  }
});

test('stored Naver rows do not replace dashboard reconnect state with invented connector readiness',async()=>{
  const previousSecret=process.env.DASHBOARD_SESSION_SECRET;
  const getSupabase=supabase.getSupabase;
  process.env.DASHBOARD_SESSION_SECRET='test-only-orders-audit-secret';
  const naverOrder={order_id:'N1',order_date:new Date().toISOString(),status:'PAYED',paid_amount:10000};
  const unified=require('../lib/orders/unified-orders.js');
  const initial=unified.buildUnifiedOrders({naverOrders:[naverOrder],channelConnections:[{platform:'NAVER',status:'RECONNECT_REQUIRED'}]});
  assert.equal(initial.channels.find(channel=>channel.platform==='NAVER').status,'RECONNECT_REQUIRED');
  supabase.getSupabase=()=>readDatabase({naver_commerce_orders:[naverOrder]});
  try{
    const route=await import(pathToFileURL(path.resolve(__dirname,'../app/api/orders/page/route.js')));
    const before=Date.now();
    const response=await route.GET(new Request('http://localhost/api/orders/page?platform=NAVER',{headers:{cookie:`${auth.COOKIE_NAME}=${auth.createSessionToken()}`}}));
    const result=await response.json();
    assert.equal(response.status,200);
    assert.equal(result.channels,undefined);
    assert.deepEqual(result.orderReadStates.find(channel=>channel.platform==='NAVER'),{platform:'NAVER',status:'READY',source:'STORED_ORDER_QUERY'});
    assert.ok(Date.parse(result.hero.asOf)>=before);
    assert.ok(Date.parse(result.hero.asOf)<=Date.now());
  }finally{
    supabase.getSupabase=getSupabase;
    if(previousSecret===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=previousSecret;
  }
});

test('fulfillment does not alias a legacy invoice when its sibling shipment is beyond row 1000',async()=>{
  const previousSecret=process.env.DASHBOARD_SESSION_SECRET;
  const getSupabase=supabase.getSupabase;
  process.env.DASHBOARD_SESSION_SECRET='test-only-orders-audit-secret';
  const rows=[{order_id:'ORDER-1',shipment_box_id:'BOX-A'},...Array.from({length:999},(_,i)=>({order_id:`OTHER-${i}`,shipment_box_id:`OTHER-BOX-${i}`})),{order_id:'ORDER-1',shipment_box_id:'BOX-B'}];
  const tables={coupang_orders:rows,coupang_operation_requests:[{id:'legacy-job',operation_type:'EPOST_LIVE_ISSUE',target_type:'HUB_ORDER',target_id:'HR-CP-C1484BA5',status:'PENDING',created_at:new Date().toISOString()}]};
  supabase.getSupabase=()=>readDatabase(tables);
  try{
    const route=await import(pathToFileURL(path.resolve(__dirname,'../app/api/shipping/fulfillment-status/route.js')));
    const request=()=>new Request('http://localhost/api/shipping/fulfillment-status',{headers:{cookie:`${auth.COOKIE_NAME}=${auth.createSessionToken()}`}});
    const response=await route.GET(request());
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.items.some(item=>item.hubOrderId==='HR-CP-C400D84E'),false);
    assert.ok(result.items.some(item=>item.hubOrderId==='HR-CP-C1484BA5'));
    supabase.getSupabase=()=>readDatabase(tables,(table,filters,start)=>table==='coupang_orders'&&start>=500?{code:'TIMEOUT'}:null);
    const incomplete=await route.GET(request());
    assert.equal(incomplete.status,502);
  }finally{
    supabase.getSupabase=getSupabase;
    if(previousSecret===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=previousSecret;
  }
});

test('authenticated pages stay bounded and two tabs converge after older event deletion',async()=>{
  const previousSecret=process.env.DASHBOARD_SESSION_SECRET;
  const getSupabase=supabase.getSupabase;
  process.env.DASHBOARD_SESSION_SECRET='test-only-orders-audit-secret';
  const date=new Date().toISOString();
  const events=[{id:'old-event',title:'old',context_label:'캘린더 이벤트',due_at:date,updated_at:'2026-09-01',status:'OPEN'},{id:'new-event',title:'new',context_label:'캘린더 이벤트',due_at:date,updated_at:'2026-09-07',status:'OPEN'}];
  const tables={hub_work_items:events,cafe24_orders:Array.from({length:221},(_,i)=>({order_id:`C-${i}`,order_date:date,payment_status:'PAID',paid_amount:10000,raw_data:{}}))};
  const db={from(table){
    let start=0,end=999;
    const query={then(resolve){return Promise.resolve({data:(tables[table]||[]).slice(start,end+1),error:null}).then(resolve);},range(a,b){start=a;end=b;return query;}};
    for(const method of ['select','order','eq','in','limit','neq','gte','lt','like'])query[method]=()=>query;
    return query;
  }};
  supabase.getSupabase=()=>db;
  try{
    const pageRoute=await import(pathToFileURL(path.resolve(__dirname,'../app/api/orders/page/route.js')));
    const revisionRoute=await import(pathToFileURL(path.resolve(__dirname,'../app/api/calendar/events/revision/route.js')));
    assert.equal((await pageRoute.GET(new Request('http://localhost/api/orders/page'))).status,401);
    const cookie=`${auth.COOKIE_NAME}=${auth.createSessionToken()}`;
    const request=url=>new Request(`http://localhost${url}`,{headers:{cookie}});
    const first=await (await pageRoute.GET(request('/api/orders/page?stage=ACTIVE'))).json();
    assert.equal(first.orders.length,20);
    assert.equal(first.total,221);
    const tabA=await (await revisionRoute.GET(request('/api/calendar/events/revision'))).json();
    const rendered=adapter.buildPhase28OrdersModel({calendarEntries:events}).giftAutomation.revision;
    assert.equal(tabA.revision,rendered);
    tables.hub_work_items=[events[1]];
    const tabB=await (await revisionRoute.GET(request('/api/calendar/events/revision'))).json();
    assert.notEqual(tabB.revision,tabA.revision);
    assert.equal(tabB.revision,adapter.buildPhase28OrdersModel({calendarEntries:tables.hub_work_items}).giftAutomation.revision);
    assert.equal((await pageRoute.GET(request(`/api/orders/page?stage=ACTIVE&offset=20&snapshot=${first.snapshot}`))).status,409);
    assert.equal((await revisionRoute.GET(new Request('http://localhost/api/calendar/events/revision'))).status,401);
  }finally{
    supabase.getSupabase=getSupabase;
    if(previousSecret===undefined)delete process.env.DASHBOARD_SESSION_SECRET;else process.env.DASHBOARD_SESSION_SECRET=previousSecret;
  }
});
