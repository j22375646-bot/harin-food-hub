async function readCalendarPages(fetchPage,decorate,from,to){
 const entries=[],seen=new Set();
 for(let offset=0;offset<5000;offset+=500){
  const result=await fetchPage(offset,offset+499);
  if(result.error)throw result.error;
  if(!Array.isArray(result.data))throw new Error('Invalid calendar page');
  for(const raw of result.data){
   const row=decorate(raw);
   if(seen.has(row.id))return {entries,complete:false};
   seen.add(row.id);
   if(row.date<=to&&(row.endDate||row.date)>=from){
    if(entries.length>=499)return {entries,complete:false};
    entries.push(row);
   }
  }
  if(result.data.length<500)return {entries,complete:Number.isSafeInteger(result.count)&&seen.size===result.count};
 }
 return {entries,complete:false};
}
module.exports={readCalendarPages};
