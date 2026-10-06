'use strict';
const {HARIN_ORIGIN}=require('./connection-policy.cjs');
const ENDPOINT=`${HARIN_ORIGIN}/api/orders/live-refresh`;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
const empty=()=>({status:'CHECK_REQUIRED',observedAt:null});
// Request identities and raw customer-bearing responses never leave Main.
function createOrderCollection({authorize,fetch,readJson,permit,blocked,timeoutMs=45000}){
 let epoch=0,active=null,ids={},attempted=false;
 let channels={cafe24:empty(),naver:empty(),coupang:empty()};
 function snapshot(){
  const states=Object.values(channels).map(row=>row.status),pending=states.some(s=>['PENDING','RUNNING'].includes(s));
  return {status:pending?'PENDING':states.every(s=>s==='SUCCESS')?'SUCCESS':'CHECK_REQUIRED',channels:structuredClone(channels),canCheck:Object.keys(ids).length>0,canCollect:!attempted,verifiedTerminal:states.every(s=>['SUCCESS','FAILED'].includes(s))&&states.some(s=>s==='SUCCESS')};
 }
 function reset(){epoch++;active?.abort();active=null;ids={};attempted=false;channels={cafe24:empty(),naver:empty(),coupang:empty()};}
 async function run(check){
  if(active||blocked())return {...snapshot(),status:'BUSY'};
  if(check&&!Object.keys(ids).length||!check&&attempted)return snapshot();
  const expected=epoch,controller=new AbortController();active=controller;let timer,permitted=null;
  const alive=()=>expected===epoch&&!controller.signal.aborted;
  const clearPermit=()=>{if(permitted){permit(permitted,null);permitted=null;}};
  try{
   const operation=(async()=>{
    const auth=await authorize();if(!alive())return;
    if(!['READY','PARTIAL'].includes(auth)){channels={cafe24:empty(),naver:empty(),coupang:empty()};attempted=true;return;}
    const method=check?'GET':'POST';const params=new URLSearchParams();
    for(const key of ['coupang','naver'])if(ids[key])params.set(`${key}RequestId`,ids[key]);
    const url=check?`${ENDPOINT}?${params}`:ENDPOINT;
    if(!check){attempted=true;ids={};channels={cafe24:empty(),naver:empty(),coupang:empty()};}
    permitted=url;permit(url,method);
    const response=await fetch(url,{method,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,...(!check?{headers:{'Content-Type':'application/json',Origin:HARIN_ORIGIN},body:'{}'}:{})});
    if(!alive())return;
    if(![200,202,207].includes(response.status))throw Error('Collection unavailable');
    const body=await readJson(response,controller);if(!alive())return;
    if(body?.ok!==true)throw Error('Collection unavailable');
    if(!check)channels.cafe24=body.cafe24Error?empty():['SUCCESS','PARTIAL'].includes(body.cafe24?.status)?{status:body.cafe24.status,observedAt:stamp(body.cafe24.finishedAt)}:empty();
    for(const key of ['naver','coupang']){
     const row=body.requests?.[key];
     if(check&&!ids[key])continue;
     if(!row||typeof row.id!=='string'||!UUID.test(row.id)||check&&row.id!==ids[key]){channels[key]=empty();continue;}
     if(!check)ids[key]=row.id;
     const status=['PENDING','RUNNING','SUCCESS','FAILED'].includes(row.status)?row.status:'CHECK_REQUIRED';
     channels[key]={status,observedAt:stamp(status==='SUCCESS'||status==='FAILED'?row.finished_at||row.executed_at:row.started_at||row.requested_at||row.created_at)};
    }
    if(Object.values(channels).every(row=>['SUCCESS','FAILED'].includes(row.status)))attempted=false;
   })();
   await Promise.race([operation,new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('Collection stopped')),{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);})]);
  }catch{
   if(expected===epoch){attempted=true;for(const key of ['naver','coupang'])if(ids[key])channels[key]=empty();}
  }finally{clearTimeout(timer);clearPermit();if(active===controller)active=null;}
  return expected===epoch?snapshot():{status:'DISCONNECTED',channels:{cafe24:empty(),naver:empty(),coupang:empty()},canCheck:false,canCollect:false,verifiedTerminal:false};
 }
 return {collect:()=>run(false),check:()=>run(true),reset};
}
module.exports={createOrderCollection};
