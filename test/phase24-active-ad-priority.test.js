'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const naverWorkbench=require('../lib/marketing/naver-bid-workbench.js');
const keywordOperations=require('../lib/marketing/keyword-operations.js');

test('24-10 requests keywords from adgroups whose campaign and group are both running',()=>{
  const ids=naverWorkbench.activeAdgroupIds({
    campaigns:[
      {ncc_campaign_id:'cmp-live',status:'ELIGIBLE',user_lock:false},
      {ncc_campaign_id:'cmp-off',status:'PAUSED',user_lock:true}
    ],
    adgroups:[
      {ncc_adgroup_id:'grp-live',ncc_campaign_id:'cmp-live',status:'ELIGIBLE',user_lock:false},
      {ncc_adgroup_id:'grp-off',ncc_campaign_id:'cmp-live',status:'PAUSED',user_lock:false},
      {ncc_adgroup_id:'grp-parent-off',ncc_campaign_id:'cmp-off',status:'ELIGIBLE',user_lock:false}
    ]
  });

  assert.deepEqual(ids,['grp-live']);
});

test('24-10 merges running keyword rows first without duplicating the fallback catalog',()=>{
  const merged=naverWorkbench.mergeKeywordCatalog({
    activeKeywords:[
      {ncc_keyword_id:'kw-active-1',keyword:'운영 1'},
      {ncc_keyword_id:'kw-active-2',keyword:'운영 2'}
    ],
    fallbackKeywords:[
      {ncc_keyword_id:'kw-active-2',keyword:'중복 운영 2'},
      {ncc_keyword_id:'kw-off',keyword:'사용중지'}
    ]
  });

  assert.deepEqual(merged.map(item=>item.ncc_keyword_id),['kw-active-1','kw-active-2','kw-off']);
  assert.equal(merged[1].keyword,'운영 2');
});

test('24-10 keeps running ads ahead of stopped ads and offers explicit state filters',()=>{
  const rows=[
    {id:'off-high',keyword:'가 중지',platform:'NAVER',adCategoryState:'INACTIVE',cost:50000,clicks:10,orders:0,roas:null},
    {id:'live-low',keyword:'나 운영',platform:'NAVER',adCategoryState:'ACTIVE',cost:100,clicks:1,orders:0,roas:null},
    {id:'unknown',keyword:'다 확인',platform:'NAVER',adCategoryState:'UNKNOWN',cost:10000,clicks:5,orders:0,roas:null}
  ];

  assert.deepEqual(keywordOperations.filterKeywordRows(rows,{quickFilter:'ALL',sort:'COST_DESC'}).map(item=>item.id),['live-low','unknown','off-high']);
  assert.deepEqual(keywordOperations.filterKeywordRows(rows,{quickFilter:'ACTIVE_ADS',sort:'COST_DESC'}).map(item=>item.id),['live-low']);
  assert.deepEqual(keywordOperations.filterKeywordRows(rows,{quickFilter:'INACTIVE_ADS',sort:'COST_DESC'}).map(item=>item.id),['off-high']);
  assert.equal(keywordOperations.normalizeKeywordView('coupang',{quickFilter:'INACTIVE_ADS'}).quickFilter,'ALL');
});

test('24-10 exposes running and stopped views in the Naver workbench',()=>{
  const component=fs.readFileSync('app/_analysis/keyword-operations-table.js','utf8');
  const loader=fs.readFileSync('app/dashboard-route.js','utf8');
  assert.match(component,/운영 중 광고/);
  assert.match(component,/사용중지 광고/);
  assert.match(loader,/activeNaverAdgroupIds/);
  assert.match(loader,/\.in\('ncc_adgroup_id',activeNaverAdgroupIds\)/);
  assert.match(loader,/mergeKeywordCatalog/);
});
