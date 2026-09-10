'use strict';
// Pure planner shared by the renderer and boundary tests. Never changes stock.
((root)=>{
 function plan(row,target=30){
  if(![14,30,45,60].includes(target))target=30;
  const quantity=Number.isSafeInteger(row?.quantity)&&row.quantity>=0?row.quantity:null;
  const sales30=Number.isSafeInteger(row?.sales30)&&row.sales30>=0?row.sales30:null;
  const valid=quantity!==null&&sales30!==null&&sales30>0&&!row.stale;
  const daily=sales30===null?null:sales30/30;
  const days=valid?quantity/daily:null;
  const date=typeof row?.updatedAt==='string'?Date.parse(row.updatedAt):NaN;
  const end=days!==null&&days<36500&&Number.isFinite(date)?new Date(date+days*86400000).toISOString():null;
  return {daily,days,depletesAt:end,remaining30:valid?Math.max(0,quantity-sales30):null,shortage30:valid?Math.max(0,sales30-quantity):null,
   replenish:valid?Math.max(0,Math.ceil(sales30*target/30-quantity)):null,
   coverage:valid?Math.min(100,quantity/(sales30*target/30)*100):null,
   risk:row.stale||quantity===null?'CHECK':quantity===0?'EMPTY':days===null?'NO_SALES':days<7?'URGENT':days<14?'LOW':'ENOUGH'};
 }
 if(typeof module!=='undefined')module.exports={plan};else root.moaonRocketPlanner=Object.freeze({plan});
})(typeof window==='undefined'?globalThis:window);
