'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{launchDesktop}=require('./launch.cjs');
const {buildWorkspaceInsightsSummary}=require('../../lib/tenancy/workspace-insights-summary.js');
(async()=>{
 const fixture={ok:true,...buildWorkspaceInsightsSummary({reports:[{id:'review',platform:'NAVER',report_type:'WEEKLY',title:'7일 검토 보고서',period_start:'2026-09-01',period_end:'2026-09-07',created_at:'2026-09-08T00:00:00Z',summary_json:{
  naver:{connected:true,revenue:0},keywords:{waste:[{keyword:'낭비어',cost:0,conversions:0}],growth:[{keyword:'성장어',cost:0,conversions:1}]},
  recommendations:[{title:'검색어 검토',reviewWindow:'7일 뒤 표본 확인',successMetric:'구매 수 유지',ownerQuestion:'상품 의도와 맞나요?'}]
 }}]})};
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session},fixture)=>{globalThis.reviewReads=0;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
   if(url.endsWith('/insights')){globalThis.reviewReads++;return Response.json(fixture);}
   if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
   return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
  };},fixture);
  await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));await page.locator('[data-route="insights"]').click();
  await page.locator('[data-insights-report="review"]').click();
  const body=await page.locator('#insights-detail-body').innerText();
  for(const text of ['낭비 후보 · 낭비어','성장 후보 · 성장어','광고비 0','7일 뒤 표본 확인','구매 수 유지','상품 의도와 맞나요?'])assert.ok(body.includes(text),text);
  assert.equal(await app.evaluate(()=>globalThis.reviewReads),1);
  console.log('PASS server projection → packaged transport → native keyword groups and seven-day review');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
