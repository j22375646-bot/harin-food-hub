'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkMoaonControlConnection,safeCode}=require('../scripts/check-moaon-control-connection.js');
test('diagnostic is opt-in and never creates an adapter while disabled',async()=>{
 let calls=0;await assert.rejects(()=>checkMoaonControlConnection({env:{},createDatabase(){calls++;}}),error=>error.code==='DIAGNOSTIC_NOT_ENABLED');assert.equal(calls,0);
});
test('diagnostic performs one read-only summary query and closes the adapter',async()=>{
 let sql,closed=0,output;
 const database={async query(text,values){sql=text;assert.deepEqual(values,[]);return {rows:[{current_user:'moaon_control_app',session_user:'moaon_control_app',tenants:1,memberships:2,invitations:3}]};},async close(){closed++;}};
 await checkMoaonControlConnection({env:{MOAON_CONTROL_DB_DIAGNOSTIC:'1'},createDatabase(){return database;},write(value){output=JSON.parse(value);}});
 assert.match(sql,/current_user/);assert.match(sql,/moaon_control\.invitations/);assert.doesNotMatch(sql,/audit_events/i);assert.deepEqual(output.counts,{tenants:1,memberships:2,invitations:3});assert.equal(closed,1);
});
test('diagnostic errors expose only an allowlisted code and still close',async()=>{
 let closed=0;const database={async query(){throw Error('password=private');},async close(){closed++;}};
 await assert.rejects(()=>checkMoaonControlConnection({env:{MOAON_CONTROL_DB_DIAGNOSTIC:'1'},createDatabase(){return database;},write(){}}));assert.equal(closed,1);assert.equal(safeCode(Error('password=private')),'CONTROL_DATABASE_UNAVAILABLE');
});
