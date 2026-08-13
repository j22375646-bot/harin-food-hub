'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const transfer=require('../lib/shipping/channel-transfer.js');
const operationQueue=require('../lib/coupang/operation-queue.js');

const secret='channel-transfer-test-secret';

function query(terminal,calls){
  const chain={};
  for(const method of ['select','eq','in','order','limit'])chain[method]=(...args)=>{calls.push([method,...args]);return chain;};
  chain.insert=value=>{calls.push(['insert',value]);return chain;};
  chain.update=value=>{calls.push(['update',value]);return chain;};
  chain.maybeSingle=async()=>terminal;
  chain.single=async()=>terminal;
  return chain;
}

test('실제 우체국 13자리만 채널 전송에 허용한다',()=>{
  assert.equal(transfer.postalTracking('1234567890123'),'1234567890123');
  assert.throws(()=>transfer.postalTracking('TESTREGINOAPI'),error=>error.code==='EPOST_TEST_TRACKING_BLOCKED');
  assert.throws(()=>transfer.postalTracking('12345'),error=>error.code==='EPOST_TRACKING_REQUIRED');
});

test('채널별 우체국 배송사 코드를 자동 적용한다',()=>{
  assert.equal(transfer.courierCode('COUPANG',''),'EPOST');
  assert.equal(transfer.courierCode('CAFE24',''),'00004');
});

test('Cafe24 송장 전송 기록은 송장번호를 평문으로 저장하지 않는다',async()=>{
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try{
    const calls=[];
    let count=0;
    const responses=[{data:null,error:null},{data:{id:'audit',status:'EXECUTING'},error:null}];
    const db={from:()=>query(responses[count++],calls)};
    const result=await transfer.beginCafe24Transfer(db,{
      hubOrderId:'HR-C24-ABCDEF12',externalOrderId:'20260814-000001',
      invoiceNumber:'1234567890123',deliveryCompanyCode:'00004'
    });
    assert.equal(result.request.id,'audit');
    const inserted=calls.find(([method])=>method==='insert')[1];
    assert.equal(JSON.stringify(inserted.payload).includes('1234567890123'),false);
    assert.equal(operationQueue.open(inserted.payload).invoiceNumber,'1234567890123');
  }finally{
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});

test('중단되어 오래된 Cafe24 전송은 새 우체국 접수 없이 같은 기록으로 복구한다',async()=>{
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try{
    const calls=[];
    let count=0;
    const stale={id:'audit',status:'EXECUTING',attempt_count:2,started_at:new Date(Date.now()-transfer.DIRECT_TRANSFER_TIMEOUT_MS-1000).toISOString()};
    const responses=[{data:stale,error:null},{data:{...stale,status:'EXECUTING',attempt_count:3},error:null}];
    const db={from:()=>query(responses[count++],calls)};
    const result=await transfer.beginCafe24Transfer(db,{
      hubOrderId:'HR-C24-ABCDEF12',externalOrderId:'20260814-000001',
      invoiceNumber:'1234567890123',deliveryCompanyCode:'00004'
    });
    assert.equal(result.retried,true);
    assert.equal(calls.find(([method])=>method==='update')[1].attempt_count,3);
    assert.equal(calls.some(([method])=>method==='insert'),false);
  }finally{
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});
