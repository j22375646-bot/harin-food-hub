'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../lib/marketing/keyword-workbench-contract.js');

test('25-0 preserves every live Naver bid operation while keeping Coupang writes separate',()=>{
  const naver=contract.keywordWorkbenchContract({platform:'naver'});
  const coupang=contract.keywordWorkbenchContract({platform:'coupang'});

  assert.deepEqual(
    naver.features.filter(item=>item.status==='KEEP').map(item=>item.id),
    [
      'NAVER_DIRECT_BID','NAVER_SAFETY_RULES','NAVER_SCHEDULES','NAVER_EMERGENCY_PAUSE',
      'NAVER_LIVE_VERIFY','NAVER_BID_HISTORY','NAVER_RANK_TRENDS','NAVER_EXPORT_SEARCH',
      'BULK_SELECTION','PLATFORM_ISOLATION','PAGE_AI'
    ]
  );
  assert.equal(naver.writeMode,'NAVER_API_OWNER_CONFIRM');
  assert.equal(coupang.writeMode,'COUPANG_WING_MANUAL');
  assert.equal(coupang.features.some(item=>item.id==='NAVER_DIRECT_BID'),false);
  assert.equal(coupang.features.some(item=>item.id==='COUPANG_WING_WORKLIST'&&item.status==='KEEP'),true);
});

test('25-0 classifies the remaining manual parity work without adding owner-irrelevant account features',()=>{
  const naver=contract.keywordWorkbenchContract({platform:'naver'});
  const statuses=Object.fromEntries(naver.features.map(item=>[item.id,item.status]));

  assert.equal(statuses.GLOBAL_KEYWORD_FINDER,'ENHANCE');
  assert.equal(statuses.CONDITIONAL_BULK_EDIT,'ENHANCE');
  assert.equal(statuses.REGION_DEVICE_SCOPE,'ADD');
  assert.equal(statuses.SCHEDULE_HEATMAP_COOLDOWN,'ADD');
  assert.equal(statuses.MARKET_ESTIMATE_PANEL,'ADD');
  assert.equal(statuses.MULTI_USER,'EXCLUDE');
  assert.equal(statuses.MULTI_ACCOUNT,'EXCLUDE');
});

test('25-0 removes the repeated operations intro only when the owner shell already owns that context',()=>{
  assert.deepEqual(
    contract.keywordWorkbenchPresentation({ownerShellVisible:true}),
    {showOperationsContext:false,showOwnerShell:true,showLegacyToolsAsDisclosure:true}
  );
  assert.deepEqual(
    contract.keywordWorkbenchPresentation({ownerShellVisible:false}),
    {showOperationsContext:true,showOwnerShell:false,showLegacyToolsAsDisclosure:true}
  );
});

test('25-1 gives only the scoped Naver workbench three distinct responsive panes',()=>{
  const naver=contract.keywordWorkbenchLayout({platform:'naver',workspace:'registered',hasDetail:true});
  const diagnosis=contract.keywordWorkbenchLayout({platform:'naver',workspace:'diagnosis'});
  const history=contract.keywordWorkbenchLayout({platform:'naver',workspace:'history'});
  const coupang=contract.keywordWorkbenchLayout({platform:'coupang',workspace:'registered',hasDetail:true});

  assert.equal(naver.mode,'THREE_PANE');
  assert.deepEqual(naver.panes.map(item=>item.id),['scope','operations','inspector']);
  assert.equal(naver.scope.kind,'NAVER_CAMPAIGN_ADGROUP');
  assert.equal(naver.detailState,'SELECTED');
  assert.deepEqual(naver.mobile,{order:['scope','operations','inspector'],scopeDefaultOpen:false,inspector:'INLINE_AFTER_TABLE'});
  assert.equal(diagnosis.mode,'THREE_PANE');

  assert.equal(history.mode,'TABLE_INSPECTOR');
  assert.equal(history.scope,null);
  assert.deepEqual(history.panes.map(item=>item.id),['operations','inspector']);

  assert.equal(coupang.mode,'TABLE_INSPECTOR');
  assert.equal(coupang.scope,null);
  assert.deepEqual(coupang.panes.map(item=>item.id),['operations','inspector']);
});
