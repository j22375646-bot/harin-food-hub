'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {collectEcommerce,summarizeEcommerce,MEASUREMENT_VERSION}=require('../lib/google-owned-site/ecommerce.js');

const NOW=new Date('2026-09-07T00:00:00Z');
const PRIVATE_KEY=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const CONFIG={
  propertyId:'123456789',siteUrl:'https://Shop.Example/path',
  clientEmail:'reader@example.invalid',privateKey:PRIVATE_KEY
};

function eventResponse({rows=[],metadata={timeZone:'Asia/Seoul',currencyCode:'KRW'},metricHeaders}={}){
  return {
    dimensionHeaders:[{name:'eventName'}],
    metricHeaders:metricHeaders||[
      {name:'eventCount'},{name:'totalUsers'},{name:'grossPurchaseRevenue'},{name:'refundAmount'}
    ],
    rows,rowCount:rows.length,metadata
  };
}

function eventRow(eventName,eventCount,totalUsers,grossPurchaseRevenue='0',refundAmount='0'){
  return {
    dimensionValues:[{value:eventName}],
    metricValues:[eventCount,totalUsers,grossPurchaseRevenue,refundAmount].map(value=>({value}))
  };
}

function transactionResponse({rows=[],rowCount=rows.length,metadata={timeZone:'Asia/Seoul',currencyCode:'KRW'},truncated,dimensionHeaders}={}){
  return {
    dimensionHeaders:dimensionHeaders||[{name:'eventName'},{name:'transactionId'}],
    metricHeaders:[{name:'eventCount'}],rows,rowCount,metadata,
    ...(truncated===undefined?{}:{truncated})
  };
}

function transactionRow(eventName,transactionId,eventCount='1'){
  return {dimensionValues:[{value:eventName},{value:transactionId}],metricValues:[{value:eventCount}]};
}

function summary(events,transactions=transactionResponse()){
  return summarizeEcommerce({events,transactions,host:'shop.example',now:NOW});
}

test('stage observations preserve missing, explicit zero, header order, and relevant event money',()=>{
  const events=eventResponse({
    metricHeaders:[{name:'refundAmount'},{name:'eventCount'},{name:'grossPurchaseRevenue'},{name:'totalUsers'}],
    rows:[
      {dimensionValues:[{value:'관련 없는 한글 이벤트'}],metricValues:[{value:'999'},{value:'999'},{value:'999'},{value:'999'}]},
      {dimensionValues:[{value:'view_item'}],metricValues:[{value:'0'},{value:'0'},{value:'0'},{value:'0'}]},
      {dimensionValues:[{value:'purchase'}],metricValues:[{value:'4'},{value:'2'},{value:'60000'},{value:'1'}]},
      {dimensionValues:[{value:'refund'}],metricValues:[{value:'5000'},{value:'1'},{value:'90000'},{value:'1'}]}
    ]
  });
  const transactions=transactionResponse({rows:[
    transactionRow('purchase','order-a'),transactionRow('purchase','order-b'),transactionRow('refund','refund-a')
  ]});
  const report=summary(events,transactions);
  assert.equal(report.version,MEASUREMENT_VERSION);
  assert.deepEqual(report.stages.find(stage=>stage.eventName==='view_item'),{
    eventName:'view_item',label:'상품 상세 조회',eventCount:0,users:0,observed:true
  });
  assert.equal(report.stages.find(stage=>stage.eventName==='add_to_cart').eventCount,null);
  assert.deepEqual(report.money,{grossPurchaseRevenue:60000,refundAmount:5000});
  assert.equal(report.trackingVerification,'VERIFY_REQUIRED');
  assert.equal(report.status,'OBSERVED');
  assert.equal(report.notes.some(note=>note.includes('고유 사용자 퍼널')),true);
  assert.equal(report.notes.some(note=>note.includes('은행 매출')),true);
});

