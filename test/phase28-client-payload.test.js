'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const payloadModule=require('../lib/ui/phase28-client-payload.js');

test('Phase 28 client payload keeps rendered models and drops raw operational rows',()=>{
  const generatedAt='2026-08-31T01:23:00.000Z';
  const payload=payloadModule.buildPhase28ClientPayload({
    dashboardData:{
      loadedView:'main',generatedAt,
      channelConnections:{channels:[
        {status:'READ_READY'},{status:'WRITE_READY'},{status:'READ_READY'}
      ]},
      alerts:[{status:'OPEN'}],
      unifiedOrders:{summary:{actionRequired:2}},
      customerService:{summary:{active:3}},
      unifiedInventory:{summary:{action_required:4}},
      orders:Array.from({length:500},(_,index)=>({id:index,raw_data:{large:'x'.repeat(100)}})),
      reports:Array.from({length:80},(_,index)=>({id:index,summary_json:{large:'x'.repeat(100)}})),
      aiPagePanels:{main:{status:'READY'},settlement:{status:'CHECK'}}
    },
    phase28Runtime:{routeId:'home'},
    phase28:{main:{title:'오늘'}},
    aiPanelKey:'main'
  });

  assert.deepEqual(Object.keys(payload).sort(),[
    'aiPagePanels','generatedAt','navigationSnapshot','phase28','phase28Runtime'
  ]);
  assert.deepEqual(payload.phase28,{main:{title:'오늘'}});
  assert.deepEqual(payload.aiPagePanels,{main:{status:'READY'}});
  assert.equal(payload.navigationSnapshot.badges.orders,2);
  assert.equal(payload.navigationSnapshot.badges.cs,3);
  assert.equal(payload.navigationSnapshot.badges.inventory,4);
  assert.equal(payload.navigationSnapshot.badges.notifications,1);
  assert.equal(payload.orders,undefined);
  assert.equal(payload.reports,undefined);
});

test('non-main route payload reuses the verified main navigation snapshot without inventing route counts',()=>{
  const generatedAt=new Date().toISOString();
  const verifiedMainSnapshot={
    version:1,
    source:'MAIN_OPERATION_SUMMARY',
    generatedAt,
    badges:{orders:2,cs:1,inventory:3,notifications:4},
    connection:{ready:3,total:3,label:'3개 채널 연결',tone:'ready'}
  };
  const payload=payloadModule.buildPhase28ClientPayload({
    dashboardData:{
      loadedView:'keyword',generatedAt,
      unifiedOrders:{summary:{actionRequired:99}},
      alerts:[]
    },
    phase28Runtime:{routeId:'keywords'},
    phase28:{keywords:{rows:[]}},
    aiPanelKey:'keyword',
    fallbackNavigationSnapshot:verifiedMainSnapshot
  });

  assert.deepEqual(payload.navigationSnapshot,verifiedMainSnapshot);
  assert.deepEqual(payload.aiPagePanels,{});
});
