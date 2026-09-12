'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {calendarDay}=require('./today-calendar.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createBackgroundMonitor({connection,Notification,getWindow,directory,onStatus=()=>{},now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}){
 let stopped=false,busy=false,started=false,timer,user=null,enabled=true,epoch=0,lastRead=-Infinity,lastCollection=-Infinity,lastCs=-Infinity,collection=null,collecting=false;
 let seen=new Set(),pending=new Set(),initialized={},since=now(),readFailed=false,collectionFailed=false,csFailed=false;
 const notices=new Set();
 const save=()=>{if(!user)return;seen=new Set([...seen].slice(-5000));try{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,hash(user)+'.json'),JSON.stringify({since,seen:[...seen],initialized}),{mode:0o600});}catch{}};
 function reset(){epoch++;user=null;seen.clear();pending.clear();initialized={};since=now();lastRead=lastCollection=lastCs=-Infinity;collection=null;readFailed=collectionFailed=csFailed=false;for(const n of notices)n.close();notices.clear();}
 function identity(snapshot){
  if(stopped)return;
  if(!snapshot){reset();onStatus('로그인 필요 · 알림 대기');return;}
  if(user!==snapshot.me){reset();user=snapshot.me;try{const v=JSON.parse(fs.readFileSync(path.join(directory,hash(user)+'.json'),'utf8'));if(Number.isFinite(v.since)&&Array.isArray(v.seen)&&v.seen.length<=5000){since=Math.max(v.since,now()-86400000);seen=new Set(v.seen.filter(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)));initialized=v.initialized||{};}}catch{}}
  enabled=snapshot.members.find(m=>m.id===user)?.notifications!==false;
  const today=calendarDay(new Date(now()));
  if(now()>=Date.parse(today+'T09:00:00+09:00')){
   const due=snapshot.tasks.filter(t=>t.assigned_to===user&&t.status==='OPEN'&&t.due_date===today&&!known('task-due:'+t.id+':'+today));
   if(due.length)notify(due.map(t=>'task-due:'+t.id+':'+today),'오늘 마감할 업무 '+due.length+'건',due.length===1?due[0].title:'오늘의 업무를 확인해 주세요.','calendar');
  }
 }
 function known(id){return seen.has(hash(id))||pending.has(hash(id));}
 function notify(ids,title,body,route){
  if(stopped||!user)return;
  const keys=(Array.isArray(ids)?ids:[ids]).filter(id=>!known(id)).map(hash);if(!keys.length)return;
  if(!enabled){keys.forEach(k=>seen.add(k));save();return;}if(!Notification.isSupported()){onStatus('Windows 알림 지원 확인 필요');return;}
  const expected=epoch;keys.forEach(k=>pending.add(k));let n,timerId,settled=false;
  const finish=shown=>{if(settled)return;settled=true;clearTimer(timerId);if(expected===epoch){keys.forEach(k=>pending.delete(k));if(shown){keys.forEach(k=>seen.add(k));save();}else onStatus('Windows 알림 설정 확인 필요');}if(!shown){n?.close();notices.delete(n);}};
  try{
   n=new Notification({title,body,icon:path.join(__dirname,'ui','brand','moaon.png'),silent:false});notices.add(n);
   if(notices.size>20){const old=notices.values().next().value;old.close();notices.delete(old);}
   n.once('show',()=>finish(true));n.once('failed',()=>finish(false));n.once('close',()=>notices.delete(n));
   n.on('click',()=>{if(stopped||expected!==epoch)return;const w=getWindow();if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.setSkipTaskbar(false);w.show();w.focus();w.webContents.send('moaon-hub:background-open',route);});
   timerId=setTimer(()=>finish(false),8000);timerId?.unref?.();n.show();
  }catch{finish(false);}
 }
 function rows(kind,items){
  const fresh=[];
  for(const item of items){const id=kind+':'+item.id,at=Date.parse(item.at);
   // First successful read establishes a baseline; unknown dates are not new-order evidence.
   if(!initialized[kind]||!Number.isFinite(at)||at<since){seen.add(hash(id));continue;}
   if(!known(id))fresh.push(id);
  }
  if(fresh.length)notify(fresh,kind==='order'?'새 주문 '+fresh.length+'건':'새 고객 문의 '+fresh.length+'건',kind==='order'?'주문·배송에서 새 주문을 확인해 주세요.':'고객·CS에서 문의 내용을 확인해 주세요.',kind==='order'?'orders':'cs');
  initialized[kind]=true;save();
 }
 async function collect(token){
  if(collecting)return;collecting=true;
  try{
   if(now()-lastCollection>=120000||collection?.status==='PENDING'){
    lastCollection=now();
    const result=await connection.collectBackgroundOrders();
    if(stopped||token!==epoch)return;collection=result;collectionFailed=!['SUCCESS','PENDING','BUSY'].includes(result.status);
   }
   if(now()-lastCs>=300000){lastCs=now();const result=await connection.collectBackgroundCs();if(stopped||token!==epoch)return;csFailed=!['QUEUED','BUSY'].includes(result.status);}
  }catch{if(token===epoch)collectionFailed=true;}finally{collecting=false;}
 }
 async function tick(){
  if(stopped||busy)return;busy=true;
  try{
   const team=await connection.teamCommand({action:'READ'});if(stopped)return;
   if(!team.ok){if(team.code==='TEAM_AUTH_REQUIRED')identity(null);else if(team.code!=='TEAM_BUSY')onStatus('연결 재시도 중');return;}
   identity(team.value);const token=epoch;
   if(now()-lastRead>=60000){
    lastRead=now();
    const orders=await connection.readBackgroundOrders();if(stopped||token!==epoch)return;
    const cs=await connection.readCs();if(stopped||token!==epoch)return;
    const calendar=await connection.readTodayCalendar();if(stopped||token!==epoch)return;
    if(orders.status==='READY')rows('order',orders.items);
    if(cs.status==='READY')rows('cs',cs.items.filter(r=>r.kind==='INQUIRY').map(r=>({id:r.id,at:r.occurredAt})));
    if(calendar.status==='READY')for(const e of calendar.entries){if(e.status!=='OPEN'||e.type==='MEMO')continue;const at=Date.parse(calendar.date+'T'+(e.time||'09:00')+':00+09:00');if(now()>=at-10*60000&&now()<=at+60*60000)notify('calendar:'+e.id+':'+calendar.date+':'+e.time,e.time?'일정이 곧 시작돼요':'오늘의 일정',e.title,'calendar');}
    readFailed=[orders,cs,calendar].some(r=>r.status!=='READY')||orders.truncated===true||cs.truncated===true;
   }
   // Collection can take longer than a polling interval. It must not hold up team reminders.
   void collect(token);
   onStatus(readFailed||collectionFailed||csFailed?'일부 연결 확인 필요':enabled?'백그라운드 확인 중':'알림 꺼짐 · 수집 중');
  }catch{onStatus('연결 재시도 중');}finally{busy=false;}
 }
 function plan(){timer=setTimer(async()=>{await tick();if(!stopped)plan();},15000);timer?.unref?.();}
 return {identity,tick,start(){if(started||stopped)return;started=true;plan();},stop(){stopped=true;clearTimer(timer);reset();},reset,notify};
}
module.exports={createBackgroundMonitor};
