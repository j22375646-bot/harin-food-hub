'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { collectPaymentPeriod, collectRecentPaymentPeriod } = require('../lib/naver-commerce/payment-period.js');

function database() {
  const tables = { sync_logs:[], naver_commerce_orders:[], naver_commerce_order_items:[] };
  let failure = null;
  return {
    tables,
    fail(table) { failure = table; },
    from(table) {
      let operation = 'select', values, conflict, filters = [], limit = Infinity;
      const query = {
        select() { return this; },
        insert(value) { operation = 'insert'; values = value; return this; },
        update(value) { operation = 'update'; values = value; return this; },
        upsert(value, options) { operation = 'upsert'; values = value; conflict = options.onConflict; return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        order() { return this; },
        limit(value) { limit = value; return this; },
        single() { return this.then(result => ({...result, data:result.data?.[0]})); },
        async then(resolve, reject) {
          try {
            if (failure === table && operation === 'upsert') return resolve({error:new Error('storage failed')});
            let rows = tables[table].filter(row => filters.every(filter => filter(row)));
            if (operation === 'insert') { const row = {...values, id:`log-${tables[table].length + 1}`}; tables[table].push(row); rows = [row]; }
            if (operation === 'update') rows.forEach(row => Object.assign(row, structuredClone(values)));
            if (operation === 'upsert') for (const row of values) {
              const prior = tables[table].find(item => item[conflict] === row[conflict]);
              if (prior) Object.assign(prior, row); else tables[table].push({...row});
            }
            return resolve({data:structuredClone(rows.slice().reverse().slice(0, limit)), error:null});
          } catch (error) { reject?.(error); }
        },
      };
      return query;
    },
  };
}

function detail(id, paymentDate = '2026-09-01T15:00:00.000Z', orderId = `order-${id}`) {
  return {productOrderId:id, content:{
    order:{orderId, orderDate:paymentDate, paymentDate},
    productOrder:{productOrderId:id, productOrderStatus:'PAYED', productId:'product-1', quantity:1, totalPaymentAmount:12000},
  }};
}
const response = (contents = [], page = 1, hasNext = false, size = 300) => ({status:200, data:{traceId:'test-trace', data:{contents, pagination:{page,size,hasNext}}}});
const options = db => ({db, config:{}, periodStart:'2026-09-02', periodEnd:'2026-09-02', now:new Date('2026-09-03T00:00:00.000Z'), pause:async () => {}});

test('a closed KST payment day stores full details before certifying its period', async () => {
  const db = database();
  const queries = [];
  const result = await collectPaymentPeriod({...options(db), request:async (method, path, input) => {
    queries.push({method,path,query:input.query});
    return response([detail('item-1')]);
  }});
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(queries, [{method:'GET',path:'/v1/pay-order/seller/product-orders',query:{
    from:'2026-09-02T00:00:00.000+09:00', to:'2026-09-02T23:59:59.999+09:00',
    rangeType:'PAYED_DATETIME', pageSize:300, page:1, quantityClaimCompatibility:true,
  }}]);
  assert.equal(db.tables.naver_commerce_orders[0].payment_date, '2026-09-01T15:00:00.000Z');
  assert.equal(db.tables.naver_commerce_order_items[0].paid_amount, 12000);
  assert.equal(result.order_coverage.complete, true);
  assert.equal(result.order_coverage.period_start, '2026-09-02');
  assert.equal(result.order_coverage.closed, true);
  assert.equal(db.tables.sync_logs.at(-1).metadata.order_coverage.complete, true);
});

test('malformed, truncated, duplicated or incomplete detail pages never certify coverage', async t => {
  const invalid = [
    ['null payload', {status:200,data:null}],
    ['missing provider trace', {status:200,data:{data:{contents:[],pagination:{page:1,size:300,hasNext:false}}}}],
    ['missing pagination', {status:200,data:{data:{contents:[]}}}],
    ['string hasNext', response([],1,'false')],
    ['wrong page', response([],2)],
    ['truncated continuation', response([detail('item-1')],1,true)],
    ['empty continuation', response([],1,true)],
    ['missing content', response([{productOrderId:'item-1'}])],
    ['missing amount', response([{...detail('item-1'),content:{...detail('item-1').content,productOrder:{productOrderId:'item-1',productId:'p',quantity:1,productOrderStatus:'PAYED'}}}])],
    ['duplicate ids', response([detail('item-1'),detail('item-1')])],
    ['wrong KST day', response([detail('item-1','2026-09-01T14:59:59.999Z')])],
  ];
  for (const [name, payload] of invalid) await t.test(name, async () => {
    const db = database();
    const result = await collectPaymentPeriod({...options(db),request:async () => payload});
    assert.equal(result.status, 'FAILED');
    assert.equal(result.order_coverage.complete, false);
    assert.ok(result.failure.code);
    assert.equal(db.tables.sync_logs.at(-1).status, 'FAILED');
    assert.equal(db.tables.naver_commerce_order_items.length, 0);
  });
});

test('a final-page transport failure or detail persistence failure leaves no success certificate', async () => {
  const db = database();
  const result = await collectPaymentPeriod({...options(db),request:async (_method,_path,{query}) => {
    if (query.page === 2) throw new Error('last page unavailable');
    return response(Array.from({length:300},(_,i) => detail(`item-${i}`)),1,true);
  }});
  assert.equal(result.status,'FAILED');
  assert.equal(result.order_coverage.complete,false);
  assert.equal(db.tables.naver_commerce_orders.length,0);
  const failedDb = database(); failedDb.fail('naver_commerce_order_items');
  const stored = await collectPaymentPeriod({...options(failedDb),request:async () => response([detail('item-1')])});
  assert.equal(stored.status,'FAILED');
  assert.equal(stored.order_coverage.complete,false);
});

test('genuine zero orders certify a closed day, while an open or invalid financial period cannot', async () => {
  const db = database();
  const result = await collectPaymentPeriod({...options(db),request:async () => response()});
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.order_coverage.product_orders,0);
  for (const change of [
    {now:new Date('2026-09-02T14:59:59.999Z')},
    {periodStart:'2026-02-30'},
    {periodStart:'2026-09-04'},
    {periodStart:'2026-07-01'},
  ]) {
    await assert.rejects(collectPaymentPeriod({...options(database()),...change,request:async () => { throw new Error('must not call API'); }}),{code:'NAVER_PAYMENT_PERIOD_INVALID'});
  }
});

