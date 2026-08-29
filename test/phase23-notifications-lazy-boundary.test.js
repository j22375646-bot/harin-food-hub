'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const dashboardPath='app/legacy-dashboard-client.js';
const notificationsPath='app/_reliability/harin-notification-center.js';
const read=file=>fs.readFileSync(file,'utf8');

test('23 hardening loads the notification center only for the notification route',()=>{
  const dashboard=read(dashboardPath);
  const notifications=read(notificationsPath);
  assert.match(dashboard,/const HarinNotificationCenter=dynamic\(\(\)=>import\('\.\/_reliability\/harin-notification-center\.js'\)/);
  assert.match(dashboard,/<HarinNotificationCenter reports=\{reports\} center=\{initialData\.collectionCenter\}/);
  assert.doesNotMatch(dashboard,/function NotificationCenter|notificationBulkSelectionBar|notifications-density-view/);
  assert.match(notifications,/export default function HarinNotificationCenter/);
  assert.match(notifications,/HarinReliabilityWorkbench mode="notifications"/);
  assert.match(notifications,/notificationBulkSelectionBar/);
  assert.match(notifications,/외부 이메일은 발송하지 않고 허브 안의 알림 상태만 바꿉니다/);
});

test('23 hardening keeps the shared dashboard source below the notification split budget',()=>{
  const bytes=Buffer.byteLength(read(dashboardPath));
  assert.ok(bytes<273000,`dashboard-client.js is ${bytes} bytes; expected less than 273000 bytes`);
});
