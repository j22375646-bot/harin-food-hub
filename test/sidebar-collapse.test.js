'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

const sidebarCollapse=require('../lib/ui/sidebar-collapse.js');

test('a collapsed sidebar group click expands the rail and opens that group',()=>{
  assert.deepEqual(sidebarCollapse.resolveSidebarGroupAction({
    collapsed:true,
    groupId:'orders',
    expanded:false,
    hasQuery:false
  }),{
    collapsed:false,
    openGroup:'orders'
  });
});

test('an expanded sidebar preserves the existing accordion behavior',()=>{
  assert.deepEqual(sidebarCollapse.resolveSidebarGroupAction({
    collapsed:false,
    groupId:'orders',
    expanded:true,
    hasQuery:false
  }),{
    collapsed:false,
    openGroup:null
  });
  assert.deepEqual(sidebarCollapse.resolveSidebarGroupAction({
    collapsed:false,
    groupId:'orders',
    expanded:true,
    hasQuery:true
  }),{
    collapsed:false,
    openGroup:'orders'
  });
});

test('the root layout state exposes one stable desktop sidebar mode',()=>{
  assert.equal(sidebarCollapse.sidebarRootState(true),'collapsed');
  assert.equal(sidebarCollapse.sidebarRootState(false),'expanded');
});
