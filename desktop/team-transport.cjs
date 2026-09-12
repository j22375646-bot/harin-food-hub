'use strict';
const {validInput,validSnapshot}=require('./team-contract.cjs');
const TEAM_URL='https://harin-cafe24-sync.vercel.app/api/moaon/team';
async function teamRequest(fetch,input,signal){
 if(!validInput(input))return {ok:false,code:'TEAM_INVALID'};
 try{const read=input.action==='READ',response=await fetch(TEAM_URL,{method:read?'GET':'POST',credentials:'include',cache:'no-store',redirect:'error',signal,headers:read?{}:{Origin:'https://harin-cafe24-sync.vercel.app','Content-Type':'application/json'},...(read?{}:{body:JSON.stringify(input)})});const text=await response.text();if(text.length>2*1024*1024)throw Error();const value=JSON.parse(text);if(!response.ok||!value.ok)return {ok:false,code:['TEAM_AUTH_REQUIRED','TEAM_ACCESS_DENIED','TEAM_CONFLICT','TEAM_NOT_FOUND','TEAM_ASSIGNEE_INVALID','TEAM_INVALID'].includes(value.code)?value.code:'TEAM_UNAVAILABLE'};if(read&&!validSnapshot(value.value))throw Error();return {ok:true,value:value.value};}catch{return {ok:false,code:input.action==='READ'?'TEAM_UNAVAILABLE':'TEAM_RESULT_UNKNOWN'};}
}
module.exports={TEAM_URL,teamRequest};
