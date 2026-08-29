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
