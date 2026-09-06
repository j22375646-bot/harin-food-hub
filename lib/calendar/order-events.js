'use strict';
const calendar=require('./calendar-center.js');

async function loadOrderEvents(db,{asOf=new Date()}={}){
  const range=calendar.visibleMonthRange(calendar.seoulDateKey(asOf).slice(0,7));
  const data=[];
  for(let offset=0;;offset+=500){
    const result=await db.from('hub_work_items')
      .select('id,item_type,title,body,status,priority,due_at,page_key,context_label,context_href,completed_at,created_at,updated_at')
      .eq('context_href','/calendar').neq('status','ARCHIVED').like('context_label','캘린더 이벤트%')
      .gte('due_at',new Date(`${calendar.addDays(range.start,-366)}T00:00:00+09:00`).toISOString())
      .lt('due_at',new Date(`${range.endExclusive}T00:00:00+09:00`).toISOString())
      .order('id',{ascending:true}).range(offset,offset+499);
    if(result.error)return {data:[],error:result.error};
    data.push(...(result.data||[]));
    if((result.data||[]).length<500)return {data,error:null};
  }
}
module.exports={loadOrderEvents};
