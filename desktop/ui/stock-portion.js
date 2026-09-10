'use strict';
(function(root){
 const sizes=unit=>unit==='티백'?[10,20,30,40,50]:unit==='KG'?Array.from({length:19},(_,i)=>100+i*50):[];
 function estimate(quantity,unit,size){
  if(!Number.isFinite(quantity)||quantity<0||quantity>1e9||!sizes(unit).includes(size))return null;
  // KG is stored to gram precision; integer arithmetic avoids losing a package at exact boundaries.
  const total=unit==='KG'?Math.round(quantity*1000):quantity;
  if(!Number.isSafeInteger(total))return null;
  return {count:Math.floor(total/size),remainder:total%size,remainderUnit:unit==='KG'?'g':'티백'};
 }
 const api={sizes,estimate};if(typeof module==='object'&&module.exports)module.exports=api;else root.moaonPortion=api;
})(typeof window==='object'?window:globalThis);
