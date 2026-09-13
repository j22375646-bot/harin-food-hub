'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{projectVisual}=require('../order-visual.cjs');
for(const [status,type]of [['DUE_TODAY','SAME_DAY'],['SCHEDULED','SCHEDULED'],['OVERDUE','DELAYED']])test('waiting-for-carrier has '+status+' timing',()=>{const v=projectVisual({stage:'WAITING_FOR_CARRIER',orderedAt:'2026-09-10T10:00:00+09:00',shippingEstimate:{status,plannedShipDate:'2026-09-14',confidence:'READY'}});assert.equal(v?.timing?.type,type);});
