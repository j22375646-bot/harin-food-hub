'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const naverWorkbench=require('../lib/marketing/naver-bid-workbench.js');
const keywordOperations=require('../lib/marketing/keyword-operations.js');

const keyword=(id,adgroupId,name)=>({
  ncc_keyword_id:id,ncc_adgroup_id:adgroupId,keyword:name,bid_amount:300,status:'ELIGIBLE',user_lock:false
});

test('24-9 treats a stopped campaign or adgroup as unavailable for bid changes',()=>{
  const workbench=naverWorkbench.buildNaverBidWorkbench({
    keywords:[keyword('kw-live','grp-live','운영 키워드'),keyword('kw-group-off','grp-off','광고그룹 중지'),keyword('kw-campaign-off','grp-parent-off','캠페인 중지')],
    adgroups:[
      {ncc_adgroup_id:'grp-live',ncc_campaign_id:'cmp-live',name:'운영 광고그룹',status:'ELIGIBLE',user_lock:false},
      {ncc_adgroup_id:'grp-off',ncc_campaign_id:'cmp-live',name:'중지 광고그룹',status:'PAUSED',user_lock:true},
      {ncc_adgroup_id:'grp-parent-off',ncc_campaign_id:'cmp-off',name:'상위 중지 광고그룹',status:'ELIGIBLE',user_lock:false}
    ],
    campaigns:[
      {ncc_campaign_id:'cmp-live',name:'운영 캠페인',status:'ELIGIBLE',user_lock:false},
      {ncc_campaign_id:'cmp-off',name:'중지 캠페인',status:'PAUSED',user_lock:true}
    ],
    financialTrust:{allowed_cpc:false}
  });

  const byId=new Map(workbench.candidates.map(item=>[item.ncc_keyword_id,item]));
  assert.equal(byId.get('kw-live').ad_category_state,'ACTIVE');
  assert.equal(byId.get('kw-live').can_request_approval,true);
  assert.equal(byId.get('kw-group-off').ad_category_state,'INACTIVE');
  assert.equal(byId.get('kw-group-off').can_request_approval,false);
  assert.equal(byId.get('kw-campaign-off').ad_category_state,'INACTIVE');
  assert.equal(byId.get('kw-campaign-off').can_request_approval,false);
  assert.ok(byId.get('kw-group-off').reasons.some(item=>item.code==='ADGROUP_NOT_ELIGIBLE'));
  assert.ok(byId.get('kw-campaign-off').reasons.some(item=>item.code==='CAMPAIGN_NOT_ELIGIBLE'));
});

test('24-9 carries category state into campaign, adgroup, and keyword views',()=>{
  const rows=keywordOperations.naverRegisteredRows({candidates:[
    {ncc_keyword_id:'kw-live',ncc_campaign_id:'cmp-live',campaign_name:'운영 캠페인',campaign_status:'ELIGIBLE',campaign_user_lock:false,ncc_adgroup_id:'grp-live',adgroup_name:'운영 광고그룹',adgroup_status:'ELIGIBLE',adgroup_user_lock:false,keyword:'운영 키워드',status:'DIRECT_LOWER_ONLY',decision:'BLOCKED',can_request_approval:true,current_bid:300,metrics:{}},
    {ncc_keyword_id:'kw-off',ncc_campaign_id:'cmp-off',campaign_name:'중지 캠페인',campaign_status:'PAUSED',campaign_user_lock:true,ncc_adgroup_id:'grp-off',adgroup_name:'중지 광고그룹',adgroup_status:'ELIGIBLE',adgroup_user_lock:false,keyword:'중지 키워드',status:'BLOCKED',decision:'BLOCKED',can_request_approval:false,current_bid:300,metrics:{}}
  ]});
  const workspace=keywordOperations.buildNaverAdgroupWorkspace(rows);

  assert.equal(rows.find(item=>item.id==='NAVER:kw-off').adCategoryState,'INACTIVE');
  assert.deepEqual(workspace.campaigns.map(item=>[item.id,item.operationalState]),[['cmp-live','ACTIVE'],['cmp-off','INACTIVE']]);
  assert.deepEqual(workspace.adgroups.map(item=>[item.id,item.operationalState]),[['grp-live','ACTIVE'],['grp-off','INACTIVE']]);
  assert.deepEqual(keywordOperations.filterKeywordRows(rows,{quickFilter:'READY'}).map(item=>item.id),['NAVER:kw-live']);
});

test('24-9 renders a pastel use-stopped badge without hiding the category',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const css=fs.readFileSync('app/_analysis/harin-analysis-v8.css','utf8');

  assert.match(component,/adCategoryBadge/);
  assert.match(component,/사용중지/);
  assert.match(component,/disabled=\{row\.adCategoryState==='INACTIVE'\}/);
  assert.match(css,/\.adCategoryBadge\.inactive/);
});
