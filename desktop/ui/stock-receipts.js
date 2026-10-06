(function(root){
  'use strict';
  const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  function select(rows,product,from='',to=''){
    if(!Array.isArray(rows)||!product||from&&!date(from)||to&&!date(to)||from&&to&&from>to)throw Error('조회 시작일과 종료일을 확인하세요.');
    return rows.filter(r=>(product.productNo?r.productNo===product.productNo:!r.productNo&&r.name===product.name)&&(!from&&!to||date(r.receivedDate)&&(!from||r.receivedDate>=from)&&(!to||r.receivedDate<=to))).sort((a,b)=>(b.receivedDate||'').localeCompare(a.receivedDate||'')||a.id.localeCompare(b.id));
  }
  const api={select,date};if(typeof module==='object')module.exports=api;else root.moaonReceipts=api;
})(typeof window==='object'?window:globalThis);
