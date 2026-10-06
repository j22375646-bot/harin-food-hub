'use strict';
// Page by unique source keys, never by an offset that can shift after a deletion.
function createInventoryReader({db,signal=AbortSignal.timeout(20000)}={}){
 return async function read(table,columns,filterKey,ids,maxRows=5000,orderKey=filterKey){
  if(ids&&!ids.length)return [];
  const values=ids?[...new Set(ids.map(String))]:null;
  const groups=values?Array.from({length:Math.ceil(values.length/100)},(_,i)=>values.slice(i*100,i*100+100)):[null];
  const rows=[],seen=new Set();
  for(const group of groups){
   let cursor=null;
   while(true){
    signal.throwIfAborted();
    let query=db.from(table).select(columns).order(orderKey,{ascending:true}).limit(250).abortSignal(signal);
    if(group)query=query.in(filterKey,group);
    if(cursor!==null)query=query.gt(orderKey,cursor);
    const result=await query;signal.throwIfAborted();
    if(result?.error||!Array.isArray(result?.data))throw Error('Inventory unavailable');
    if(!result.data.length)break;
    for(const row of result.data){
     const id=row[orderKey];
     if(id==null||!['string','number'].includes(typeof id)||!String(id)||seen.has(String(id)))throw Error('Invalid inventory page');
     seen.add(String(id));rows.push(row);
     if(rows.length>maxRows)throw Error('Inventory read limit exceeded');
    }
    cursor=result.data.at(-1)[orderKey];
   }
  }
  return rows;
 };
}
module.exports={createInventoryReader};
