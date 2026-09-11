'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createKeywordBidOperations}=require('../lib/dashboard/keyword-bids.js');
const {loadActiveAdScope}=require('../lib/dashboard/active-ad-scope.js');
const {validBidInput,guardKeywordBids}=require('../lib/tenancy/keyword-bids-request.js');
const {valid,project}=require('../desktop/keyword-bids.cjs');
const kid='nkw-test',gid='grp-test',cid='cmp-test',rid='00000000-0000-4000-8000-000000000001';
const active={status:'ELIGIBLE',user_lock:false};
test('active scope excludes paused, locked, unknown and their descendants',async()=>{
 const rows={naver_campaigns:[{...active,ncc_campaign_id:'on'},{...active,ncc_campaign_id:'off',user_lock:true},{ncc_campaign_id:'unknown',status:'ELIGIBLE'}],naver_adgroups:[{...active,ncc_adgroup_id:'g1',ncc_campaign_id:'on'},{...active,ncc_adgroup_id:'g2',ncc_campaign_id:'off'},{...active,ncc_adgroup_id:'g3',ncc_campaign_id:'on',status:'PAUSED'}],naver_keywords:[{...active,ncc_keyword_id:'k1',ncc_adgroup_id:'g1'},{...active,ncc_keyword_id:'k2',ncc_adgroup_id:'g2'},{...active,ncc_keyword_id:'k3',ncc_adgroup_id:'g1',user_lock:true}]};
 const db={from:t=>({select(){return this;},order(){return this;},range:async()=>({data:rows[t]})})};
 const s=await loadActiveAdScope(db);assert.deepEqual(s.campaigns.map(x=>x.ncc_campaign_id),['on']);assert.deepEqual(s.groups.map(x=>x.ncc_adgroup_id),['g1']);assert.deepEqual(s.keywords.map(x=>x.ncc_keyword_id),['k1']);
 assert.equal((await loadActiveAdScope({from(){throw Error('secret');}})).ready,false);
});
function setup(){
 const scope={ready:true,campaigns:[{...active,ncc_campaign_id:cid}],groups:[{...active,ncc_adgroup_id:gid,ncc_campaign_id:cid}],keywords:[{...active,ncc_keyword_id:kid,ncc_adgroup_id:gid,keyword:'차',bid_amount:1000}]};
 const state={scope,bid:1000,enabled:true,groupBid:false,locked:false,changed:0,created:0,checked:0,saved:null};
 const api={request:async(method,path)=>({data:path.includes('/campaigns/')?{nccCampaignId:cid,status:'ELIGIBLE',userLock:state.locked}:{nccAdgroupId:gid,nccCampaignId:cid,status:'ELIGIBLE',userLock:false}})};
 const live={...require('../lib/naver/bid-execution.js'),configuration:()=>({write_enabled:state.enabled}),fetchKeyword:async()=>({nccKeywordId:kid,nccAdgroupId:gid,bidAmt:state.bid,status:'ELIGIBLE',userLock:false,useGroupBidAmt:state.groupBid,raw:{userLock:false}})};
 const db={from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:state.saved})})};
 const changes={createNaverBidPreview:async(s,b,{actor})=>{state.created++;state.saved={id:rid,status:'PREVIEWED',change_type:'NAVER_BID',target_key:kid,requested_by:actor,before_value:{values:{bid_amount:s.current_bid}},proposed_value:{values:{bid_amount:b}}};return {request:state.saved};},confirmAndExecute:async()=>{state.changed++;state.saved.status='VERIFIED';return {request:state.saved};}};
 const operate=createKeywordBidOperations({db,api,live,changes,loadScope:async()=>state.scope}),options={actor:'owner-a',check:async()=>{state.checked++;}};
 return {state,operate,options};
}
const preview={action:'PREVIEW',keywordId:kid,currentBid:1000,bid:900,key:'abcdefghijklmnop'};
test('read current, preview, explicit execution and verification reuse without duplicate writes',async()=>{const {state,operate,options}=setup();const r=await operate({action:'READ',keywordId:kid},options);assert.equal(r.currentBid,1000);assert.equal(r.maxBid,1000);assert.equal(r.mode,'DIRECT_LOWER_ONLY');assert.equal(state.created,0);await operate(preview,options);assert.equal(state.changed,0);const e=await operate({action:'EXECUTE',requestId:rid,confirm:true},options);assert.equal(e.state,'VERIFIED');await operate({action:'EXECUTE',requestId:rid,confirm:true},options);assert.equal(state.changed,1);});
test('stale current price and unsupported increases cannot create a proposal',async()=>{for(const kind of ['stale','raise']){const {state,operate,options}=setup();if(kind==='stale')state.bid=1100;await assert.rejects(operate({...preview,bid:kind==='raise'?1100:900},options));assert.equal(state.created,0);assert.equal(state.changed,0);}});
test('inactive campaigns, grouped bids and unknown scope block live operation',async()=>{for(const kind of ['lock','group','scope']){const {state,operate,options}=setup();if(kind==='lock')state.locked=true;if(kind==='group')state.groupBid=true;if(kind==='scope')state.scope.ready=false;await assert.rejects(operate({action:'READ',keywordId:kid},options));assert.equal(state.changed,0);}});
test('write switch and request ownership cannot be bypassed',async()=>{const {state,operate,options}=setup();await operate(preview,options);state.enabled=false;await assert.rejects(operate({action:'EXECUTE',requestId:rid},options),e=>e.code==='NAVER_BID_WRITE_DISABLED');state.enabled=true;await assert.rejects(operate({action:'EXECUTE',requestId:rid},{...options,actor:'other'}),e=>e.code==='BID_REQUEST_NOT_FOUND');assert.equal(state.changed,0);});
test('membership check failure stops before creating or executing changes',async()=>{const {state,operate}=setup();await assert.rejects(operate(preview,{actor:'owner-a',check:async()=>{throw Error('Revoked');}}));assert.equal(state.created,0);});
test('unknown execution status is read-only and cannot be blindly retried',async()=>{const {state,operate,options}=setup();await operate(preview,options);state.saved.status='EXECUTING';assert.equal((await operate({action:'STATUS',requestId:rid},options)).state,'EXECUTING');await assert.rejects(operate({action:'EXECUTE',requestId:rid},options));assert.equal(state.changed,0);});
test('desktop and server agree on exact payloads and explicit confirmation',()=>{for(const p of [{action:'READ',keywordId:kid},preview,{action:'EXECUTE',requestId:rid,confirm:true},{action:'STATUS',requestId:rid}]){assert.equal(valid(p),true);assert.equal(validBidInput(p),true);for(const bad of [{...p,extra:true},{...p,action:'PUT'}]){assert.equal(valid(bad),false);assert.equal(validBidInput(bad),false);}}assert.equal(valid({action:'EXECUTE',requestId:rid,confirm:false}),false);});
test('bid route rejects missing origin, foreign origin, cookies and GET',()=>{const url='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/keyword-bids';assert.equal(guardKeywordBids(new Request(url)).response.status,405);for(const origin of ['', 'https://evil.test'])assert.equal(guardKeywordBids(new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'}})).response.status,403);});
test('desktop projects only verified finite bid responses and rejects mismatched review amount',()=>{const r={ok:true,requestId:rid,state:'PREVIEWED',currentBid:1000,bid:900,writeEnabled:true,secret:'secret'};assert.doesNotMatch(JSON.stringify(project(r,preview)),/secret/);assert.throws(()=>project({...r,bid:910},preview));assert.throws(()=>project({...r,currentBid:NaN},preview));});
test('request handler binds Harin owner and rechecks membership before dispatch',async()=>{
 const {createKeywordBidsRequest}=require('../lib/tenancy/keyword-bids-request.js'),{resolveTenantContext}=require('../lib/tenancy/context.js');
 const tenant='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0',origin='https://harin-cafe24-sync.vercel.app';
 const context=(role='OWNER',version=1)=>resolveTenantContext({session:{id:'s',userId:'u',expiresAt:'2099-01-01'},requestedTenantId:tenant},{now:()=>new Date(),findMembership:async()=>({tenantId:tenant,userId:'u',role,status:'ACTIVE',version})});
 const request=()=>new Request(origin+'/api/moaon/businesses/'+tenant+'/keyword-bids',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'harin_dashboard_session=abc.def'},body:JSON.stringify({action:'READ',keywordId:kid})});
 let calls=0,reads=0;const operate=async()=>{calls++;return {};};
 assert.equal((await createKeywordBidsRequest({resolveContext:()=>context('VIEWER'),operate})(request())).status,403);assert.equal(calls,0);
 assert.equal((await createKeywordBidsRequest({resolveContext:()=>context('OWNER',++reads),operate})(request())).status,409);assert.equal(calls,0);
 assert.equal((await createKeywordBidsRequest({resolveContext:()=>context(),operate})(request())).status,200);assert.equal(calls,1);
});
