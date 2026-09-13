'use strict';
const text=(s,max=160)=>typeof s==='string'?s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim().slice(0,max):'';
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
const metric=v=>v==='LT_10'?'LT_10':number(v);
function valid(v){return !!v&&Object.keys(v).length===4&&v.action==='RESEARCH'&&typeof v.query==='string'&&v.query===v.query.trim()&&v.query.length>0&&v.query.length<=60&&!/[\u0000-\u001f\u007f,]/u.test(v.query)&&[30,90].includes(v.days)&&['sim','asc','dsc','date'].includes(v.sort);}
function project(p,input){
 if(!valid(input)||p.query!==input.query||p.days!==input.days||p.sort!==input.sort||!Number.isFinite(Date.parse(p.checkedAt)))throw Error('Research response');
 const section=(s,key,max,map)=>{if(!s||!['READY','EMPTY','SETUP_REQUIRED','UNAVAILABLE'].includes(s.status)||!Array.isArray(s[key])||s[key].length>max)throw Error('Research section');return {status:s.status,[key]:s[key].map(map)};};
 return {ok:true,query:p.query,days:p.days,sort:p.sort,checkedAt:p.checkedAt,
  keywords:section(p.keywords,'rows',50,r=>({keyword:text(r.keyword,80),pc:metric(r.pc),mobile:metric(r.mobile),competition:['HIGH','MEDIUM','LOW'].includes(r.competition)?r.competition:null})),
  trend:section(p.trend,'points',90,r=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||number(r.ratio)===null||r.ratio>100)throw Error('Research trend');return {date:r.date,ratio:r.ratio};}),
  products:{...section(p.products,'rows',40,r=>({id:text(r.id,80),title:text(r.title,240),store:text(r.store,100),brand:text(r.brand,100),category:text(r.category,160),price:number(r.price)>0?r.price:null})),retired:p.products.retired===true,total:Number.isSafeInteger(p.products.total)&&p.products.total>=0?p.products.total:null}};
}
module.exports={valid,project,text};
