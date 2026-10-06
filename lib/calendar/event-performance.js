'use strict';
const tools=require('../../desktop/ui/event-tools.js');
const sources=[{key:'NAVER',label:'네이버',platform:'NAVER',table:'naver_commerce_orders',date:'order_date',amount:'paid_amount',id:'order_id'}, {key:'CAFE24',label:'카페24',platform:'CAFE24',table:'cafe24_orders',date:'order_date',amount:'paid_amount',id:'order_id'}, {key:'COUPANG',label:'쿠팡 판매자배송',platform:'COUPANG',table:'coupang_orders',date:'ordered_at',amount:'gross_amount',id:'shipment_box_id'}, {key:'COUPANG_RG',label:'쿠팡 로켓그로스',platform:'COUPANG',table:'coupang_rg_orders',date:'paid_at',amount:'total_amount',id:'order_id'}];
function periods(event){if(!tools.day(event.date)||!tools.day(event.endDate||event.date))throw Error('Invalid event dates');const days=Math.round((Date.parse(event.endDate||event.date)-Date.parse(event.date))/86400000)+1;if(days<1||days>367)throw Error('Invalid event period');return {days,periods:[{label:'행사 전',from:tools.shift(event.date,-days),to:tools.shift(event.date,-1)},{label:'행사 중',from:event.date,to:event.endDate||event.date},{label:'행사 후',from:tools.shift(event.endDate||event.date,1),to:tools.shift(event.endDate||event.date,days)}]};}
async function readSource(db,source,from,to){
 const rows=[],seen=new Set();let expected=null;
 for(let offset=0;offset<5000;offset+=500){const result=await db.from(source.table).select([source.id,'order_id',source.date,source.amount].filter((v,i,a)=>a.indexOf(v)===i).join(','),{count:'exact'}).gte(source.date,from+'T00:00:00+09:00').lt(source.date,tools.shift(to,1)+'T00:00:00+09:00').order(source.id,{ascending:true}).range(offset,offset+499);
  if(result.error||!Array.isArray(result.data)||!Number.isInteger(result.count)||result.count>5000||expected!==null&&result.count!==expected)throw Error('Incomplete source');expected=result.count;
  for(const row of result.data){const id=String(row[source.id]??'');if(!id||seen.has(id))throw Error('Duplicate source');seen.add(id);rows.push(row);}if(rows.length===expected)return rows;if(!result.data.length)throw Error('Incomplete source');
 }throw Error('Source limit');
}
function summarize(rows,source,period,today){
 if(period.from>today)return {...period,status:'FUTURE',orders:null,amount:null};
 let amount=0,missing=false;const ids=new Set();
 for(const r of rows){const at=Date.parse(r[source.date]);if(!Number.isFinite(at))throw Error('Missing date');const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(at));if(date<period.from||date>period.to||date>today)continue;const id=String(r.order_id??'');if(!id)throw Error('Missing order');ids.add(id);const raw=r[source.amount],n=typeof raw==='number'?raw:typeof raw==='string'&&/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;if(!Number.isFinite(n)||n<0||n>1e12)missing=true;else amount+=n;}
 return {...period,status:period.to>=today?'IN_PROGRESS':'OBSERVED',orders:ids.size,amount:missing?null:amount};
}
async function load(db,event,now=new Date()){
 const range=periods(event),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
 const channels=await Promise.all(sources.filter(s=>(event.platforms||['NAVER','CAFE24','COUPANG']).includes(s.platform)).map(async s=>{try{const rows=await readSource(db,s,range.periods[0].from,range.periods[2].to);return {key:s.key,label:s.label,periods:range.periods.map(p=>summarize(rows,s,p,today))};}catch{return {key:s.key,label:s.label,periods:range.periods.map(p=>({...p,status:p.from>today?'FUTURE':'UNAVAILABLE',orders:null,amount:null}))};}}));
 return {status:'READY',eventId:event.id,days:range.days,channels,generatedAt:now.toISOString(),basis:'COLLECTED_ORDER_AMOUNTS_BEFORE_CANCELLATIONS',coverage:'UNCONFIRMED'};
}
module.exports={load,periods,summarize,readSource,sources};
