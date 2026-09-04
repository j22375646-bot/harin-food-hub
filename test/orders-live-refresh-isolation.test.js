'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const apiSafety=require('../lib/api/safety.js');
const supabase=require('../lib/cafe24/supabase.js');
const cafe24Config=require('../lib/cafe24/config.js');
const cafe24Sync=require('../lib/cafe24/sync.js');
const requestQueue=require('../lib/coupang/request-queue.js');
const operationQueue=require('../lib/coupang/operation-queue.js');
const reliability=require('../lib/operations/reliability-center.js');
const unifiedOrders=require('../lib/orders/unified-orders.js');

const routeUrl=pathToFileURL(path.join(__dirname,'..','app','api','orders','live-refresh','route.js')).href;

test('고정 IP 워커가 멈춰도 Cafe24 주문 수집은 성공하고 다른 채널만 분리한다',async()=>{
  const originals={
    isAuthorized:apiSafety.isAuthorized,
    getSupabase:supabase.getSupabase,
    getCafe24Config:cafe24Config.getConfig,
    syncOrdersRealtime:cafe24Sync.syncOrdersRealtime,
    queueRequest:requestQueue.queueRequest,
    queueOperation:operationQueue.queueOperation,
    loadReadiness:reliability.loadLiveRefreshWorkerReadiness,
    loadUnifiedOrders:unifiedOrders.loadUnifiedOrders
  };
  let cafe24Calls=0;
  let coupangQueueCalls=0;
  let naverQueueCalls=0;
  try{
    apiSafety.isAuthorized=()=>true;
    supabase.getSupabase=()=>({});
    cafe24Config.getConfig=()=>({});
    reliability.loadLiveRefreshWorkerReadiness=async()=>({
      ready:false,code:'FIXED_IP_WORKER_OFFLINE',lastSeenAt:'2026-09-03T00:25:48.720Z',silenceMinutes:1600
    });
    cafe24Sync.syncOrdersRealtime=async()=>{
      cafe24Calls+=1;
      return {status:'SUCCESS',finishedAt:'2026-09-04T04:00:00.000Z'};
    };
    requestQueue.queueRequest=async()=>{coupangQueueCalls+=1;return {request:{id:'coupang'}};};
    operationQueue.queueOperation=async()=>{naverQueueCalls+=1;return {request:{id:'naver'}};};
    unifiedOrders.loadUnifiedOrders=async()=>({summary:{},orders:[]});

    const route=await import(`${routeUrl}?offline=${Date.now()}`);
    const response=await route.POST(new Request('https://example.com/api/orders/live-refresh',{method:'POST'}));
    const body=await response.json();

    assert.equal(response.status,207);
    assert.equal(body.ok,true);
    assert.equal(body.partial,true);
    assert.equal(body.cafe24.status,'SUCCESS');
    assert.deepEqual(body.requests,{coupang:null,naver:null});
    assert.deepEqual(body.unavailablePlatforms,['NAVER','COUPANG']);
    assert.match(body.failures.join(' '),/고정 IP/);
    assert.equal(cafe24Calls,1);
    assert.equal(coupangQueueCalls,0);
    assert.equal(naverQueueCalls,0);

    supabase.getSupabase=()=>({
      from(table){
        const row=table==='coupang_sync_requests'
          ?{id:'11111111-1111-4111-8111-111111111111',status:'PENDING',requested_at:'2026-09-04T04:00:00.000Z'}
          :null;
        return {select(){return this;},eq(){return this;},single(){return Promise.resolve({data:row,error:null});}};
      }
    });
    const statusResponse=await route.GET(new Request('https://example.com/api/orders/live-refresh?coupangRequestId=11111111-1111-4111-8111-111111111111'));
    const statusBody=await statusResponse.json();
    assert.equal(statusResponse.status,207);
    assert.equal(statusBody.ok,true);
    assert.equal(statusBody.pending,false);
    assert.equal(statusBody.partial,true);
    assert.equal(statusBody.requests.coupang.status,'PENDING');
    assert.deepEqual(statusBody.unavailablePlatforms,['NAVER','COUPANG']);
    assert.match(statusBody.failures.join(' '),/고정 IP/);
  }finally{
    apiSafety.isAuthorized=originals.isAuthorized;
    supabase.getSupabase=originals.getSupabase;
    cafe24Config.getConfig=originals.getCafe24Config;
    cafe24Sync.syncOrdersRealtime=originals.syncOrdersRealtime;
    requestQueue.queueRequest=originals.queueRequest;
    operationQueue.queueOperation=originals.queueOperation;
    reliability.loadLiveRefreshWorkerReadiness=originals.loadReadiness;
    unifiedOrders.loadUnifiedOrders=originals.loadUnifiedOrders;
  }
});
