'use strict';

// PostgREST column paths such as raw_data->>order_status read one JSON key.
function columnValue(row,key){
  const [column,jsonKey]=String(key).split('->>');
  const value=row[column];
  if(jsonKey===undefined)return value;
  const nested=value&&typeof value==='object'?value[jsonKey]:undefined;
  return nested===undefined||nested===null?null:String(nested);
}

function listValues(text){return String(text).replace(/^\(|\)$/g,'').split(',').map(value=>value.trim()).filter(Boolean);}

function condition(key,operator,value){
  if(operator==='is')return row=>{const current=columnValue(row,key);return value==='null'?current===null||current===undefined:current===value;};
  if(operator==='gte')return row=>{const current=columnValue(row,key);return current!==null&&current!==undefined&&String(current)>=String(value);};
  if(operator==='lt')return row=>{const current=columnValue(row,key);return current!==null&&current!==undefined&&String(current)<String(value);};
  if(operator==='eq')return row=>columnValue(row,key)===value;
  if(operator==='in')return row=>listValues(value).includes(String(columnValue(row,key)));
  throw new Error(`unsupported fake operator ${operator}`);
}

// Parses the subset of PostgREST or() filters used by order loading:
// column.gte.value, column.is.null, column.not.in.(a,b).
function orPredicate(expression){
  const parts=[];let depth=0,current='';
  for(const character of String(expression)){
    if(character==='(')depth++;
    if(character===')')depth--;
    if(character===','&&depth===0){parts.push(current);current='';continue;}
    current+=character;
  }
  if(current)parts.push(current);
  const checks=parts.map(part=>{
    const match=/^(.+?)\.(not\.)?(is|gte|lt|eq|in)\.(.+)$/.exec(part);
    if(!match)throw new Error(`unsupported fake or() part ${part}`);
    const check=condition(match[1],match[3],match[4]);
    // SQL NOT on a NULL column is NULL, so PostgREST never matches it.
    return match[2]?row=>{const value=columnValue(row,match[1]);return value!==null&&value!==undefined&&!check(row);}:check;
  });
  return row=>checks.some(check=>check(row));
}

module.exports=function readDatabase(tables={},failure=()=>null,{onServe=()=>{}}={}){
  return {from(table){
    const predicates=[];const constraints={};let start=0,end=999;
    const query={
      select(){return query;},order(){return query;},limit(n){end=Math.min(n,1000)-1;return query;},range(a,b){start=a;end=Math.min(b,a+999);return query;},
      eq(key,value){constraints[key]=value;predicates.push(row=>columnValue(row,key)===value);return query;},
      in(key,values){constraints[key]=values;predicates.push(row=>values.map(String).includes(String(columnValue(row,key))));return query;},
      neq(key,value){predicates.push(row=>columnValue(row,key)!==value);return query;},
      like(key,value){predicates.push(row=>String(columnValue(row,key)||'').startsWith(value.replace(/%$/,'')));return query;},
      gte(key,value){predicates.push(condition(key,'gte',value));return query;},lt(key,value){predicates.push(condition(key,'lt',value));return query;},
      or(expression){predicates.push(orPredicate(expression));return query;},
      then(resolve){
        const error=failure(table,constraints,start);
        const data=error?null:(tables[table]||[]).filter(row=>predicates.every(check=>check(row))).slice(start,end+1);
        if(data)onServe(table,data);
        return Promise.resolve({data,error}).then(resolve);
      }
    };return query;
  }};
};
