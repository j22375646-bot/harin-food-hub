'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
const {buildWorkspaceSettlementSummary}=require('../../lib/tenancy/workspace-settlement-summary.js');
const payload={ok:true,...buildWorkspaceSettlementSummary({generatedAt:'2026-09-09T09:00:00Z',unifiedSettlement:{period_start:'2026-08-10T09:00:00Z',period_end:'2026-09-09T09:00:00Z',channels:[{platform:'CAFE24',gross_sales:0,actual_payout:0,status:'ACTUAL'},{platform:'NAVER',actual_payout:2000,payout_complete:false,status:'ACTUAL'}],waterfall:{actual_payout:2000,actual_payout_complete:false,expected_payout:null,variance:-100,comparable_channels:1},schedules:[{platform:'NAVER',date:'2026-09-10',amount:100,status:'정산예정',type:'일별 정산'}]}})};
payload.channels.find(channel=>channel.platform==='NAVER').asOf='2026-09-08T09:00:00Z';
(async()=>{const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});try{
 const page=await app.firstWindow();page.on('pageerror',error=>console.log('PAGE_ERROR',error.message));await page.waitForLoadState('domcontentloaded');
 assert.equal(await page.locator('[data-route="settlement"]').count(),1);
 await app.evaluate(({session},payload)=>{globalThis.settlementMode='ready';globalThis.settlementReads=0;session.fromPartition('persist:moaon-harin-readonly').fetch=async url=>{
  if(new URL(url).pathname.endsWith('/settlement')){globalThis.settlementReads++;const p=structuredClone(payload);p.period.days=Number(new URL(url).searchParams.get('days')||30);return globalThis.settlementMode==='ready'?Response.json(p):new Response('',{status:503});}
  if(url.endsWith('/api/moaon/businesses'))return Response.json({ok:true,businesses:[]});
  return Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false});
 };},payload);
 await page.evaluate(()=>runHubAction('disconnect'));await page.evaluate(()=>runHubAction('viewActive'));
 await page.locator('[data-route="settlement"]').click();await page.waitForFunction(()=>document.querySelector('#settlement-status').textContent.includes('부분'),{},{timeout:5000}).catch(async error=>{console.log(await page.evaluate(()=>({mode:displayMode,status:document.querySelector('#settlement-status').textContent,api:typeof window.moaonHub.readSettlement})));throw error;});
 assert.equal(await page.locator('#settlement-channels article').count(),4);assert.match(await page.locator('#settlement-summary').innerText(),/2,000원/);assert.match(await page.locator('#settlement-summary').innerText(),/확인 필요/);assert.match(await page.locator('#settlement-schedules').innerText(),/100원/);
 assert.match(await page.locator('#settlement-period').innerText(),/조회 시각/);
 assert.equal(await page.locator('#settlement-channels .settlement-asof').count(),4);
 assert.match(await page.locator('#settlement-channels .settlement-asof').first().innerText(),/자료 시각 확인 필요/);
 assert.match(await page.locator('#settlement-channels .settlement-asof').nth(1).innerText(),/자료 시각 2026.*9.*8/);
 await page.evaluate(()=>{showRoute('orders');showRoute('settlement');});assert.equal(await app.evaluate(()=>globalThis.settlementReads),1);
 for(const days of [7,90,30]){await page.locator('[data-settlement-days="'+days+'"]').click();await page.waitForFunction(days=>document.querySelector('#settlement-period').textContent.includes('최근 '+days+'일')&&document.querySelector('#settlement-page').getAttribute('aria-busy')==='false',days);assert.equal(await page.locator('[data-settlement-days="'+days+'"]').getAttribute('aria-pressed'),'true');}
 for(const width of [1040,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);for(const theme of ['light','dark']){await page.evaluate(theme=>applyTheme(theme),theme);await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#settlement-summary').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),true);}}
 await page.screenshot({path:path.resolve(__dirname,'../dist/p458c-settlement.png')});
 await app.evaluate(()=>globalThis.settlementMode='error');await page.locator('#settlement-refresh').click();await page.waitForFunction(()=>document.querySelector('#settlement-status').textContent.includes('실패'));assert.doesNotMatch(await page.locator('#settlement-summary').innerText(),/2,000원/);
 assert.doesNotMatch(await page.locator('#settlement-period').innerText(),/조회 시각/);
 await page.evaluate(()=>runHubAction('disconnect'));assert.doesNotMatch(await page.locator('#settlement-page').innerText(),/2,000원/);
 console.log('PASS settlement cards, partial/null, schedule, cooldown, error, logout, two widths/themes');
 }finally{await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
