/* Phase 23-8 · private, in-browser quality telemetry.
   Nothing is transmitted or persisted. The bounded snapshot only helps the
   owner and release checks confirm route latency, long tasks and client errors. */
const MAX_HEALTH_ENTRIES=30;
const globalHealth=window.__HARIN_CLIENT_HEALTH__||{
  version:'23-8',
  started_at:new Date().toISOString(),
  routes:[],
  long_tasks:[],
  layout_shifts:[],
  errors:[],
  pending_route:null
};

function boundedPush(bucket,value){
  bucket.push(value);
  if(bucket.length>MAX_HEALTH_ENTRIES)bucket.splice(0,bucket.length-MAX_HEALTH_ENTRIES);
}

function currentPath(){
  return window.location.pathname;
}

globalHealth.startRoute=function startRoute(href){
  const target=new URL(href,window.location.href);
  this.pending_route={path:target.pathname,started_at:performance.now()};
};

globalHealth.finishRoute=function finishRoute(href){
  if(!this.pending_route)return null;
  const target=new URL(href,window.location.href);
  const duration=Math.max(0,performance.now()-this.pending_route.started_at);
  const entry={path:target.pathname,duration_ms:Math.round(duration),finished_at:new Date().toISOString()};
  boundedPush(this.routes,entry);
  this.pending_route=null;
  return entry;
};

globalHealth.snapshot=function snapshot(){
  return {
    version:this.version,
    routes:[...this.routes],
    long_tasks:[...this.long_tasks],
    layout_shifts:[...this.layout_shifts],
    errors:[...this.errors]
  };
};

window.__HARIN_CLIENT_HEALTH__=globalHealth;
document.documentElement.dataset.harinHealthVersion=globalHealth.version;

window.addEventListener('error',event=>{
  boundedPush(globalHealth.errors,{
    type:'error',
    name:String(event.error?.name||'Error').slice(0,80),
    path:currentPath(),
    occurred_at:new Date().toISOString()
  });
});

window.addEventListener('unhandledrejection',event=>{
  boundedPush(globalHealth.errors,{
    type:'unhandledrejection',
    name:String(event.reason?.name||'PromiseRejection').slice(0,80),
    path:currentPath(),
    occurred_at:new Date().toISOString()
  });
});

if('PerformanceObserver' in window){
  try{
    const longTaskObserver=new PerformanceObserver(list=>{
      for(const entry of list.getEntries())boundedPush(globalHealth.long_tasks,{duration_ms:Math.round(entry.duration),path:currentPath()});
    });
    longTaskObserver.observe({type:'longtask',buffered:true});
  }catch{}
  try{
    const layoutShiftObserver=new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        if(entry.hadRecentInput)continue;
        boundedPush(globalHealth.layout_shifts,{value:Number(entry.value.toFixed(4)),path:currentPath()});
      }
    });
    layoutShiftObserver.observe({type:'layout-shift',buffered:true});
  }catch{}
}
