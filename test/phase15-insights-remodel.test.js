'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('the current Naver pilot exposes weekly owner, saved, and accumulated workspaces while redirecting old addresses',()=>{
  const routes=read('lib/navigation/hub-routes.js');
  const page=read('app/insights/[workspace]/page.js');
  for(const route of ['/insights/overview','/insights/causes','/insights/saved','/insights/diagnostics'])assert.match(routes,new RegExp(route.replaceAll('/','\\/')));
  assert.doesNotMatch(routes,/id:'profitability'|id:'channels'/);
  assert.match(page,/workspace==='channels'\|\|workspace==='profitability'/);
  assert.match(page,/redirect\('\/insights\/overview'\)/);
});

test('phase 15-3 gives each insight route a dedicated decision desk',()=>{
  const workbench=read('app/_analysis/harin-analysis-workbench.js');
  for(const component of ['InsightOverviewDesk','InsightCauseDesk','InsightChannelDesk','InsightProfitabilityDesk'])assert.match(workbench,new RegExp(`function ${component}\\(`));
  assert.match(workbench,/workspace==='overview'.*InsightOverviewDesk/);
  assert.match(workbench,/workspace==='causes'.*InsightCauseDesk/);
  assert.match(workbench,/workspace==='channels'.*InsightChannelDesk/);
  assert.match(workbench,/workspace==='profitability'.*InsightProfitabilityDesk/);
  assert.match(workbench,/원가나 자료가 부족하면 0원이 아니라 판단 보류/);
});

test('phase 15-3 preserves legacy details progressively and keeps page AI independent',()=>{
  const workbench=read('app/_analysis/harin-analysis-workbench.js');
  const dashboard=read('app/legacy-dashboard-client.js');
  assert.match(workbench,/className="analysisDetailDisclosure"/);
  assert.match(workbench,/HarinPageAiRegion className="analysisAiSlot"/);
  assert.doesNotMatch(dashboard,/function ProfitabilitySnapshot/);
  assert.match(dashboard,/workspace==='overview'\?<DecisionOverview/);
});

test('phase 15-3 includes readable desktop and mobile insight layouts',()=>{
  const css=read('app/_analysis/harin-analysis-v8.css');
  for(const selector of ['.insightOverviewDesk','.insightCauseFlow','.insightChannelTable','.profitWaterfall','.analysisDetailDisclosure'])assert.match(css,new RegExp(selector.replace('.','\\.')));
  assert.match(css,/@media\(max-width:600px\).*insightCauseFlow/s);
  assert.match(css,/min-width:760px/);
});
