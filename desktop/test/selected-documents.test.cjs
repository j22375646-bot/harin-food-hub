'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSelectedDocuments}=require('../selected-documents.cjs');
const orders=[{hubOrderId:'HR-NV-1234ABCD',platform:'NAVER',productName:' \t=SUM(1,2)',stage:'PAID',quantity:2,amount:null,details:{externalOrderId:'order"1'}}];
test('selected CSV uses native path, BOM, explicit unknown amount and neutralized quoted cells',async()=>{
 const writes=[];
 const service=createSelectedDocuments({dialog:{showSaveDialog:async()=>({filePath:'test.csv',canceled:false})},getParent:()=>({}),writeFile:async(...args)=>writes.push(args)});
 assert.deepEqual(await service.save({orders,validate:async()=>true}),{status:'CSV_SAVED',count:1});
 assert.equal(writes.length,1);assert.equal(writes[0][0],'test.csv');assert.equal(writes[0][1],'\uFEFF"허브 주문번호","채널","쇼핑몰 주문번호","단계","상품","수량","결제금액"\r\n"HR-NV-1234ABCD","네이버","order""1","결제완료","\' \t=SUM(1,2)","2","확인 필요"\r\n');assert.equal(writes[0][2].flag,'wx');
});
test('cancel and changed session after dialog never write; native errors hide paths',async()=>{
 for(const mode of ['cancel','changed','failure','exists']){
  let valid=true,writes=0;
  const service=createSelectedDocuments({dialog:{showSaveDialog:async()=>{if(mode==='changed')valid=false;return {filePath:'private/path.csv',canceled:mode==='cancel'};}},getParent:()=>({}),writeFile:async()=>{writes++;throw Object.assign(Error('private/path.csv'),{code:mode==='exists'?'EEXIST':'EACCES'});}});
  const result=await service.save({orders,validate:async()=>valid});
  assert.equal(result.status,{cancel:'SAVE_CANCELLED',changed:'DOCUMENT_CHANGED',failure:'SAVE_CHECK_REQUIRED',exists:'FILE_EXISTS'}[mode]);assert.equal(writes,['failure','exists'].includes(mode)?1:0);assert.equal(JSON.stringify(result).includes('private'),false);
 }
});
test('empty duplicate and malformed IDs never show save dialog; control formula variants are escaped',async()=>{
 const {renderSelectedCsv}=require('../selected-documents.cjs');
 for(const rows of [[],[orders[0],orders[0]],[{hubOrderId:'../all'}]])assert.throws(()=>renderSelectedCsv(rows));
 for(const prefix of ['=',' +','\u0000@','\t\r-','\u00a0='])assert.ok(renderSelectedCsv([{...orders[0],productName:prefix+'1'}]).includes('"\''+prefix+'1"'));
});
