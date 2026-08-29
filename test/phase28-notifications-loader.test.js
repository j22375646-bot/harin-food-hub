'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const snapshotModule=require('../lib/notifications/phase28-snapshot.js');
const notificationService=require('../lib/notifications/service.js');

function mockDb(result,calls){
  return {from(table){
    calls.push({method:'from',value:table});
    const query={
      select(value){calls.push({method:'select',value});return query;},
      order(value,options){calls.push({method:'order',value,options});return query;},
      limit(value){calls.push({method:'limit',value});return query;},
      then(resolve){return Promise.resolve(result).then(resolve);}
    };
    return query;
  }};
}

test('알림 경량 로더는 첫 화면에 알림 표본만 읽고 전달 이력과 설정을 요청하지 않는다',async()=>{
  const calls=[];
  const db=mockDb({data:[{id:'a1',status:'OPEN',title:'확인 필요'}],error:null},calls);
  const result=await snapshotModule.loadPhase28NotificationSnapshot({db,now:new Date('2026-08-29T06:00:00Z')});
  assert.equal(result.alerts.length,1);
  assert.equal(result.generatedAt,'2026-08-29T06:00:00.000Z');
  assert.deepEqual(calls.filter(call=>call.method==='from').map(call=>call.value),['alerts']);
  assert.equal(calls.some(call=>String(call.value).includes('notification_deliveries')),false);
  assert.equal(calls.some(call=>call.method==='limit'&&call.value>100),false);
});

test('알림 조회 실패는 빈 성공 목록으로 숨기지 않는다',async()=>{
  const db=mockDb({data:null,error:{message:'alerts unavailable'}},[]);
  await assert.rejects(()=>snapshotModule.loadPhase28NotificationSnapshot({db}),/alerts unavailable/);
});

test('외부 발송은 현재 숨김 시간이 남은 알림을 제외한다',()=>{
  const alerts=[
    {id:'open',status:'OPEN',snoozed_until:null},
    {id:'expired',status:'OPEN',snoozed_until:'2026-08-29T05:00:00Z'},
    {id:'hidden',status:'OPEN',snoozed_until:'2026-08-29T07:00:00Z'},
    {id:'resolved',status:'RESOLVED',snoozed_until:null}
  ];
  assert.deepEqual(notificationService.activeAlertsForDelivery(alerts,new Date('2026-08-29T06:00:00Z')).map(item=>item.id),['open','expired']);
});
