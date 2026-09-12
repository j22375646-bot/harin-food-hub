'use strict';
const auth=require('../dashboard-auth.js'),{getSupabase}=require('../cafe24/supabase.js'),{readJson}=require('../api/safety.js'),{validInput}=require('./contract.js');
const TENANT='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'}});
function createHandler({database=getSupabase,validate=auth.validateSession}={}){return async request=>{
 try{
 const url=new URL(request.url);if(url.pathname!=='/api/moaon/team'||url.search||!['GET','POST'].includes(request.method))return reply(400,{ok:false,code:'TEAM_INVALID'});
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||(request.method==='POST'&&request.headers.get('origin')!==url.origin))return reply(403,{ok:false,code:'TEAM_ACCESS_DENIED'});
 const cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(auth.COOKIE_NAME+'='));if(cookie.length!==1)return reply(401,{ok:false,code:'TEAM_AUTH_REQUIRED'});const token=cookie[0].slice(auth.COOKIE_NAME.length+1);if(token.length>4096)return reply(401,{ok:false,code:'TEAM_AUTH_REQUIRED'});
 const db=database(),session=await validate(token,{db});if(!session||session.role!=='OWNER')return reply(401,{ok:false,code:'TEAM_AUTH_REQUIRED'});
 if(request.method==='POST'&&!/^application\/json(?:;.*)?$/i.test(request.headers.get('content-type')||''))return reply(415,{ok:false,code:'TEAM_INVALID'});
 const input=request.method==='GET'?{action:'READ'}:await readJson(request,{maxBytes:70000});if(!validInput(input)||request.method==='POST'&&input.action==='READ')return reply(400,{ok:false,code:'TEAM_INVALID'});
 const result=await db.rpc('moaon_team_command',{p_actor:session.userId,p_tenant:TENANT,p_session:session.id,p_hash:auth.tokenHash(token),p_input:input});
 if(result.error){const code=['TEAM_AUTH_REQUIRED','TEAM_ACCESS_DENIED','TEAM_CONFLICT','TEAM_NOT_FOUND','TEAM_ASSIGNEE_INVALID','TEAM_INVALID'].find(c=>result.error.message?.includes(c));return reply(({TEAM_AUTH_REQUIRED:401,TEAM_ACCESS_DENIED:403,TEAM_CONFLICT:409,TEAM_NOT_FOUND:404,TEAM_ASSIGNEE_INVALID:409,TEAM_INVALID:400})[code]||503,{ok:false,code:code||'TEAM_UNAVAILABLE'});}
 return reply(200,{ok:true,value:result.data});
 }catch{return reply(503,{ok:false,code:'TEAM_UNAVAILABLE'});}
};}
module.exports={createHandler};