test('complete transaction coverage reports bounded candidates without exposing identifiers',()=>{
  const report=summary(
    eventResponse({rows:[eventRow('purchase','3','2','30000','0'),eventRow('refund','3','2','0','5000')]}),
    transactionResponse({
      dimensionHeaders:[{name:'transactionId'},{name:'eventName'}],
      rows:[
        {dimensionValues:[{value:'purchase-secret'},{value:'purchase'}],metricValues:[{value:'1'}]},
        {dimensionValues:[{value:''},{value:'purchase'}],metricValues:[{value:'1'}]},
        {dimensionValues:[{value:'purchase-secret'},{value:'purchase'}],metricValues:[{value:'1'}]},
        {dimensionValues:[{value:'refund-secret'},{value:'refund'}],metricValues:[{value:'1'}]},
        {dimensionValues:[{value:'(not set)'},{value:'refund'}],metricValues:[{value:'1'}]},
        {dimensionValues:[{value:'refund-secret'},{value:'refund'}],metricValues:[{value:'1'}]}
      ]
    })
  );
  assert.deepEqual(report.diagnostics,{
    missingPurchaseIdEvents:1,missingRefundIdEvents:1,duplicatePurchaseIds:1,repeatedRefundIds:1
  });
  const serialized=JSON.stringify(report);
  assert.doesNotMatch(serialized,/purchase-secret|refund-secret/);
  assert.equal(report.notes.some(note=>note.includes('부분 환불')),true);
});

test('missing, truncated, or aggregate-disagreeing transaction data cannot claim zero diagnostics',()=>{
  const events=eventResponse({rows:[eventRow('purchase','2','1','20000','0')]});
  for(const transactions of [null,transactionResponse({truncated:true}),transactionResponse()]){
    const report=summary(events,transactions);
    assert.equal(report.status,'PARTIAL');
    assert.equal(report.coverage.transactions,'PARTIAL');
    assert.deepEqual(report.diagnostics,{
      missingPurchaseIdEvents:null,missingRefundIdEvents:null,duplicatePurchaseIds:null,repeatedRefundIds:null
    });
  }
});

test('metadata quality, timezone, and currency mismatches make coverage partial',()=>{
  const events=eventResponse({
    rows:[eventRow('purchase','0','0','0','0')],
    metadata:{timeZone:'Asia/Seoul',currencyCode:'KRW',subjectToThresholding:true,dataLossFromOtherRow:true,samplingMetadatas:[{}]}
  });
  const transactions=transactionResponse({metadata:{timeZone:'UTC',currencyCode:'USD'}});
  const report=summary(events,transactions);
  assert.equal(report.status,'PARTIAL');
  assert.equal(report.coverage.events,'PARTIAL');
  assert.equal(report.coverage.transactions,'PARTIAL');
  assert.deepEqual(report.window,{startDate:'7daysAgo',endDate:'yesterday',timeZone:'Asia/Seoul'});
  assert.equal(report.currencyCode,'KRW');
  assert.equal(report.coverage.reasons.includes('EVENTS_THRESHOLDING'),true);
  assert.equal(report.coverage.reasons.includes('TRANSACTIONS_TIME_ZONE_MISMATCH'),true);
  assert.equal(report.coverage.reasons.includes('TRANSACTIONS_CURRENCY_MISMATCH'),true);
});

test('transaction thresholding, data loss, and sampling keep diagnostics unknown',()=>{
  const report=summary(
    eventResponse({rows:[eventRow('purchase','1','1','1000','0')]}),
    transactionResponse({
      rows:[transactionRow('purchase','transaction-private')],
      metadata:{
        timeZone:'Asia/Seoul',currencyCode:'KRW',subjectToThresholding:true,
        dataLossFromOtherRow:true,samplingMetadatas:[{}]
      }
    })
  );
  assert.equal(report.coverage.transactions,'PARTIAL');
  assert.equal(report.coverage.reasons.includes('TRANSACTIONS_THRESHOLDING'),true);
  assert.equal(report.coverage.reasons.includes('TRANSACTIONS_DATA_LOSS'),true);
  assert.equal(report.coverage.reasons.includes('TRANSACTIONS_SAMPLING'),true);
  assert.deepEqual(report.diagnostics,{
    missingPurchaseIdEvents:null,missingRefundIdEvents:null,duplicatePurchaseIds:null,repeatedRefundIds:null
  });
  assert.doesNotMatch(JSON.stringify(report),/transaction-private/);
});