test('budget exhaustion checkpoints only persisted days and resumes overlapping rolling windows idempotently', async () => {
  const db = database();
  const calls = [];
  const request = async (_method,_path,{query}) => {
    const date = query.from.slice(0,10); calls.push(date);
    return response([detail(`item-${date}`,`${date}T01:00:00+09:00`)]);
  };
  const base = {...options(db),periodStart:'2026-09-01',maxPagesPerRun:1,request};
  const first = await collectPaymentPeriod(base);
  assert.equal(first.status,'IN_PROGRESS');
  assert.equal(first.order_coverage.complete,false);
  assert.equal(first.failure.code,'NAVER_PAYMENT_BUDGET_EXHAUSTED');
  assert.equal(db.tables.sync_logs.at(-1).metadata.payment_collection.windows.length,1);
  const second = await collectPaymentPeriod(base);
  assert.equal(second.status,'SUCCESS');
  assert.equal(second.order_coverage.product_orders,2);
  const repeated = await collectPaymentPeriod(base);
  assert.equal(repeated.status,'SUCCESS');
  assert.deepEqual(calls,['2026-09-01','2026-09-02']);
  assert.equal(db.tables.naver_commerce_order_items.length,2);
  const rolling = await collectPaymentPeriod({...base,periodStart:'2026-09-02',periodEnd:'2026-09-03',now:new Date('2026-09-04T00:00:00Z')});
  assert.equal(rolling.status,'IN_PROGRESS');
  const completed = await collectPaymentPeriod({...base,periodStart:'2026-09-02',periodEnd:'2026-09-03',now:new Date('2026-09-04T00:00:00Z')});
  assert.equal(completed.status,'SUCCESS');
  assert.equal(completed.order_coverage.product_orders,2);
  assert.equal(db.tables.naver_commerce_order_items.length,3);
});

test('changed-order-only successful logs cannot skip a payment-date query', async () => {
  const db = database();
  db.tables.sync_logs.push({id:'old',platform:'NAVER',job_type:'COMMERCE_SYNC',status:'SUCCESS',metadata:{counts:{orders:20}}});
  let queried = false;
  const result = await collectPaymentPeriod({...options(db),request:async () => { queried = true; return response(); }});
  assert.equal(queried,true);
  assert.equal(result.order_coverage.product_orders,0);
});

test('hourly collection ends at yesterday in KST and remains bounded across the month boundary', async () => {
  const db = database();
  const dates = [];
  const result = await collectRecentPaymentPeriod({...options(db),now:new Date('2026-08-31T15:00:00Z'),days:31,maxPagesPerRun:1,
    request:async (_method,_path,{query}) => { dates.push(query.from.slice(0,10)); return response(); }});
  assert.equal(result.status,'IN_PROGRESS');
  assert.equal(result.order_coverage.period_start,'2026-08-01');
  assert.equal(result.order_coverage.period_end,'2026-08-31');
  assert.deepEqual(dates,['2026-08-01']);
});

