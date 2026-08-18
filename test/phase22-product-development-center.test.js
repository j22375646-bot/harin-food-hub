'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const projects=require('../lib/market-intelligence/projects.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('22-5 calculates a separate development stage for every selling product',()=>{
  const productA='11111111-1111-4111-8111-111111111111';
  const productB='22222222-2222-4222-8222-222222222222';
  const projectA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const projectB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const home=projects.buildProjectHome({
    products:[{id:productA,name:'상품 A',is_active:true},{id:productB,name:'상품 B',is_active:true}],
    projects:[
      {id:projectA,master_product_id:productA,project_name:'A 개발',status:'ACTIVE',active_version:3},
      {id:projectB,master_product_id:productB,project_name:'B 개발',status:'ACTIVE',active_version:1}
    ],
    plans:[
      {project_id:projectA,master_product_id:productA,ab_test_id:'test-a',report_generated_at:null},
      {project_id:projectB,master_product_id:productB,ab_test_id:null,report_generated_at:null}
    ]
  });
  const a=home.products.find(item=>item.id===productA);
  const b=home.products.find(item=>item.id===productB);
  assert.equal(a.development.key,'VALIDATING');
  assert.equal(a.development.experiments,1);
  assert.equal(b.development.key,'EXPERIMENT_READY');
  assert.equal(b.development.experiments,0);
  assert.equal(home.summary.experiments,1);
});

test('22-5 links experiments to the selected master product and project',()=>{
  const migration=read('supabase/migrations/20260818183729_link_ab_tests_to_products.sql');
  const service=read('lib/experiments/service.js');
  const api=read('app/api/experiments/route.js');
  const bridge=read('lib/market-intelligence/execution-bridge.js');
  assert.match(migration,/master_product_id uuid references public\.master_products/);
  assert.match(migration,/market_project_id uuid references public\.market_projects/);
  assert.match(migration,/ab_tests_master_product_created_idx/);
  assert.match(service,/testsQuery\.eq\('master_product_id',productId\)/);
  assert.match(service,/선택 상품과 상품개발 프로젝트가 일치하지 않습니다/);
  assert.match(api,/searchParams\.get\('master_product_id'\)/);
  assert.match(bridge,/master_product_id:loaded\.project\.master_product_id,market_project_id:loaded\.project\.id/);
});

test('22-5 presents the reusable center without a fixed pilot product',()=>{
  const home=read('app/market-intelligence/project-home.js');
  const lab=read('app/dashboard-client.js');
  const marketNav=routes.HUB_NAV.find(item=>item.id==='market');
  assert.equal(marketNav.label,'상품개발');
  assert.match(home,/상품별 개발 현황/);
  assert.match(home,/master_product_id=/);
  assert.doesNotMatch(home,/작수차|작두콩차/);
  assert.match(lab,/상품별 실험 보기/);
  assert.match(lab,/다른 상품의 결과는 섞지 않습니다/);
});
