'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {keywordWorkbench}=require('../lib/analytics/keyword-workbench.js');
const {projectMarketing}=require('../desktop/marketing-contract.cjs');
const {buildNaverMarketing}=require('../lib/analytics/naver-marketing.js');
const scope={ready:true,campaigns:[{ncc_campaign_id:'c',name:'active'}],groups:[{ncc_adgroup_id:'g',ncc_campaign_id:'c'}],keywords:[{ncc_keyword_id:'k',ncc_adgroup_id:'g'}]};
const row=raw=>({ncc_keyword_id:'k',keyword:'작수차',campaign_type:'WEB_SITE',period_start:'2026-09-01',period_end:'2026-09-07',raw_data:raw});
test('keyword ratios use raw totals and zero denominators remain unknown',()=>{
 const w=keywordWorkbench({ready:true,total:1,rows:[row({data:[{impCnt:100,clkCnt:10,salesAmt:1000,ccnt:2,convAmt:4000},{impCnt:100,clkCnt:10,salesAmt:1000,ccnt:0,convAmt:0}]})]});
 assert.equal(w.rows[0].cost,2000);assert.equal(w.rows[0].roas,200);assert.equal(w.rows[0].cpa,1000);assert.equal(w.rows[0].cvr,10);
 const z=keywordWorkbench({ready:true,rows:[row({impCnt:0,clkCnt:0,salesAmt:0,ccnt:0,convAmt:0})]}).rows[0];assert.equal(z.cost,0);assert.equal(z.roas,null);assert.equal(z.cpc,null);
});
test('missing or malformed keyword source never falls back to normalized zero',()=>{for(const raw of [null,{},[],{data:[]},{salesAmt:true},{data:[{salesAmt:5},{}]}]){const w=keywordWorkbench({rows:[{...row(raw),cost:1000}]});assert.equal(w.rows[0].cost,null);}});
test('snapshot period selection never combines daily and weekly records',()=>{const w=keywordWorkbench({ready:true,rows:[row({}),{...row({}),period_start:'2026-09-07'},{...row({}),period_end:'2026-08-01'}]});assert.equal(w.rows.length,1);assert.equal(w.start,'2026-09-01');});
test('optional workbench and telegram contracts remain backward compatible and omit secrets',()=>{const m=buildNaverMarketing();assert.equal(projectMarketing(m).workbench,null);m.workbench=keywordWorkbench({ready:true,total:1,rows:[row({})]});m.telegram={configured:true,enabled:true,sendingEnabled:false,token:'PRIVATE',chatId:'PRIVATE'};const p=projectMarketing(m);assert.doesNotMatch(JSON.stringify(p),/PRIVATE|chatId|token/);m.telegram.sendingEnabled='true';assert.throws(()=>projectMarketing(m));});
test('loader scopes both dates, deterministic cost ordering, bounded rows and exact count',async()=>{
 const {loadKeywordWorkbench}=require('../lib/dashboard/keyword-workbench-loader.js');let count=0;const ops=[];
 const db={from(){const index=count++,q={};for(const method of ['select','order','limit','eq','in'])q[method]=(...args)=>{ops.push([index,method,...args]);return q;};q.then=(yes,no)=>Promise.resolve({data:index===0?[row({})]:[row({salesAmt:2})],count:256,error:null}).then(yes,no);return q;}};
 const w=await loadKeywordWorkbench(db,'KEYWORDS',scope);assert.equal(w.total,256);assert.equal(w.rows.length,1);assert.deepEqual(ops.filter(r=>r[1]==='eq'),[[1,'eq','period_start','2026-09-01'],[1,'eq','period_end','2026-09-07']]);assert.ok(ops.some(r=>r[1]==='limit'&&r[2]===200));
 assert.equal((await loadKeywordWorkbench({from:()=>{throw Error('SECRET');}})).status,'UNAVAILABLE');
});
test('search-term samples preserve missing conversions and capped samples cannot understate spend',async()=>{
 const {loadKeywordWorkbench}=require('../lib/dashboard/keyword-workbench-loader.js');
 for(const size of [1,5]){let index=0;const db={from(table){assert.equal(table,'naver_search_terms');const call=index++,q={};for(const m of ['select','eq','order','limit','in'])q[m]=()=>q;q.then=(yes,no)=>Promise.resolve({data:call===0?[row({})]:[{...row({samples:Array.from({length:size},()=>({impCnt:20,clkCnt:2,salesAmt:100}))}),id:'term-id',search_term:'티백'}],count:1}).then(yes,no);return q;}};const result=await loadKeywordWorkbench(db,'SEARCH_TERMS',scope);assert.equal(result.rows[0].name,'티백');assert.equal(result.rows[0].cost,size===1?100:null);assert.equal(result.rows[0].conversions,null);}
});