test('time budget expiration aborts the request and preserves resumable incomplete coverage', async () => {
  const db = database();
  const result = await collectPaymentPeriod({...options(db),maxDurationMs:1,
    request:async (_method,_path,{signal}) => {
      await new Promise(resolve => setTimeout(resolve,10));
      signal.throwIfAborted();
      return response();
    }});
  assert.equal(result.status,'IN_PROGRESS');
  assert.equal(result.order_coverage.complete,false);
  assert.equal(result.failure.code,'NAVER_PAYMENT_BUDGET_EXHAUSTED');
});

test('all terminal pages are stored once and sibling items aggregate into the full order', async () => {
  const db = database();
  const pages = [];
  const result = await collectPaymentPeriod({...options(db),request:async (_method,_path,{query}) => {
    pages.push(query.page);
    return query.page === 1
      ? response(Array.from({length:300},(_,i) => detail(`item-${i}`,'2026-09-01T15:00:00Z','one-order')),1,true)
      : response([detail('item-300','2026-09-02T14:59:59.999Z','one-order')],2,false);
  }});
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.order_coverage.product_orders,301);
  assert.equal(db.tables.naver_commerce_orders[0].paid_amount,3612000);
  assert.equal(db.tables.naver_commerce_order_items.length,301);
  assert.deepEqual(pages,[1,2]);
});

test('an unfinished day replays from its first page before certifying on a later larger budget', async () => {
  const db = database(), calls = [];
  const request = async (_method,_path,{query}) => {
    calls.push(query.page);
    return query.page === 1 ? response(Array.from({length:300},(_,i)=>detail(`item-${i}`)),1,true) : response([detail('last')],2);
  };
  const first = await collectPaymentPeriod({...options(db),maxPagesPerRun:1,request});
  assert.equal(first.status,'IN_PROGRESS');
  assert.equal(first.payment_collection.windows.length,0);
  assert.equal(db.tables.naver_commerce_order_items.length,0);
  const second = await collectPaymentPeriod({...options(db),maxPagesPerRun:2,request});
  assert.equal(second.status,'SUCCESS');
  assert.deepEqual(calls,[1,1,2]);
  assert.equal(db.tables.naver_commerce_order_items.length,301);
});

test('existing worker sync keeps zero-order stores schedulable while payment coverage is in progress', async t => {
  const client = require('../lib/naver-commerce/client.js');
  const sync = require('../lib/naver-commerce/sync.js');
  const db = database();
  t.mock.method(client,'getConfig',() => ({}));
  t.mock.method(client,'request',async (_method,path) => {
    if (path === '/v1/pay-order/seller/product-orders') return response(Array.from({length:300},(_,i)=>detail(`item-${i}`)),1,true);
    return {status:200,data:{contents:[],data:[]}};
  });
  const result = await sync.sync({db,now:new Date('2026-09-03T00:00:00Z'),days:1,paymentMaxPagesPerRun:1});
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.diagnostics.paymentPeriod.status,'IN_PROGRESS');
  const operational = db.tables.sync_logs.find(row=>row.job_type === 'COMMERCE_SYNC');
  assert.equal(operational.metadata.fixedIp,true);
  assert.equal(operational.status,'PARTIAL');
  assert.equal(operational.metadata.order_coverage,undefined);
});

test('noncanonical, blank and colliding identifiers never certify a smaller persisted dataset', async t => {
  const blankOrder = detail('item-1'); blankOrder.content.order.orderId = ' \t ';
  const blankProduct = detail('item-1'); blankProduct.content.productOrder.productId = ' ';
  const objectId = detail({id:'item-1'});
  const numberId = detail(123);
  for (const [name,rows] of [
    ['blank product-order ID',[detail(' \t ')]],
    ['blank order ID',[blankOrder]],
    ['blank product ID',[blankProduct]],
    ['object product-order ID',[objectId]],
    ['numeric product-order ID',[numberId]],
    ['trim-colliding product-order IDs',[detail('item-1'),detail(' item-1 ')]],
  ]) await t.test(name,async () => {
    const db = database();
    const result = await collectPaymentPeriod({...options(db),request:async () => response(rows)});
    assert.equal(result.status,'FAILED');
    assert.equal(result.order_coverage.complete,false);
    assert.equal(result.payment_collection.windows.length,0);
    assert.equal(db.tables.naver_commerce_order_items.length,0);
  });
});

test('canonical trimmed identifiers are shared by validation and persistence', async () => {
  const db = database(), row = detail(' item-1 ');
  row.content.productOrder.productOrderId = 'item-1';
  row.content.order.orderId = ' order-1 ';
  row.content.productOrder.productId = ' product-1 ';
  const result = await collectPaymentPeriod({...options(db),request:async () => response([row])});
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.order_coverage.product_orders,1);
  assert.equal(db.tables.naver_commerce_order_items[0].product_order_id,'item-1');
  assert.equal(db.tables.naver_commerce_order_items[0].order_id,'order-1');
  assert.equal(db.tables.naver_commerce_order_items[0].product_id,'product-1');
});