test('restricted requested revenue metrics stay unknown even when GA4 supplies zero',()=>{
  const events=eventResponse({
    rows:[eventRow('purchase','1','1','0','0'),eventRow('refund','1','1','0','0')],
    metadata:{
      timeZone:'Asia/Seoul',currencyCode:'KRW',
      schemaRestrictionResponse:{activeMetricRestrictions:[
        {metricName:'grossPurchaseRevenue',restrictedMetricTypes:['REVENUE_DATA']},
        {metricName:'refundAmount',restrictedMetricTypes:['REVENUE_DATA']}
      ]}
    }
  });
  const transactions=transactionResponse({rows:[transactionRow('purchase','p'),transactionRow('refund','r')]});
  const report=summary(events,transactions);
  assert.equal(report.status,'PARTIAL');
  assert.deepEqual(report.money,{grossPurchaseRevenue:null,refundAmount:null});
  assert.equal(report.coverage.reasons.includes('EVENTS_REVENUE_METRICS_RESTRICTED'),true);
  assert.doesNotMatch(JSON.stringify(report),/restrictedMetricTypes|REVENUE_DATA/);
});

test('absent observations produce NO_DATA while missing timezone remains visible as PARTIAL',()=>{
  const noData=summary(eventResponse(),transactionResponse());
  assert.equal(noData.status,'NO_DATA');
  assert.equal(noData.stages.every(stage=>stage.observed===false&&stage.eventCount===null),true);
  const partial=summary(eventResponse({metadata:{currencyCode:'KRW'}}),transactionResponse({metadata:{currencyCode:'KRW'}}));
  assert.equal(partial.status,'PARTIAL');
  assert.equal(partial.window.timeZone,null);
});

test('ProtoJSON omitted empty rows and rowCount remain a valid observed empty report',()=>{
  const events=eventResponse();
  const transactions=transactionResponse();
  delete events.rows;delete events.rowCount;
  delete transactions.rows;delete transactions.rowCount;
  const report=summary(events,transactions);
  assert.equal(report.status,'NO_DATA');
  assert.equal(report.coverage.events,'COMPLETE');
  assert.equal(report.coverage.transactions,'COMPLETE');
  assert.deepEqual(report.diagnostics,{
    missingPurchaseIdEvents:0,missingRefundIdEvents:0,duplicatePurchaseIds:0,repeatedRefundIds:0
  });
});

test('null, nonfinite, negative, unsafe, and malformed numeric values are rejected instead of becoming zero',()=>{
  const invalidValues=[null,'','NaN','Infinity','-1','9007199254740992'];
  for(const value of invalidValues){
    assert.throws(()=>summary(eventResponse({rows:[eventRow('purchase',value,'1','0','0')]})),error=>error.code==='GA4_RESPONSE_INVALID');
  }
  assert.throws(()=>summary(eventResponse({rows:[eventRow('purchase','1','1','-0.01','0')]})),error=>error.code==='GA4_RESPONSE_INVALID');
  assert.throws(()=>summary({...eventResponse(),rowCount:2}),error=>error.code==='GA4_RESPONSE_INVALID');
  for(const value of [null,'-1','NaN','9007199254740992']){
    assert.throws(()=>summary(
      eventResponse({rows:[eventRow('purchase','1','1','0','0')]}),
      transactionResponse({rows:[transactionRow('purchase','private-id',value)]})
    ),error=>error.code==='GA4_RESPONSE_INVALID'&&!error.message.includes('private-id'));
  }
});

function jsonResponse(status,payload){
  return {ok:status>=200&&status<300,status,json:async()=>payload};
}

function apiFixture({events=eventResponse(),transactionPages=[transactionResponse()]}={}){
  const calls=[];
  let transactionIndex=0;
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('oauth2.googleapis.com')) return jsonResponse(200,{access_token:'token-secret'});
    const body=JSON.parse(options.body);
    if(body.dimensions.some(item=>item.name==='transactionId')){
      return jsonResponse(200,transactionPages[Math.min(transactionIndex++,transactionPages.length-1)]);
    }
    return jsonResponse(200,events);
  };
  return {calls,fetchImpl};
}

test('collection validates property, HTTPS hostname, URL credentials, and service credentials before HTTP',async()=>{
  const badConfigs=[
    {...CONFIG,propertyId:'G-ABC123'},
    {...CONFIG,siteUrl:'http://shop.example'},
    {...CONFIG,siteUrl:'https://user:pass@shop.example'},
    {...CONFIG,clientEmail:''},
    {...CONFIG,privateKey:''}
  ];
  for(const config of badConfigs){
    let calls=0;
    await assert.rejects(()=>collectEcommerce({config,fetchImpl:async()=>{calls+=1;},now:NOW}),error=>error.code==='GA4_CONFIG_INVALID');
    assert.equal(calls,0);
  }
});

