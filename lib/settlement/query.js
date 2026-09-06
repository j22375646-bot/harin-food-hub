'use strict';
// All-or-nothing, bounded ledger reads. Never certify a first-page subtotal.
async function readLedgerPages(factory,key,{maxRows=50000}={}){
 try{
  const rows=[],keys=new Set();let expectedCount=null;
  for(let offset=0;offset<maxRows;offset+=500){
   const result=await factory().range(offset,offset+499);
   if(result.error)throw result.error;
   if(!Array.isArray(result.data))throw Object.assign(new Error('정산 조회 응답 형식 확인 필요'),{code:'INVALID_LEDGER_RESPONSE'});
   if(result.count!=null){
    if(expectedCount!=null&&expectedCount!==result.count)throw Object.assign(new Error('조회 중 정산 원장이 변경되었습니다. 다시 확인해주세요.'),{code:'LEDGER_CHANGED'});
    expectedCount=result.count;
   }
   for(const row of result.data){
    if(row[key]==null||keys.has(String(row[key])))throw Object.assign(new Error('정산 원장 식별자가 누락되거나 변경되었습니다.'),{code:'LEDGER_CHANGED'});
    keys.add(String(row[key]));rows.push(row);
   }
   if(result.data.length<500){
    if(expectedCount!=null&&expectedCount!==rows.length)throw Object.assign(new Error('정산 원장 조회 범위를 확인해주세요.'),{code:'LEDGER_CHANGED'});
    return {data:rows,error:null,count:rows.length};
   }
  }
  throw Object.assign(new Error('정산 조회 한도를 초과했습니다. 기간을 나눠 확인해주세요.'),{code:'LEDGER_LIMIT'});
 }catch(error){return {data:null,error:{code:error.code||'LEDGER_QUERY_FAILED',message:error.message||'정산 조회 실패'}};}
}
module.exports={readLedgerPages};
