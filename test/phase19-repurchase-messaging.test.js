'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const solapi=require('../lib/messaging/solapi.js');
const repurchase=require('../lib/customers/repurchase-messaging.js');

test('SOLAPI readiness is server-only and writes stay locked by default',()=>{
  const config=solapi.configuration({SOLAPI_REPURCHASE_ENABLED:'true'});
  assert.equal(config.enabled,true);assert.equal(config.writeEnabled,false);assert.equal(config.configured,false);
  assert.ok(config.missing.includes('SOLAPI_API_SECRET'));
});

test('SOLAPI authorization signs date and salt without exposing the secret',()=>{
  const result=solapi.authorization({apiKey:'public-key',apiSecret:'very-secret',date:'2026-08-17T00:00:00.000Z',salt:'123456789012'});
  assert.match(result.header,/^HMAC-SHA256 apiKey=public-key, date=/);assert.doesNotMatch(result.header,/very-secret/);assert.match(result.header,/signature=[a-f0-9]{64}$/);
});

test('message size and published fallback cost distinguish SMS and LMS',()=>{
  assert.equal(solapi.messageType('짧은 안내'), 'SMS');assert.equal(solapi.messageType('가'.repeat(60)),'LMS');
  assert.deepEqual(solapi.estimateCost('가'.repeat(60),2),{type:'LMS',unitPrice:45,total:90,bytes:120});
});

test('repurchase candidates require history and never expose customer id',()=>{
  const orders=[
    {order_id:'a1',customer_id:'private-customer',order_date:'2026-01-01',payment_status:'PAID'},
    {order_id:'a2',customer_id:'private-customer',order_date:'2026-02-01',payment_status:'PAID'},
    {order_id:'a3',customer_id:'private-customer',order_date:'2026-03-04',payment_status:'PAID'}
  ];
  const items=orders.map(row=>({order_id:row.order_id,product_name:'작두콩차',quantity:1}));
  const result=repurchase.buildCandidates({orders,items,historyDays:120,asOf:new Date('2026-05-10'),secret:'signing-secret'});
  assert.equal(result.ready,true);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].audience,'DORMANT');
  assert.equal(JSON.stringify(result).includes('private-customer'),false);assert.match(result.candidates[0].recipientRef,/^[A-Za-z0-9_-]{32}$/);
});

test('migration locks raw PII campaign tables to service role',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','20260817143711_add_repurchase_message_campaigns.sql'),'utf8');
  assert.match(sql,/enable row level security/g);assert.match(sql,/revoke all on table public\.repurchase_message_campaigns from public,anon,authenticated/);
  assert.match(sql,/grant select,insert,update,delete on table public\.repurchase_message_campaigns to service_role/);
  assert.doesNotMatch(sql,/\b(phone|customer_id|address)\s+(text|varchar)/i);
});

test('owner route and UI enforce approval and explicit consent',()=>{
  const route=fs.readFileSync(path.join(__dirname,'..','app','api','retention','messages','route.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'..','app','repurchase-messaging-client.js'),'utf8');
  assert.match(route,/roleAtLeast\(session,'OWNER'\)/);assert.match(route,/consentConfirmed!==true\|\|body\.complianceConfirmed!==true/);assert.match(route,/current\.data\.status!=='APPROVED'/);
  assert.match(ui,/수신동의 원본/);assert.match(ui,/키 입력 대기/);assert.match(ui,/발송 잠금 · 0건/);
});