test('collection uses one safe timeout signal, readonly token scope, exact host filter, bounded fields and limits',async()=>{
  const fixture=apiFixture();
  const report=await collectEcommerce({config:CONFIG,fetchImpl:fixture.fetchImpl,now:NOW});
  assert.equal(report.host,'shop.example');
  assert.equal(fixture.calls.length,3);
  const [tokenCall,eventCall,transactionCall]=fixture.calls;
  assert.equal(tokenCall.options.redirect,'error');
  assert.equal(tokenCall.options.cache,'no-store');
  assert.equal(tokenCall.options.signal,eventCall.options.signal);
  assert.equal(eventCall.options.signal,transactionCall.options.signal);
  assert.equal(eventCall.options.redirect,'error');
  assert.equal(eventCall.options.cache,'no-store');
  assert.equal(transactionCall.options.redirect,'error');
  assert.equal(transactionCall.options.cache,'no-store');
  const tokenBody=new URLSearchParams(tokenCall.options.body);
  const jwtPayload=JSON.parse(Buffer.from(tokenBody.get('assertion').split('.')[1],'base64url').toString());
  assert.equal(jwtPayload.scope,'https://www.googleapis.com/auth/analytics.readonly');
  const eventsBody=JSON.parse(eventCall.options.body);
  const transactionsBody=JSON.parse(transactionCall.options.body);
  assert.deepEqual(eventsBody.dateRanges,[{startDate:'7daysAgo',endDate:'yesterday'}]);
  assert.match(eventCall.url,/\/v1beta\/properties\/123456789:runReport$/);
  assert.deepEqual(eventsBody.dimensions,[{name:'eventName'}]);
  assert.deepEqual(eventsBody.metrics.map(item=>item.name),['eventCount','totalUsers','grossPurchaseRevenue','refundAmount']);
  assert.equal(eventsBody.keepEmptyRows,true);
  assert.equal(eventsBody.limit,'100');
  assert.equal(eventsBody.returnPropertyQuota,true);
  assert.deepEqual(eventsBody.dimensionFilter.andGroup.expressions[1].filter.inListFilter.values,
    ['view_item','add_to_cart','begin_checkout','add_payment_info','purchase','refund']);
  assert.deepEqual(transactionsBody.dimensions,[{name:'eventName'},{name:'transactionId'}]);
  assert.equal(transactionsBody.limit,'1000');
  assert.equal(transactionsBody.offset,'0');
  assert.deepEqual(transactionsBody.orderBys,[
    {dimension:{dimensionName:'eventName'}},{dimension:{dimensionName:'transactionId'}}
  ]);
  assert.deepEqual(transactionsBody.dimensionFilter.andGroup.expressions[1].filter.inListFilter.values,['purchase','refund']);
  for(const body of [eventsBody,transactionsBody]){
    const serialized=JSON.stringify(body);
    assert.match(serialized,/"fieldName":"hostName".*"matchType":"EXACT".*"value":"shop\.example".*"caseSensitive":false/);
    assert.match(serialized,/"fieldName":"eventName".*"inListFilter"/);
    assert.doesNotMatch(serialized,/userId|userPseudoId|pageLocation|fullPageUrl|queryString/i);
  }
});

test('provider status, malformed bodies, and aborts become generic safe errors',async()=>{
  for(const [status,code] of [[401,'GA4_AUTH_FAILED'],[429,'GA4_RATE_LIMITED'],[503,'GA4_PROVIDER_FAILED']]){
    let call=0;
    await assert.rejects(()=>collectEcommerce({config:CONFIG,now:NOW,fetchImpl:async()=>{
      call+=1;
      return call===1?jsonResponse(200,{access_token:'token-secret'}):jsonResponse(status,{error:{message:'raw provider body order-secret'}});
    }}),error=>{
      assert.equal(error.code,code);
      assert.doesNotMatch(`${error.message} ${JSON.stringify(error)}`,/raw provider body|order-secret|token-secret/);
      return true;
    });
  }
  await assert.rejects(()=>collectEcommerce({config:CONFIG,now:NOW,fetchImpl:async(url)=>{
    if(String(url).includes('oauth2')) return jsonResponse(200,{access_token:'token-secret'});
    return {ok:true,status:200,json:async()=>{throw new SyntaxError('raw malformed detail');}};
  }}),error=>error.code==='GA4_RESPONSE_INVALID'&&!error.message.includes('raw malformed'));
  await assert.rejects(()=>collectEcommerce({config:CONFIG,now:NOW,fetchImpl:async()=>{throw new DOMException('token-secret timeout','AbortError');}}),error=>error.code==='GA4_TIMEOUT'&&!error.message.includes('token-secret'));
  await assert.rejects(()=>collectEcommerce({config:CONFIG,now:NOW,fetchImpl:async()=>({
    ok:true,status:200,json:async()=>{throw new DOMException('token-body-secret timeout','AbortError');}
  })}),error=>error.code==='GA4_TIMEOUT'&&!error.message.includes('token-body-secret'));
});

