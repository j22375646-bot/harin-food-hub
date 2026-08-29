'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28MainModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

test('main adapter preserves missing money as blocked evidence',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{metrics:{current:null}}});
  assert.equal(model.metrics.current.status,'BLOCKED');
  assert.equal(model.metrics.current.value,null);
  assert.ok(model.metrics.current.reasons.includes('VALUE_MISSING'));
});

test('main adapter keeps a confirmed numeric zero',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{metrics:{current:0}}});
  assert.equal(model.metrics.current.status,'READY');
  assert.equal(model.metrics.current.value,0);
});

test('main adapter reuses server-owned schedules, decisions, channels, and growth signals',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-08-29T01:40:00.000Z',
    financialTrust:{status:'READY'},
    salesCommandCenter:{
      metrics:{target:85000000,current:60829400,forecast:72527360},
      likelihood:{code:'WATCH',label:'조금 더 필요',description:'현재 속도를 유지하세요.'},
      actions:[{id:'ship',title:'출고 2건 처리',view:'orders',platform:'ALL'}],
      channels:[{platform:'NAVER',status:'READY',label:'정상'}],
      products:{growth:[{key:'p1',name:'작두콩차',platform:'CAFE24',currentRevenue:1280000,growthRate:8.4}],risk:[]},
      cashflow:{status:'ESTIMATE',expectedBalance:12634200,description:'예상치'},
      daily:{total:3,exception_total:1,schedule:{items:[{id:'SHIP',time:'09:00–15:00',label:'오늘 출고 주문 처리',status:'NOW',view:'orders'}]}}
    }
  });

  assert.equal(model.hero.taskCount,3);
  assert.equal(model.schedule[0].id,'SHIP');
  assert.equal(model.decisions[0].view,'orders');
  assert.equal(model.channels[0].platform,'NAVER');
  assert.equal(model.growth[0].name,'작두콩차');
  assert.equal(model.metrics.balance.status,'PARTIAL');
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main']);
});
