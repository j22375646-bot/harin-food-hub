'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28DevelopmentModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

test('Phase 28 상품개발 어댑터는 판매상품별 프로젝트와 근거를 분리한다',()=>{
  const model=buildPhase28DevelopmentModel({
    products:[
      {id:'product-a',name:'상품 A',selling_price:12000,project:{id:'project-a',master_product_id:'product-a',project_name:'A 개발',active_version:3,status:'ACTIVE',href:'/market-intelligence/project-a/data'},development:{key:'VALIDATING',label:'실험 검증 중',progress:82,plans:2,experiments:1,reports:0}},
      {id:'product-b',name:'상품 B',selling_price:null,project:null,development:{key:'NOT_STARTED',label:'시작 전',progress:0,plans:0,experiments:0,reports:0}}
    ],
    projects:[
      {id:'project-a',master_product_id:'product-a',project_name:'A 개발',active_version:3,status:'ACTIVE',href:'/market-intelligence/project-a/data',development:{key:'VALIDATING',progress:82,plans:2,experiments:1,reports:0}},
      {id:'project-old',master_product_id:'product-a',project_name:'A 이전 기록',active_version:1,status:'ARCHIVED',href:'/market-intelligence/project-old/data',development:{key:'PREPARING',progress:22,plans:0,experiments:0,reports:0}}
    ],
    summary:{saleable_products:2,active_projects:1,versions:4,experiments:1,completed_products:0},
    generatedAt:'2026-08-29T03:00:00.000Z'
  });

  assert.equal(model.products.length,2);
  assert.equal(model.products[0].project.id,'project-a');
  assert.equal(model.products[1].project,null);
  assert.equal(model.products[1].priceLabel,'확인 필요');
  assert.deepEqual(model.projects.map(item=>item.masterProductId),['product-a','product-a']);
  assert.equal(model.policy.selectionCreatesProject,false);
  assert.equal(model.policy.missingAsZero,false);
  assert.equal(model.policy.projectIsolation,'master_product_id');
  assert.equal(model.stages.length,5);
  assert.deepEqual(model.stages.map(item=>item.label),['자료 준비','시장 분석','경쟁·전환 설계','A/B 실험','결과 학습']);
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses']);
});

test('Phase 28 상품개발 어댑터는 프로젝트가 없어도 추정 프로젝트를 만들지 않는다',()=>{
  const model=buildPhase28DevelopmentModel({products:[{id:'product-a',name:'상품 A',project:null,development:null}],projects:[],summary:{}});
  assert.equal(model.products[0].project,null);
  assert.equal(model.products[0].development.status,'NOT_STARTED');
  assert.equal(model.products[0].development.nextAction,'프로젝트 만들기');
  assert.equal(model.summary.projectCount,0);
});
