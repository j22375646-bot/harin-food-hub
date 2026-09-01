'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const queue = require('../lib/coupang/operation-queue.js');
const worker = require('../scripts/coupang-local-worker.js');

const secret = 'test-only-service-role-secret';

test('우체국 발급 작업은 실시간 신호를 놓쳐도 2초 안에 다시 확인한다', () => {
  assert.equal(worker.OPERATION_RECOVERY_INTERVAL_MS, 2 * 1000);
});

test('우체국 발급 복구 신호가 겹쳐도 작업 큐는 한 번만 비운다', async () => {
  let finish;
  let calls=0;
  const gate=new Promise(resolve=>{ finish=resolve; });
  const drain=worker.createSingleFlight(async () => {
    calls += 1;
    await gate;
    return calls;
  });

  const first=drain();
  const second=drain();
  assert.equal(first,second);
  assert.equal(calls,0);

  await Promise.resolve();
  assert.equal(calls,1);
  finish();
  assert.deepEqual(await Promise.all([first,second]),[1,1]);

  assert.equal(await drain(),2);
});

function chain(terminal, calls) {
  const query = {};
  for (const method of ['select','eq','in','order','limit','lt']) query[method] = (...args) => { calls.push([method,...args]); return query; };
  query.insert = value => { calls.push(['insert',value]); return query; };
  query.update = value => { calls.push(['update',value]); return query; };
  query.maybeSingle = async () => terminal;
  query.single = async () => terminal;
  return query;
}

test('배송정보와 CS 본문은 평문으로 저장하지 않고 인증 암호화한다', () => {
  const payload = { receiver:{ name:'고객', address:'서울' }, content:'문의 답변 원문' };
  const encrypted = queue.seal(payload, secret);
  assert.equal(JSON.stringify(encrypted).includes('문의 답변 원문'), false);
  assert.deepEqual(queue.open(encrypted, secret), payload);
  assert.throws(() => queue.open({ ...encrypted, data:`${encrypted.data}x` }, secret));
});

test('우체국 테스트 작업은 허브 주문번호만 대상으로 받고 평문 배송정보를 남기지 않는다', () => {
  assert.deepEqual(queue.validateRequest({operationType:'EPOST_TEST_ISSUE',targetType:'HUB_ORDER',targetId:'HR-C24-ABCDEF12'}),{operationType:'EPOST_TEST_ISSUE',targetType:'HUB_ORDER',targetId:'HR-C24-ABCDEF12'});
  assert.throws(()=>queue.validateRequest({operationType:'EPOST_TEST_ISSUE',targetType:'HUB_ORDER',targetId:'SAMPLE-1'}));
  const encrypted=queue.seal({testOnly:true,order:{receiver:{name:'고객',address:'서울'}}},secret);
  assert.equal(JSON.stringify(encrypted).includes('고객'),false);
});

test('같은 대상의 진행 중 작업은 중복 등록하지 않는다', async () => {
  const calls=[];
  const active={ id:'active',operation_type:'ORDER_DETAIL',target_type:'ORDER',target_id:'123',status:'RUNNING' };
  const db={ from:()=>chain({data:active,error:null},calls) };
  const result=await queue.queueOperation(db,{operationType:'ORDER_DETAIL',targetType:'ORDER',targetId:'123',payload:{shipmentBoxId:'123'}});
  assert.equal(result.existing,true);
  assert.equal(calls.some(([method])=>method==='insert'),false);
});

