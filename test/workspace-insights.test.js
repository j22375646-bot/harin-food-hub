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
test('saved reports expose native bounded detail rebuilt from current NAVER owner insight fields',()=>{
 const current=row('new','2026-08-17',120);
 current.summary_json={
  ...current.summary_json,
  naver:{...current.summary_json.naver,connected:true,ad_spend:10,roas:800,confidence:{level:'HIGH'},top_campaigns:[{name:'Brand',category:'BRAND',cost:10,revenue:80,conversions:2,roas:800}]},
  operating_rule:{thresholds:{target_roas_percent:700}},data_coverage:{naver_ads:{status:'READY'}},comparison_guard:{safe:true},
  insights:[{level:'warning',title:'전환 위험',body:'구매 표본을 확인하세요.'}],
  keywords:{waste:[{keyword:'비효율어',cost:9,conversion_revenue:0,conversions:0,roas:0}],growth:[{keyword:'성장어',cost:2,conversion_revenue:30,conversions:1,roas:1500}]},
  recommendations:[{title:'검색어 점검',reason:'낭비 검색어를 확인합니다.',expected:'무전환 비용 감소'}],
  owner_brief:{snapshotVersion:'NAVER_WEEKLY_OWNER_V2',evidence:{formulaVersion:'NAVER-OWNER-DECISION-V3'},headline:'STORED_SECRET',private:'RAW_SECRET'}
 };
 const detail=summary({reports:[current]}).reports[0].detail;
 assert.equal(typeof detail.truncated,'boolean');assert.deepEqual(detail.sections.map(section=>section.title),['결정','위험','캠페인','키워드','행동','근거']);
 for(const section of detail.sections){assert.ok(section.items.length<=8);for(const item of section.items){assert.equal(typeof item.title,'string');assert.equal(typeof item.body,'string');assert.ok(item.title.length<=500);assert.ok(item.body.length<=500);}}
 assert.doesNotMatch(JSON.stringify(detail),/STORED_SECRET|RAW_SECRET|owner_brief|summary_json/);
 const section=title=>detail.sections.find(item=>item.title===title);
 assert.match(JSON.stringify(section('위험')),/전환 위험|구매 표본/);
 assert.deepEqual(section('캠페인').items,[{title:'Brand',body:'BRAND · 유지·확대 검토 · 광고비 10 · ROAS 800%'}]);
 assert.deepEqual(section('키워드').items,[{title:'낭비 후보 · 비효율어',body:'광고비 9 · 구매 0 · ROAS 0%'},{title:'성장 후보 · 성장어',body:'광고비 2 · 구매 1 · ROAS 1500%'}]);
});
test('keyword detail reserves space for growth even when waste candidate text is very long',()=>{
 const current=row('groups','2026-08-17',0);
 current.summary_json.keywords={waste:Array.from({length:8},()=>({keyword:'낭비'.repeat(500),cost:0,conversions:0,roas:0})),growth:[{keyword:'성장표본',cost:0,conversions:1,roas:100}]};
 const detail=summary({reports:[current]}).reports[0].detail;
 const items=detail.sections.find(section=>section.title==='키워드').items;
 assert.ok(items.some(item=>item.title.includes('낭비 후보')));
 assert.ok(items.some(item=>item.title.includes('성장 후보')&&item.title.includes('성장표본')));
 assert.match(items.find(item=>item.title.includes('성장표본')).body,/광고비 0/);
 assert.equal(detail.truncated,true);
});
test('action detail carries report review window and success metric without scheduling a write',()=>{
 const current=row('review','2026-08-17',100);
 current.summary_json.recommendations=[{title:'검색어 검토',reason:'표본 확인',reviewWindow:'7일 뒤 표본 확인',successMetric:'구매 수 유지',ownerQuestion:'상품 의도와 맞나요?',risk:'표본 부족'}];
 const action=summary({reports:[current]}).reports[0].detail.sections.find(section=>section.title==='행동').items[0];
 assert.match(action.body,/7일 뒤 표본 확인/);assert.match(action.body,/구매 수 유지/);assert.match(action.body,/상품 의도와 맞나요/);
});
test('a single overlong detail string discloses character truncation without exhausting the byte budget',()=>{
 const current=row('long-one','2026-08-17',120);current.summary_json.insights=[{level:'warning',title:'x'.repeat(501),body:'short'}];
 const detail=summary({reports:[current]}).reports[0].detail;
 assert.equal(detail.sections.find(section=>section.title==='위험').items[0].title.length,500);assert.equal(detail.truncated,true);
});
test('report detail discloses truncation and stays within its aggregate UTF-8 text budget',()=>{
 const current=row('large','2026-08-17',120),large='한'.repeat(900);
 current.summary_json={...current.summary_json,naver:{...current.summary_json.naver,connected:true,top_campaigns:Array.from({length:20},(_,index)=>({name:`${index}-${large}`,category:large}))},insights:Array.from({length:20},()=>({level:'warning',title:large,body:large})),recommendations:Array.from({length:20},()=>({title:large,reason:large})),keywords:{waste:Array.from({length:20},()=>({keyword:large})),growth:[]}};
 const detail=summary({reports:[current]}).reports[0].detail;
 const bytes=detail.sections.reduce((total,section)=>total+Buffer.byteLength(section.title)+section.items.reduce((sum,item)=>sum+Buffer.byteLength(item.title)+Buffer.byteLength(item.body),0),0);
 assert.equal(detail.truncated,true);assert.ok(bytes<=6000,`detail text used ${bytes} bytes`);assert.equal(detail.sections.length,6);
 assert.ok(detail.sections.find(section=>section.title==='행동').items.length>0);assert.ok(detail.sections.find(section=>section.title==='근거').items.length>0);
});
test('twenty maximally detailed reports remain below the endpoint response ceiling',()=>{
 const large='한'.repeat(900),reports=Array.from({length:20},(_,index)=>{const current=row(String(index),`2026-08-${String(20-index).padStart(2,'0')}`,120);current.summary_json={...current.summary_json,naver:{...current.summary_json.naver,connected:true,top_campaigns:Array.from({length:20},()=>({name:large,category:large}))},insights:Array.from({length:20},()=>({level:'warning',title:large,body:large})),recommendations:Array.from({length:20},()=>({title:large,reason:large})),keywords:{waste:Array.from({length:20},()=>({keyword:large}))}};return current;});
 const output=summary({reports});assert.equal(output.reports.length,20);assert.ok(Buffer.byteLength(JSON.stringify(output))<=262144);
});
test('mixed emoji detail strings satisfy the desktop UTF16 limit without splitting characters',()=>{
 const current=row('emoji','2026-08-17',120);current.summary_json.insights=[{level:'warning',title:'x'.repeat(400)+'😀'.repeat(100),body:'근거'}];
 const detail=summary({reports:[current]}).reports[0].detail,heading=detail.sections.find(section=>section.title==='위험').items[0].title;
 assert.equal(heading.length,500);assert.equal(heading.endsWith('😀'),true);assert.equal(detail.truncated,true);
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
