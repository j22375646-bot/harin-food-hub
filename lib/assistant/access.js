'use strict';
const crypto=require('node:crypto');
const SCOPES=['orders','tasks','cs','reports'];
const valid=v=>v&&Object.getPrototypeOf(v)===Object.prototype&&(['STATUS'].includes(v.action)?Object.keys(v).length===1:['ISSUE','REVOKE'].includes(v.action)&&Number.isInteger(v.revision)&&v.revision>=0&&v.revision<2147483647&&(v.action==='REVOKE'?Object.keys(v).length===2:Object.keys(v).length===3&&Array.isArray(v.scopes)&&v.scopes.length>0&&v.scopes.length<=4&&new Set(v.scopes).size===v.scopes.length&&v.scopes.every(s=>SCOPES.includes(s))));
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
const fail=code=>Object.assign(Error(code),{code});
const reply=(status,value)=>Response.json(value,{status,headers:{'cache-control':'private, no-store',vary:'Cookie, Authorization, Origin','x-content-type-options':'nosniff'}});
const errorReply=e=>{const code=['ASSISTANT_AUTH_REQUIRED','ASSISTANT_CONFLICT','ASSISTANT_RATE_LIMITED','ASSISTANT_INVALID','ASSISTANT_TIMEOUT'].includes(e?.code)?e.code:'ASSISTANT_UNAVAILABLE';return reply(({ASSISTANT_AUTH_REQUIRED:401,ASSISTANT_CONFLICT:409,ASSISTANT_RATE_LIMITED:429,ASSISTANT_INVALID:400,ASSISTANT_TIMEOUT:504})[code]||503,{ok:false,code});};
async function rpc(db,name,args){const r=await db.rpc(name,args);if(r.error)throw fail(['ASSISTANT_AUTH_REQUIRED','ASSISTANT_CONFLICT','ASSISTANT_RATE_LIMITED','ASSISTANT_INVALID'].find(c=>r.error.message?.includes(c))||'ASSISTANT_UNAVAILABLE');return r.data;}
function createAdmin({database=require('../cafe24/supabase.js').getSupabase,validate=require('../dashboard-auth.js').validateSession}={}){return async request=>{try{
 const url=new URL(request.url);if(request.method!=='POST'||url.pathname!=='/api/moaon/assistant/access'||url.search)throw fail('ASSISTANT_INVALID');
 if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')throw fail('ASSISTANT_AUTH_REQUIRED');
 if(!/^application\/json(?:;.*)?$/i.test(request.headers.get('content-type')||''))throw fail('ASSISTANT_INVALID');
 const auth=require('../dashboard-auth.js'),cookies=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(auth.COOKIE_NAME+'='));if(cookies.length!==1)throw fail('ASSISTANT_AUTH_REQUIRED');const token=cookies[0].slice(auth.COOKIE_NAME.length+1);if(!token||token.length>4096)throw fail('ASSISTANT_AUTH_REQUIRED');
 const db=database(),session=await validate(token,{db});if(session?.role!=='OWNER')throw fail('ASSISTANT_AUTH_REQUIRED');
 const input=await require('../api/safety.js').readJson(request,{maxBytes:2048});if(!valid(input))throw fail('ASSISTANT_INVALID');
 const key=input.action==='ISSUE'?'moaon_ro_'+crypto.randomBytes(32).toString('base64url'):null;
 const value=await rpc(db,'moaon_assistant_access_command',{p_actor:session.userId,p_session:session.id,p_hash:auth.tokenHash(token),p_input:key?{...input,tokenHash:hash(key)}:input});
 return reply(200,{ok:true,value,...(key?{key}:{} )});
 }catch(e){return errorReply(e);}};}
function createRead({database=require('../cafe24/supabase.js').getSupabase,load=require('../dashboard/workspace-assistant-loader.js').loadWorkspaceAssistant,timeoutMs=25000}={}){return async request=>{
 let timer,stopped=false;const current=()=>{if(stopped||request.signal.aborted)throw fail('ASSISTANT_TIMEOUT');};
 try{return await Promise.race([(async()=>{
 const url=new URL(request.url);if(request.method!=='GET'||url.pathname!=='/api/moaon/assistant/read'||url.search)throw fail('ASSISTANT_INVALID');
 const bearer=request.headers.get('authorization')||'';if(!/^Bearer moaon_ro_[A-Za-z0-9_-]{43}$/.test(bearer)||request.headers.has('cookie'))throw fail('ASSISTANT_AUTH_REQUIRED');
 current();const db=database(),digest=hash(bearer.slice(7)),before=await rpc(db,'moaon_assistant_access_verify',{p_hash:digest,p_consume:true});current();
 if(!before?.tenantId||!before.userId||!Array.isArray(before.scopes)||!before.scopes.length||before.scopes.some(s=>!SCOPES.includes(s)))throw fail('ASSISTANT_AUTH_REQUIRED');
 const slot=request.headers.get('x-moaon-bot-slot'),user=request.headers.get('x-moaon-telegram-user'),chat=request.headers.get('x-moaon-telegram-chat');
 let context=before;
 if(slot||user||chat){if(!['WORK','SOLO','STUDY','SUP','AD'].includes(slot)||!/^\d{1,19}$/.test(user||'')||! /^-?\d{1,19}$/.test(chat||''))throw fail('ASSISTANT_INVALID');context=await rpc(db,'moaon_assistant_chat_context',{p_worker_hash:digest,p_slot:slot,p_user:user,p_chat:chat});}
 const data=await load({db,context,scopes:context.scopes});current();
 if(slot){const recheck=await rpc(db,'moaon_assistant_chat_context',{p_worker_hash:digest,p_slot:slot,p_user:user,p_chat:chat});if(JSON.stringify(context)!==JSON.stringify(recheck))throw fail('ASSISTANT_AUTH_REQUIRED');}
 const after=await rpc(db,'moaon_assistant_access_verify',{p_hash:digest,p_consume:false});current();
 if(JSON.stringify(before)!==JSON.stringify(after))throw fail('ASSISTANT_AUTH_REQUIRED');
 return reply(200,{ok:true,writePolicy:'READ_ONLY',retrievedAt:data.retrievedAt,sourcePolicy:'STORED_DATA',status:data.status,sources:Object.fromEntries(context.scopes.map(s=>[s,data.sources[s]])),caveats:data.caveats});
 })(),new Promise((_,reject)=>{timer=setTimeout(()=>{stopped=true;reject(fail('ASSISTANT_TIMEOUT'));},timeoutMs);})]);}catch(e){return errorReply(e);}finally{stopped=true;clearTimeout(timer);}
 };}
module.exports={SCOPES,valid,hash,createAdmin,createRead};
