'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const navigation=require('../lib/ui/phase28-navigation.js');

test('V106 navigation exposes all 17 stable routes once',()=>{
  const model=navigation.buildPhase28Navigation({badges:{orders:2,cs:3}});
  assert.equal(model.groups.length,4);
  assert.equal(model.items.length,17);
  assert.equal(new Set(model.items.map(item=>item.href)).size,17);
  assert.deepEqual(model.mobilePrimary,['home','orders','cs','inventory']);
  assert.equal(model.items.find(item=>item.id==='orders').badge,2);
  assert.equal(model.items.find(item=>item.id==='home').badge,null);
});

test('저빈도 기록 페이지는 메뉴 클릭 전 자동으로 받지 않는다',()=>{
  const model=navigation.buildPhase28Navigation();
  const onDemandIds=['diagnoses','changes','validation','experiments','knowledge'];
  assert.deepEqual(
    model.items.filter(item=>item.prefetch===false).map(item=>item.id),
    onDemandIds
  );
  assert.equal(model.items.find(item=>item.id==='home').prefetch,null);
  assert.equal(model.items.find(item=>item.id==='orders').prefetch,null);
});

test('운영 배지가 없으면 회사 활력을 100점이나 0건으로 만들지 않는다',()=>{
  assert.deepEqual(navigation.buildPhase28Vitality(null),{
    known:false,
    attention:null,
    score:null,
    label:'확인 필요'
  });
  assert.deepEqual(navigation.buildPhase28Vitality({}),{
    known:false,
    attention:null,
    score:null,
    label:'확인 필요'
  });
  assert.deepEqual(navigation.buildPhase28Vitality({orders:2,cs:3}),{
    known:false,
    attention:null,
    score:null,
    label:'확인 필요'
  });
  assert.deepEqual(navigation.buildPhase28Vitality({orders:2,cs:3,inventory:0,notifications:0}),{
    known:true,
    attention:5,
    score:70,
    label:'집중 운영'
  });
  assert.deepEqual(navigation.buildPhase28Vitality({orders:0,cs:0,inventory:0,notifications:0}),{
    known:true,
    attention:0,
    score:100,
    label:'순항 중'
  });
});