test('transaction paging continues across offsets and detects repeated IDs across a page boundary',async()=>{
  const firstRows=Array.from({length:1000},(_,index)=>transactionRow('purchase',`id-${index}`));
  const secondRows=[{dimensionValues:[{value:'id-999'},{value:'purchase'}],metricValues:[{value:'1'}]}];
  const fixture=apiFixture({
    events:eventResponse({rows:[eventRow('purchase','1001','900','100000','0')]}),
    transactionPages:[
      transactionResponse({rows:firstRows,rowCount:1001}),
      transactionResponse({
        rows:secondRows,rowCount:1001,
        dimensionHeaders:[{name:'transactionId'},{name:'eventName'}]
      })
    ]
  });
  const report=await collectEcommerce({config:CONFIG,fetchImpl:fixture.fetchImpl,now:NOW});
  assert.equal(report.coverage.transactions,'COMPLETE');
  assert.equal(report.diagnostics.duplicatePurchaseIds,1);
  assert.deepEqual(fixture.calls.slice(2).map(call=>JSON.parse(call.options.body).offset),['0','1000']);
  assert.doesNotMatch(JSON.stringify(report),/id-999/);
});

test('transaction paging stops at 10000 rows and never reports complete diagnostics beyond the cap',async()=>{
  const pages=Array.from({length:10},(_,page)=>transactionResponse({
    rows:Array.from({length:1000},(_,index)=>transactionRow('purchase',`cap-${page}-${index}`)),
    rowCount:10001
  }));
  const fixture=apiFixture({
    events:eventResponse({rows:[eventRow('purchase','10000','9000','1','0')]}),transactionPages:pages
  });
  const report=await collectEcommerce({config:CONFIG,fetchImpl:fixture.fetchImpl,now:NOW});
  assert.equal(report.status,'PARTIAL');
  assert.equal(report.coverage.transactions,'PARTIAL');
  assert.equal(report.coverage.reasons.includes('TRANSACTIONS_TRUNCATED'),true);
  assert.equal(report.diagnostics.duplicatePurchaseIds,null);
  assert.deepEqual(fixture.calls.slice(2).map(call=>JSON.parse(call.options.body).offset),
    ['0','1000','2000','3000','4000','5000','6000','7000','8000','9000']);
});

test('repeated empty pages and row-count drift become partial instead of a false full success',async()=>{
  const emptyFixture=apiFixture({
    events:eventResponse({rows:[eventRow('purchase','1','1','1','0')]}),
    transactionPages:[transactionResponse({rows:[],rowCount:1}),transactionResponse({rows:[],rowCount:1})]
  });
  const emptyReport=await collectEcommerce({config:CONFIG,fetchImpl:emptyFixture.fetchImpl,now:NOW});
  assert.equal(emptyReport.coverage.transactions,'PARTIAL');
  assert.equal(emptyFixture.calls.length,4);

  const firstRows=Array.from({length:1000},(_,index)=>transactionRow('purchase',`drift-${index}`));
  const driftFixture=apiFixture({
    events:eventResponse({rows:[eventRow('purchase','1000','900','1','0')]}),
    transactionPages:[
      transactionResponse({rows:firstRows,rowCount:1001}),
      transactionResponse({rows:[transactionRow('purchase','last')],rowCount:1002})
    ]
  });
  const driftReport=await collectEcommerce({config:CONFIG,fetchImpl:driftFixture.fetchImpl,now:NOW});
  assert.equal(driftReport.coverage.transactions,'PARTIAL');
  assert.equal(driftReport.diagnostics.missingPurchaseIdEvents,null);
});
