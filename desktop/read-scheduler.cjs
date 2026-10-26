'use strict';
// Only normalized, explicitly read-only operations belong here. Never writes.
function createReadScheduler({now=Date.now,scope,random=Math.random,unavailable,stale,success,retry}){
 let epoch=0,lastScope;const entries=new Map();
 const reset=()=>{epoch++;entries.clear();};
 function read(key,run){
  const current=scope();if(current!==lastScope){reset();lastScope=current;}
  let entry=entries.get(key);if(!entry){entry={failures:0,nextAt:0,flight:null};entries.set(key,entry);}
  const copy=value=>structuredClone(value);
  if(entry.flight)return entry.flight.then(copy);
  if(now()<entry.nextAt)return Promise.resolve(unavailable());
  const ticket=epoch;
  const alive=()=>ticket===epoch&&current===scope()&&entries.get(key)===entry;
  const operation=Promise.resolve().then(run).catch(()=>unavailable()).then(value=>{
   if(!alive())return stale(current!==scope());
   if(success(value)){entry.failures=0;entry.nextAt=0;}
   else if(retry(value)){entry.failures++;const base=Math.min(120000,15000*2**Math.min(entry.failures-1,3));entry.nextAt=now()+base*(.9+.2*Math.min(1,Math.max(0,random())));}
   return value;
  });
  let tracked;tracked=operation.finally(()=>{if(entry.flight===tracked)entry.flight=null;});entry.flight=tracked;return tracked.then(copy);
 }
 return {read,reset};
}
module.exports={createReadScheduler};
