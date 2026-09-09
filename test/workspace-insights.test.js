'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveTenantContext}=require('../lib/tenancy/context.js');
const A='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',B='10000000-0000-4000-8000-000000000002';
const summary=data=>require('../lib/tenancy/workspace-insights-summary.js').buildWorkspaceInsightsSummary(data);
const row=(id,end,revenue)=>({id,platform:'NAVER',report_type:'WEEKLY',title:'Weekly',period_start:'2026-08-01',period_end:end,created_at:end+'T00:00:00Z',summary_json:{naver:{revenue,contribution_profit:10},financial_trust:{status:'READY'},private_secret:'NEVER_RETURN'}});
test('insights reuses NAVER weekly calculations and projects no private report body',()=>{
 const output=summary({generatedAt:'2026-09-09T00:00:00Z',reports:[row('old','2026-08-10',100),{...row('new','2026-08-17',120),period_start:'2026-08-11'},{...row('other','2026-08-20',900),platform:'COUPANG'}]});
 assert.equal(output.channel.revenue,120);assert.equal(output.channel.changeRate,20);assert.equal(output.channel.profit,10);assert.equal(output.channel.reportCount,2);
 assert.deepEqual(output.reports.map(r=>r.id),['new','old']);assert.doesNotMatch(JSON.stringify(output),/NEVER_RETURN|summary_json|other/);
 assert.ok(output.caveats.some(s=>s.includes('수집')));
});
test('dates normalize to ISO and displayed narratives remain within transport bounds',()=>{
 const current=row('new','2026-08-17',120);current.summary_json.insights=[{title:'a'.repeat(600),body:'b'.repeat(600)}];current.summary_json.recommendations=[{title:'c'.repeat(600),body:'d'.repeat(600)}];
 const output=summary({generatedAt:'2026-09-09',reports:[current]});
 assert.equal(output.generatedAt,'2026-09-09T00:00:00.000Z');assert.equal(output.channel.currentPeriod.end,'2026-08-17T00:00:00.000Z');assert.equal(output.reports[0].periodStart,'2026-08-01T00:00:00.000Z');
 for(const field of ['cause','causeNote','action','actionNote'])assert.equal(output.channel[field].length,500);
});
test('same and overlapping report periods never produce a comparison rate',()=>{
 for(const start of ['2026-08-01','2026-08-10']){
  const current={...row('new','2026-08-17',120),period_start:start};
  assert.equal(summary({reports:[current,row('old','2026-08-10',100)]}).channel.changeRate,null);
 }
 assert.equal(summary({reports:[row('new','2026-08-10',120),row('old','2026-08-10',100)]}).channel.changeRate,null);
});
test('unsafe comparison and untrusted profit stay unknown while known zero remains zero',()=>{
 const current=row('new','2026-08-17',0);current.summary_json.comparison_guard={safe:false};current.summary_json.financial_trust={status:'PARTIAL'};
 const output=summary({reports:[current,row('old','2026-08-10',100)]});
 assert.equal(output.channel.revenue,0);assert.equal(output.channel.changeRate,null);assert.equal(output.channel.profit,null);
 assert.equal(summary({reports:[]}).channel.revenue,null);
 delete current.summary_json.financial_trust;assert.equal(summary({reports:[current]}).channel.profit,null);
});
test('malformed insight data is rejected, not converted to a successful zero dataset',()=>{
 for(const reports of [null,{},[{...row('bad','2026-08-10',1),summary_json:'bad'}]])assert.throws(()=>summary({reports}));
 const bad=row('bad','2026-08-10',true);assert.equal(summary({reports:[bad]}).channel.revenue,null);
});
test('insights loader emits a single bounded channel-specific readonly query and fails closed',async()=>{
 const {loadWorkspaceInsights}=require('../lib/dashboard/workspace-insights-loader.js');
 let operations=[];const chain={};for(const name of ['select','eq','order','limit'])chain[name]=(...args)=>{operations.push([name,...args]);return chain;};
 let response={data:[row('one','2026-08-10',1)],error:null};chain.then=(resolve,reject)=>Promise.resolve(response).then(resolve,reject);
 const db={from:name=>{operations.push(['from',name]);return chain;}};
 const result=await loadWorkspaceInsights({db});assert.equal(result.reports.length,1);
 assert.deepEqual(operations.filter(r=>r[0]==='eq'),[['eq','platform','NAVER'],['eq','report_type','WEEKLY'],['eq','is_latest',true]]);
 assert.deepEqual(operations.filter(r=>r[0]==='limit'),[['limit',20]]);assert.equal(operations.filter(r=>r[0]==='from').length,1);
 response={data:null,error:{message:'SECRET_SQL'}};await assert.rejects(loadWorkspaceInsights({db}),/Insights unavailable/);
 response={data:null,error:null};await assert.rejects(loadWorkspaceInsights({db}));
});
test('invalid period suppresses comparison and invalid scoped profit is not coerced to money',()=>{
 const current=row('new','2026-08-17',120);current.period_start='bad';delete current.summary_json.naver.contribution_profit;current.summary_json.channel_profitability={NAVER:{contribution_profit:true}};
 const result=summary({reports:[current,row('old','2026-08-10',100)]});assert.equal(result.channel.changeRate,null);assert.equal(result.channel.profit,null);
});
const request=(id=A,query='')=>new Request('https://hub.example/api/moaon/businesses/'+id+'/insights'+query,{headers:{cookie:'harin_dashboard_session=abc.def'}});
const context=(id=A,role='OWNER',version=1)=>resolveTenantContext({session:{id:'session',userId:'user',expiresAt:'2099-01-01'},requestedTenantId:id},{now:()=>new Date(),findMembership:async()=>({tenantId:id,userId:'user',role,status:'ACTIVE',version})});
const create=options=>require('../lib/tenancy/workspace-insights-request.js').createWorkspaceInsightsRequest(options);
test('insights rejects wrong owner and every query before loading',async()=>{
 let loads=0;for(const [id,role] of [[B,'OWNER'],[A,'VIEWER'],[A,'OPERATOR']]){
  const response=await create({resolveContext:()=>context(id,role),readInsights:async()=>{loads++;return {reports:[]};}})(request(id));assert.equal(response.status,403);
 }
 const handle=create({resolveContext:()=>{loads++;return context();},readInsights:async()=>({reports:[]})});
 for(const req of [request(A,'?days=7'),request(A,'?channel=COUPANG'),new Request(request().url),new Request(request(),{method:'POST'})])assert.notEqual((await handle(req)).status,200);
 assert.equal(loads,0);
});
test('insights checks permission before and after reading and discards revoked data',async()=>{
 const order=[];const handle=create({resolveContext:()=>{order.push('auth');return context();},readInsights:async()=>{order.push('read');return {reports:[]};}});
 const response=await handle(request());assert.equal(response.status,200);assert.deepEqual(order,['auth','read','auth']);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.equal((await response.json()).ok,true);
 for(const role of ['VIEWER','OWNER']){let count=0;const revoked=await create({resolveContext:()=>++count===1?context():context(A,role,2),readInsights:async()=>({reports:[]})})(request());assert.equal(revoked.status,role==='OWNER'?409:403);}
});
test('insights deadline prevents late read and internal failures never leak',async()=>{
 let release,loads=0;const response=await create({timeoutMs:5,resolveContext:()=>new Promise(resolve=>release=resolve),readInsights:async()=>{loads++;return {reports:[]};}})(request());
 assert.equal(response.status,504);release(await context());await new Promise(setImmediate);assert.equal(loads,0);
 const failed=await create({resolveContext:()=>context(),readInsights:async()=>{throw Error('PRIVATE_SQL');}})(request());assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/PRIVATE_SQL/);
});
