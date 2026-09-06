'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const load=async(...args)=>require('../lib/settlement/query.js').readLedgerPages(...args);
test('settlement queries read past the Supabase default 1000 row limit',async()=>{
 const source=Array.from({length:1201},(_,i)=>({key:`K${i}`}));
 const result=await load(()=>({range:async(from,to)=>({data:source.slice(from,to+1),count:1201,error:null})}),'key');
 assert.equal(result.error,null);assert.equal(result.data.length,1201);assert.equal(result.data.at(-1).key,'K1200');
});
test('a later page failure cannot publish a financially complete partial result',async()=>{
 const result=await load(()=>({range:async from=>from?{error:{code:'TIMEOUT'}}:{data:Array.from({length:500},(_,i)=>({key:String(i)})),count:501}}),'key');
 assert.equal(result.data,null);assert.equal(result.error.code,'TIMEOUT');
});
test('changing counts and duplicate keys stop the ledger snapshot',async()=>{
 for(const mode of ['count','key']){
  const result=await load(()=>({range:async from=>from?{data:[{key:'0'}],count:mode==='count'?502:501}:{data:Array.from({length:500},(_,i)=>({key:String(i)})),count:501}}),'key');
  assert.equal(result.data,null);assert.equal(result.error.code,'LEDGER_CHANGED');
 }
});
