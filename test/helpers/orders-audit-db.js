'use strict';
// Models the read-only PostgREST boundary, including its default 1000-row cap.
module.exports=function readDatabase(tables={},failure=()=>null){
  return {from(table){
    const predicates=[];const constraints={};let start=0,end=999;
    const query={
      select(){return query;},order(){return query;},limit(n){end=Math.min(n,1000)-1;return query;},range(a,b){start=a;end=Math.min(b,a+999);return query;},
      eq(key,value){constraints[key]=value;predicates.push(row=>row[key]===value);return query;},
      in(key,values){constraints[key]=values;predicates.push(row=>values.includes(row[key]));return query;},
      neq(key,value){predicates.push(row=>row[key]!==value);return query;},
      like(key,value){predicates.push(row=>String(row[key]||'').startsWith(value.replace(/%$/,'')));return query;},
      gte(key,value){predicates.push(row=>row[key]>=value);return query;},lt(key,value){predicates.push(row=>row[key]<value);return query;},
      then(resolve){const error=failure(table,constraints,start);return Promise.resolve({data:error?null:(tables[table]||[]).filter(row=>predicates.every(check=>check(row))).slice(start,end+1),error}).then(resolve);}
    };return query;
  }};
};