test('처리 기한이 지난 진행 중 작업은 새 주문 조회를 막지 않는다', async () => {
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try {
    const calls=[];
    const expired={
      id:'expired',operation_type:'ORDER_DETAIL',target_type:'ORDER',target_id:'123',status:'PENDING',
      created_at:'2026-08-26T23:00:00.000Z',expires_at:'2026-08-26T23:10:00.000Z'
    };
    const inserted={id:'new',operation_type:'ORDER_DETAIL',target_type:'ORDER',target_id:'123',status:'PENDING'};
    const responses=[
      {data:expired,error:null},
      {data:expired,error:null},
      {data:inserted,error:null},
    ];
    let tableCalls=0;
    const db={from:()=>chain(responses[tableCalls++],calls)};

    const result=await queue.queueOperation(db,{
      operationType:'ORDER_DETAIL',targetType:'ORDER',targetId:'123',
      now:new Date('2026-08-27T00:30:00.000Z')
    });

    assert.equal(result.existing,false);
    assert.equal(result.request.id,'new');
    const update=calls.find(([method])=>method==='update')?.[1];
    assert.equal(update?.status,'FAILED');
    assert.match(update?.error_message||'',/처리 기한/);
  } finally {
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});

test('새 작업은 PENDING 상태와 암호문만 저장한다', async () => {
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try {
    const calls=[];
    let tableCalls=0;
    const inserted={ id:'new',operation_type:'REPLY_ONLINE',target_type:'INQUIRY',target_id:'88',status:'PENDING' };
    const db={ from:()=>++tableCalls===1?chain({data:null,error:null},calls):chain({data:inserted,error:null},calls) };
    const result=await queue.queueOperation(db,{operationType:'REPLY_ONLINE',targetType:'INQUIRY',targetId:'88',payload:{content:'고객 답변'}});
    const values=calls.find(([method])=>method==='insert')[1];
    assert.equal(result.request.id,'new');
    assert.equal(values.status,'PENDING');
    assert.ok(new Date(values.expires_at).getTime()-Date.now()<=90*1000);
    assert.equal(JSON.stringify(values.payload).includes('고객 답변'),false);
    assert.equal(queue.open(values.payload).content,'고객 답변');
  } finally {
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});

test('처리 기한이 지난 변경 작업은 실행하지 않고 실패 처리한다', async () => {
  const calls=[];
  const query={
    update:value=>{calls.push(['update',value]);return query;},
    eq:(...args)=>{calls.push(['eq',...args]);return query;},
    lt:(...args)=>{calls.push(['lt',...args]);return Promise.resolve({error:null});}
  };
  await worker.expirePendingOperations({from:table=>{calls.push(['from',table]);return query;}});
  const update=calls.find(([method])=>method==='update')[1];
  assert.equal(update.status,'FAILED');
  assert.match(update.error_message,/실행하지 않았습니다/);
  assert.deepEqual(calls.find(([method])=>method==='eq').slice(1),['status','PENDING']);
  assert.equal(calls.find(([method])=>method==='lt')[1],'expires_at');
});

test('우체국 일시 통신 오류는 자동 재시도하고 취소된 주문 상세는 정상 종료한다', () => {
  const now=Date.parse('2026-08-23T00:00:00Z');
  const networkError=Object.assign(new Error('우체국 OpenAPI 통신 실패(ECONNRESET)'),{
    code:'EPOST_NETWORK_ERROR',retryable:true
  });
  const retry=worker.operationFailureDisposition({
    operation_type:'EPOST_LIVE_ISSUE',attempt_count:2
  },networkError,now);
  assert.equal(retry.status,'PENDING');
  assert.equal(retry.retry,true);
  assert.equal(retry.next_attempt_at,'2026-08-23T00:01:00.000Z');
  assert.equal(retry.dead_lettered_at,null);

  const maintenance=worker.operationFailureDisposition({
    operation_type:'EPOST_LIVE_ISSUE',attempt_count:20
  },Object.assign(new Error('우체국 전산시스템 점검 중'),{
    code:'EPOST_MAINTENANCE',retryable:true
  }),now);
  assert.equal(maintenance.status,'PENDING');
  assert.equal(maintenance.retry,true);
  assert.equal(maintenance.next_attempt_at,'2026-08-23T00:10:00.000Z');
  assert.equal(maintenance.dead_lettered_at,null);

  const cancelled=worker.operationFailureDisposition({
    operation_type:'ORDER_DETAIL',attempt_count:2
  },new Error('Coupang API 400: The order has been cancelled or returned.'),now);
  assert.equal(cancelled.status,'CANCELLED');
  assert.equal(cancelled.terminalExpected,true);
  assert.equal(cancelled.dead_lettered_at,null);
});

test('동시 등록 충돌 시 이미 생성된 진행 중 작업을 반환한다', async () => {
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try {
    const calls=[];
    let tableCalls=0;
    const active={ id:'winner',operation_type:'ORDER_DETAIL',target_type:'ORDER',target_id:'123',status:'PENDING' };
    const responses=[{data:null,error:null},{data:null,error:{code:'23505'}},{data:active,error:null}];
    const db={ from:()=>chain(responses[tableCalls++],calls) };
    const result=await queue.queueOperation(db,{operationType:'ORDER_DETAIL',targetType:'ORDER',targetId:'123'});
    assert.equal(result.existing,true);
    assert.equal(result.request.id,'winner');
  } finally {
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});

test('송장 전송 성공 기록은 중복 실행하지 않고 완료 결과를 재사용한다', async () => {
  const calls=[];
  let tableCalls=0;
  const completed={id:'done',operation_type:'UPLOAD_INVOICE',target_type:'ORDER',target_id:'123',status:'SUCCESS'};
  const responses=[{data:null,error:null},{data:completed,error:null}];
  const db={from:()=>chain(responses[tableCalls++],calls)};
  const result=await queue.queueOperation(db,{
    operationType:'UPLOAD_INVOICE',targetType:'ORDER',targetId:'123',
    idempotencyKey:'shipping:UPLOAD_INVOICE:123:1234567890123'
  });
  assert.equal(result.completed,true);
  assert.equal(result.request.id,'done');
  assert.equal(calls.some(([method])=>method==='insert'),false);
});

test('실패한 송장 전송은 같은 기록을 PENDING으로 되돌려 채널만 재시도한다', async () => {
  const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY=secret;
  try {
    const calls=[];
    let tableCalls=0;
    const failed={id:'failed',operation_type:'UPLOAD_INVOICE',target_type:'ORDER',target_id:'123',status:'FAILED'};
    const retried={...failed,status:'PENDING'};
    const responses=[{data:null,error:null},{data:failed,error:null},{data:retried,error:null}];
    const db={from:()=>{
      const query=chain(responses[tableCalls++],calls);
      query.update=value=>{calls.push(['update',value]);return query;};
      return query;
    }};
    const result=await queue.queueOperation(db,{
      operationType:'UPLOAD_INVOICE',targetType:'ORDER',targetId:'123',
      payload:{invoiceNumber:'1234567890123'},
      idempotencyKey:'shipping:UPLOAD_INVOICE:123:1234567890123'
    });
    assert.equal(result.retried,true);
    assert.equal(result.request.status,'PENDING');
    const update=calls.find(([method])=>method==='update')[1];
    assert.equal(update.status,'PENDING');
    assert.equal(queue.open(update.payload).invoiceNumber,'1234567890123');
  } finally {
    if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
  }
});

test('고정 IP 워커가 조회·주문·문의·반품교환 작업을 올바른 실행기로 보낸다', async () => {
  const calls=[];
  const handlers={
    getOrderDetail:async id=>{calls.push(['detail',id]);return {shipmentBoxId:id};},
    executeOrderAction:async (action,payload,options)=>{calls.push(['order',action,payload,options.audit.id]);return {done:true};},
    executeCsAction:async (action,payload,options)=>{calls.push(['cs',action,payload,options.audit.id]);return {done:true};},
    executeCaseAction:async (action,payload,options)=>{calls.push(['case',action,payload,options.audit.id]);return {done:true};}
  };
  const db={};
  await worker.dispatchOperation({id:'d',operation_type:'ORDER_DETAIL',target_type:'ORDER',target_id:'1'},{},handlers,db);
  await worker.dispatchOperation({id:'o',operation_type:'ACKNOWLEDGE',target_type:'ORDER',target_id:'2'},{shipmentBoxId:'2'},handlers,db);
  await worker.dispatchOperation({id:'c',operation_type:'REPLY_ONLINE',target_type:'INQUIRY',target_id:'3'},{inquiryId:'3'},handlers,db);
  await worker.dispatchOperation({id:'r',operation_type:'RETURN_RECEIVE',target_type:'RETURN',target_id:'4'},{receiptId:'4'},handlers,db);
  assert.deepEqual(calls.map(item=>item.slice(0,2)),[['detail','1'],['order','ACKNOWLEDGE'],['cs','REPLY_ONLINE'],['case','RETURN_RECEIVE']]);
});

test('운영 쿠팡 라우트는 실행기를 직접 호출하지 않고 작업 큐만 사용한다', () => {
  const root=path.resolve(__dirname,'..');
  const routes=['orders/detail/route.js','orders/action/route.js','cases/action/route.js','cs/action/route.js']
    .map(file=>fs.readFileSync(path.join(root,'app/api/coupang',file),'utf8')).join('\n');
  assert.match(routes,/queueOperation/);
  assert.doesNotMatch(routes,/executeOrderAction|executeCaseAction|executeCsAction|getOrderDetail/);
});
