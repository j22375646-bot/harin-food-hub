'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const naverWorkbench=require('../lib/marketing/naver-bid-workbench.js');
const keywordOperations=require('../lib/marketing/keyword-operations.js');

function keyword(id,adgroupId,name,bid=300){
  return {ncc_keyword_id:id,ncc_adgroup_id:adgroupId,keyword:name,bid_amount:bid,status:'ELIGIBLE',user_lock:false};
}

test('24-2 enriches every Naver bid candidate with its campaign and adgroup hierarchy',()=>{
  const workbench=naverWorkbench.buildNaverBidWorkbench({
    keywords:[keyword('kw-1','grp-1','작두콩차')],
    stats:[{ncc_keyword_id:'kw-1',period_start:'2026-08-01',period_end:'2026-08-22',clicks:10,cost:3000,conversions:1,conversion_revenue:12000}],
    adgroups:[{ncc_adgroup_id:'grp-1',ncc_campaign_id:'cmp-1',name:'작두콩 핵심 키워드',status:'ELIGIBLE',user_lock:false}],
    campaigns:[{ncc_campaign_id:'cmp-1',name:'작두콩 성장 캠페인',campaign_type:'WEB_SITE',status:'ELIGIBLE',user_lock:false}]
  });

  assert.equal(workbench.candidates[0].ncc_campaign_id,'cmp-1');
  assert.equal(workbench.candidates[0].campaign_name,'작두콩 성장 캠페인');
  assert.equal(workbench.candidates[0].campaign_type,'WEB_SITE');
  assert.equal(workbench.candidates[0].adgroup_name,'작두콩 핵심 키워드');
});

test('24-2 builds a Naver-only campaign and adgroup workspace with honest grouped metrics',()=>{
  const candidates=[
    {ncc_keyword_id:'kw-1',ncc_campaign_id:'cmp-1',campaign_name:'작두콩 성장',ncc_adgroup_id:'grp-1',adgroup_name:'핵심 구매어',keyword:'작두콩차',current_bid:300,status:'READY',decision:'KEEP',can_request_approval:true,metrics:{clicks:10,cost:3000,conversions:1,conversion_revenue:12000,roas:400}},
    {ncc_keyword_id:'kw-2',ncc_campaign_id:'cmp-1',campaign_name:'작두콩 성장',ncc_adgroup_id:'grp-2',adgroup_name:'정보 탐색어',keyword:'작두콩 효능',current_bid:250,status:'READY',decision:'LOWER',can_request_approval:true,metrics:{clicks:20,cost:5000,conversions:0,conversion_revenue:0,roas:0}},
    {ncc_keyword_id:'kw-3',ncc_campaign_id:'cmp-2',campaign_name:'레드비트 성장',ncc_adgroup_id:'grp-3',adgroup_name:'레드비트 구매어',keyword:'레드비트차',current_bid:280,status:'READY',decision:'KEEP',can_request_approval:true,metrics:{clicks:7,cost:2000,conversions:2,conversion_revenue:16000,roas:800}}
  ];
  const naverRows=keywordOperations.naverRegisteredRows({candidates});
  const coupangRows=keywordOperations.coupangKeywordRows({adKeywordTop:[{campaign_id:'cp-1',campaign_name:'쿠팡 캠페인',keyword:'쿠팡 키워드',ad_spend:9999,orders:1,revenue:10000}]});
  const workspace=keywordOperations.buildNaverAdgroupWorkspace([...naverRows,...coupangRows],{campaignId:'cmp-1',adgroupId:'grp-1'});

  assert.deepEqual(workspace.campaigns.map(item=>[item.id,item.name,item.keywordCount,item.adgroupCount,item.cost]),[
    ['cmp-1','작두콩 성장',2,2,8000],
    ['cmp-2','레드비트 성장',1,1,2000]
  ]);
  assert.deepEqual(workspace.adgroups.map(item=>[item.id,item.name,item.keywordCount,item.cost]),[
    ['grp-1','핵심 구매어',1,3000],
    ['grp-2','정보 탐색어',1,5000]
  ]);
  assert.deepEqual(workspace.filteredRows.map(item=>item.keyword),['작두콩차']);
  assert.deepEqual(workspace.summary,{campaigns:1,adgroups:1,keywords:1,clicks:10,cost:3000,orders:1,revenue:12000,roas:400});
  assert.equal(workspace.filteredRows.some(item=>item.platform==='COUPANG'),false);
});

test('24-2 keyword search understands both campaign and adgroup names',()=>{
  const rows=keywordOperations.naverRegisteredRows({candidates:[
    {ncc_keyword_id:'kw-1',ncc_campaign_id:'cmp-1',campaign_name:'작두콩 성장',ncc_adgroup_id:'grp-1',adgroup_name:'핵심 구매어',keyword:'일반 키워드',status:'BLOCKED',decision:'BLOCKED',metrics:{}}
  ]});
  assert.equal(keywordOperations.filterKeywordRows(rows,{query:'작두콩 성장'}).length,1);
  assert.equal(keywordOperations.filterKeywordRows(rows,{query:'핵심 구매어'}).length,1);
});
