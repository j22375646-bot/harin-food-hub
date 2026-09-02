'use strict';

function entryId(value){return String(value?.id??value??'');}

function beginCalendarEntryRemoval(entries=[],id){
  const targetId=entryId(id);
  const index=(entries||[]).findIndex(item=>entryId(item)===targetId);
  if(index<0)return {entries:[...(entries||[])],removed:null};
  return {
    entries:(entries||[]).filter((_,itemIndex)=>itemIndex!==index),
    removed:{entry:entries[index],index}
  };
}

function rollbackCalendarEntryRemoval(entries=[],removed){
  if(!removed?.entry)return [...(entries||[])];
  const targetId=entryId(removed.entry);
  if((entries||[]).some(item=>entryId(item)===targetId))return [...entries];
  const restored=[...(entries||[])];
  const index=Math.max(0,Math.min(Number(removed.index)||0,restored.length));
  restored.splice(index,0,removed.entry);
  return restored;
}

module.exports={beginCalendarEntryRemoval,rollbackCalendarEntryRemoval};
