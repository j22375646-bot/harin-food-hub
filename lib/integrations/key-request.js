'use strict';
const auth=require('../dashboard-auth.js'),keys=require('./managed-keys.js');
const reply=(status,value)=>Response.json(value,{status,headers:{'cache-control':'private, no-store','vary':'Cookie, Origin','x-content-type-options':'nosniff'}});
function createHandler({database=require('../cafe24/supabase.js').getSupabase,validate=auth.validateSession,env=process.env}={}){return async request=>{
 try{
  const url=new URL(request.url);
  if(url.pathname!=='/api/moaon/connections'||url.search||request.method!=='POST')return reply(400,{ok:false,code:'KEYS_INVALID'});
  if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply(403,{ok:false,code:'KEYS_AUTH_REQUIRED'});
  if(!/^application\/json(?:;.*)?$/i.test(request.headers.get('content-type')||''))return reply(415,{ok:false,code:'KEYS_INVALID'});
  const cookies=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(auth.COOKIE_NAME+'='));
  if(cookies.length!==1)return reply(401,{ok:false,code:'KEYS_AUTH_REQUIRED'});
  const token=cookies[0].slice(auth.COOKIE_NAME.length+1);if(!token||token.length>4096)return reply(401,{ok:false,code:'KEYS_AUTH_REQUIRED'});
  const db=database(),session=await validate(token,{db});if(!session||session.role!=='OWNER')return reply(401,{ok:false,code:'KEYS_AUTH_REQUIRED'});
  const input=await require('../api/safety.js').readJson(request,{maxBytes:24000});if(!keys.validInput(input))return reply(400,{ok:false,code:'KEYS_INVALID'});
  const rpc=async value=>{const r=await db.rpc('moaon_key_command',{p_actor:session.userId,p_session:session.id,p_hash:auth.tokenHash(token),p_input:value});if(r.error)throw keys.fail(['KEYS_AUTH_REQUIRED','KEYS_CONFLICT','KEYS_RATE_LIMITED','KEYS_INVALID'].find(c=>r.error.message?.includes(c)));return r.data;};
  if(input.action==='LIST'){
   const rows=await rpc(input),checks=await db.from('moaon_key_checks').select('provider,revision,result').eq('tenant_id',keys.TENANT);if(checks.error)throw keys.fail();
   return reply(200,{ok:true,cards:Object.entries(keys.definitions).map(([provider,d])=>{const row=rows.find(r=>r.provider===provider),check=checks.data.find(r=>r.provider===provider&&r.revision===(row?.revision||0));return {provider,name:d.name,revision:row?.revision||0,expiresAt:row?.expiresAt||(provider==='COUPANG'?env.COUPANG_KEY_EXPIRES_AT||null:null),updatedAt:row?.updatedAt||null,editable:env.MOAON_MANAGED_KEYS_ENABLED==='1',check:check?.result||null,fields:Object.keys(d.fields),identity:d.identity};})});
  }
  if(input.action==='REVEAL'){
   const row=await rpc(input);return reply(200,{ok:true,provider:input.provider,revision:row?.revision||0,fields:keys.decode(input.provider,row,env)});
  }
  if(input.action==='SAVE'){
   if(env.MOAON_MANAGED_KEYS_ENABLED!=='1')return reply(503,{ok:false,code:'KEYS_SETUP_REQUIRED'});
   // All values are a complete new snapshot. Do not silently retain an old secret after an empty edit.
   const existing=await rpc({action:'REVEAL',provider:input.provider});
   const d=keys.definitions[input.provider],base=keys.decode(input.provider,existing,env);
   if(d.identity.some(k=>input.fields[k]!==base[k])||Object.entries(input.fields).some(([k,v])=>k!=='trackingApiKey'&&!v.trim())||input.provider==='EPOST'&&Buffer.byteLength(input.fields.securityKey,'utf8')!==16)return reply(400,{ok:false,code:'KEYS_INVALID'});
   // Authorize before doing encryption and again atomically with the eventual update.
   const envelope=keys.cipher(env).seal({tenantId:keys.TENANT,provider:input.provider,revision:input.revision+1},input.fields);
   const saved=await rpc({action:'SAVE',provider:input.provider,revision:input.revision,envelope,expiresAt:input.expiresAt});
   return reply(200,{ok:true,...saved});
  }
  await rpc(input);
  // Fixed-IP providers must be verified by their real collector, never by the Vercel egress IP.
  if(['COUPANG','NAVER','EPOST'].includes(input.provider)){
   if(env.MOAON_MANAGED_KEYS_ENABLED!=='1')return reply(200,{ok:true,status:'WORKER_CHECK_REQUIRED',checkedAt:null});
   const payload=input.provider==='NAVER'?{adResult:await require('./key-probe.js').probeNaverAds({db,env})}:{};
   await require('../coupang/operation-queue.js').queueOperation(db,{operationType:'MANAGED_KEY_PROBE',targetType:'CHANNEL',targetId:input.provider,payload,idempotencyKey:'key-probe:'+input.provider+':'+Math.floor(Date.now()/30000)});
   return reply(200,{ok:true,status:'QUEUED',checkedAt:null});
  }
  return reply(200,{ok:true,...await require('./key-probe.js').probe('CAFE24',{db,env})});
 }catch(error){const code=['KEYS_AUTH_REQUIRED','KEYS_INVALID','KEYS_CONFLICT','KEYS_RATE_LIMITED'].includes(error.code)?error.code:'KEYS_UNAVAILABLE';return reply(({KEYS_AUTH_REQUIRED:401,KEYS_INVALID:400,KEYS_CONFLICT:409,KEYS_RATE_LIMITED:429})[code]||503,{ok:false,code});}
};}
module.exports={createHandler};
