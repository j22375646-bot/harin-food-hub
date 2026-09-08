'use strict';
const validDocumentIds=ids=>Array.isArray(ids)&&ids.length>0&&ids.length<=20&&ids.every(id=>typeof id==='string'&&/^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/.test(id))&&new Set(ids).size===ids.length;
function cell(value){
 let text=value==null||value===''?'확인 필요':String(value);
 if(/^[\s\u0000-\u001f\u007f-\u009f]*[=+@-]/u.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
function renderSelectedCsv(orders){
 if(!Array.isArray(orders)||!validDocumentIds(orders.map(row=>row?.hubOrderId)))throw Error('Invalid selection');
 const channels={CAFE24:'Cafe24',NAVER:'네이버',COUPANG:'쿠팡'},stages={PAID:'결제완료',PREPARING:'준비중',READY_TO_SHIP:'출고대기',WAITING_FOR_CARRIER:'배송대기중',SHIPPING:'배송중',DELIVERED:'배송완료',CANCELLED:'취소'};
 const rows=[['허브 주문번호','채널','쇼핑몰 주문번호','단계','상품','수량','결제금액'],...orders.map(row=>[row.hubOrderId,channels[row.platform]||row.platform,row.details?.externalOrderId,stages[row.stage]||row.stage,row.productName,Number.isSafeInteger(row.quantity)&&row.quantity>0?row.quantity:null,Number.isFinite(row.amount)&&row.amount>=0?row.amount:null])];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
function createSelectedDocuments({dialog,getParent,writeFile}){
 let busy=false;
 async function save({orders,validate}){
  if(busy)return {status:'BUSY'};
  busy=true;let active=true,timer,writeStarted=false;
  try{
   const csv=renderSelectedCsv(orders);
   return await Promise.race([(async()=>{
    if(typeof validate!=='function'||!await validate()||!active)return {status:'DOCUMENT_CHANGED'};
    const result=await dialog.showSaveDialog(getParent(),{title:'선택 주문 CSV 저장',defaultPath:'모아온_선택주문.csv',filters:[{name:'CSV (Excel에서 열기)',extensions:['csv']}],properties:['showOverwriteConfirmation']});
    if(!active)return {status:'DOCUMENT_UNAVAILABLE'};
    if(result?.canceled||!result?.filePath)return {status:'SAVE_CANCELLED'};
    if(!await validate()||!active)return {status:'DOCUMENT_CHANGED'};
    // Exclusive creation: even a replacement race cannot overwrite an existing file.
    writeStarted=true;await writeFile(result.filePath,csv,{encoding:'utf8',flag:'wx'});
    return {status:'CSV_SAVED',count:orders.length};
   })(),new Promise(resolve=>{timer=setTimeout(()=>{active=false;resolve({status:writeStarted?'SAVE_CHECK_REQUIRED':'DOCUMENT_UNAVAILABLE'});},60000);})]);
  }catch(error){return {status:error?.code==='EEXIST'?'FILE_EXISTS':writeStarted?'SAVE_CHECK_REQUIRED':'DOCUMENT_UNAVAILABLE'};}
  finally{active=false;clearTimeout(timer);busy=false;}
 }
 return Object.freeze({save});
}
module.exports={createSelectedDocuments,renderSelectedCsv,validDocumentIds};
