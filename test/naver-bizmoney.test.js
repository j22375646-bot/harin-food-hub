'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const bizmoney=require('../lib/naver/bizmoney.js');

test('official Naver Bizmoney charge, exhaust, period, and balance responses become daily evidence',()=>{
  const rows=bizmoney.normalizeBizmoneyDaily({
    charges:[
      {statDt:1788284400000,displayCd:10,displayName:'신용카드',newRefundableAmt:110000,newNonRefundableAmt:0},
      {statDt:1788284400000,displayCd:20,displayName:'무상 충전',newRefundableAmt:0,newNonRefundableAmt:5000}
    ],
    exhausts:[
      {settleDt:1788284400000,activityCd:0,campaignTp:2,prodInfoCd:'SHOPPING',useRefundableAmt:22000,useNonrefundableAmt:3000}
    ],
    periods:[
      {settleDt:1788284400000,addRefundableAmt:110000,addNonRefundableAmt:5000,useRefundableAmt:22000,useNonRefundableAmt:3000,refundableAmt:88000,nonRefundableAmt:2000,refundRefundableAmt:0,refundNonRefundableAmt:0,returnRefundableAmt:0}
    ],
    balance:{bizmoney:90000,budgetLock:false,refundLock:false}
  });

  assert.equal(rows.length,1);
  assert.equal(rows[0].date,'2026-09-02');
  assert.equal(rows[0].charged_purchased,110000);
  assert.equal(rows[0].charged_free,5000);
  assert.equal(rows[0].used_purchased,22000);
  assert.equal(rows[0].used_free,3000);
  assert.equal(rows[0].closing_balance,90000);
  assert.equal(rows[0].current_balance,90000);
  assert.equal(rows[0].charge_events,2);
  assert.equal(rows[0].deduction_events,1);
});

test('charge funding never becomes advertising spend when no deduction exists',()=>{
  const [row]=bizmoney.normalizeBizmoneyDaily({
    charges:[{statDt:'2026-09-02T00:00:00+09:00',newRefundableAmt:330000,newNonRefundableAmt:0}],
    periods:[{settleDt:'2026-09-02T00:00:00+09:00',refundableAmt:330000,nonRefundableAmt:0}]
  });
  assert.equal(row.charged_purchased,330000);
  assert.equal(row.used_purchased,null);
  assert.equal(bizmoney.advertisingUsed(row),null);
});

test('period rows backfill official daily use when exhaust detail is absent',()=>{
  const [row]=bizmoney.normalizeBizmoneyDaily({periods:[{
    settleDt:'2026-09-02',addRefundableAmt:0,addNonRefundableAmt:0,
    useRefundableAmt:9000,useNonRefundableAmt:1000,refundableAmt:41000,nonRefundableAmt:0
  }]});
  assert.equal(row.used_purchased,9000);
  assert.equal(row.used_free,1000);
  assert.equal(bizmoney.advertisingUsed(row),10000);
});

test('Naver exhaust history debit signs become positive advertising expense evidence',()=>{
  const [row]=bizmoney.normalizeBizmoneyDaily({
    exhausts:[
      {settleDt:'2026-09-02',useRefundableAmt:-22000,useNonrefundableAmt:0},
      {settleDt:'2026-09-02',useRefundableAmt:-3000,useNonrefundableAmt:0}
    ],
    periods:[{settleDt:'2026-09-02',useRefundableAmt:25000,useNonRefundableAmt:0,refundableAmt:-1200,nonRefundableAmt:0}]
  });
  assert.equal(row.used_purchased,25000);
  assert.equal(row.used_free,0);
  assert.equal(row.closing_balance,-1200);
  assert.equal(bizmoney.advertisingUsed(row),25000);
});

test('latest successful server-only raw snapshots rebuild Bizmoney evidence without exposing the raw payload',()=>{
  const rows=bizmoney.normalizeBizmoneyRawSnapshots([
    {endpoint:'/billing/bizmoney/histories/charge',http_status:200,created_at:'2026-09-02T01:00:00Z',response_json:[{statDt:'2026-09-02',newRefundableAmt:110000,newNonRefundableAmt:0}]},
    {endpoint:'/billing/bizmoney/histories/exhaust',http_status:200,created_at:'2026-09-02T01:00:00Z',response_json:[{settleDt:'2026-09-02',useRefundableAmt:22000,useNonrefundableAmt:0}]},
    {endpoint:'/billing/bizmoney/histories/period',http_status:200,created_at:'2026-09-02T01:00:00Z',response_json:[{settleDt:'2026-09-02',refundableAmt:88000,nonRefundableAmt:0}]},
    {endpoint:'/billing/bizmoney',http_status:200,created_at:'2026-09-02T01:00:00Z',response_json:{bizmoney:88000}},
    {endpoint:'/billing/bizmoney',http_status:403,created_at:'2026-09-02T02:00:00Z',response_json:{message:'must not replace the last success'}}
  ]);
  assert.deepEqual(rows.map(row=>({date:row.date,charged:row.charged_purchased,used:row.used_purchased,balance:row.current_balance})),[
    {date:'2026-09-02',charged:110000,used:22000,balance:88000}
  ]);
  assert.equal(JSON.stringify(rows).includes('response_json'),false);
});

test('Bizmoney sync uses official read endpoints and the normalized table stays service-role only',()=>{
  const root=path.resolve(__dirname,'..');
  const sync=fs.readFileSync(path.join(root,'lib/naver/sync.js'),'utf8');
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260901195919_add_naver_bizmoney_daily.sql'),'utf8');
  for(const endpoint of ['/billing/bizmoney','/billing/bizmoney/histories/charge','/billing/bizmoney/histories/exhaust','/billing/bizmoney/histories/period'])assert.match(sync,new RegExp(endpoint.replaceAll('/','\\/')));
  assert.match(migration,/alter table public\.naver_bizmoney_daily enable row level security/i);
  assert.match(migration,/revoke all on table public\.naver_bizmoney_daily from anon, authenticated/i);
  assert.match(migration,/grant select, insert, update, delete on table public\.naver_bizmoney_daily to service_role/i);
});
