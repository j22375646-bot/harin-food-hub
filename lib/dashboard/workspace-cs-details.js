'use strict';
const {open}=require('../coupang/operation-queue.js');
const text=value=>typeof value==='string'?value.trim():'';
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
// Server-only projection. Never return envelopes, raw payloads or decryption errors.
function csDetails(row,{secret}={}){
 let body='',title='',replies=[],unavailable=false,truncated=false;
 try{
  if(row.platform==='NAVER'||row.platform==='CAFE24'){
   if(row.title_envelope&&Object.keys(row.title_envelope).length)title=text(open(row.title_envelope,secret)?.value);
   if(row.content_envelope&&Object.keys(row.content_envelope).length)body=text(open(row.content_envelope,secret)?.value);
  }else if(row.inquiry_type==='CALL_CENTER'){
   if(row.thread_envelope){const thread=open(row.thread_envelope,secret);body=text(thread?.content);replies=Array.isArray(thread?.conversation)?thread.conversation:[];}
  }else if(row.inquiry_type==='ONLINE')body=text(row.question_text);
 }catch{body='';title='';replies=[];unavailable=true;}
 truncated=title.length>200||body.length>2000||replies.length>5;
 const history=replies.slice(-5).map(entry=>{const content=text(entry?.content);if(content.length>1000)truncated=true;return {content:content.slice(0,1000),occurredAt:date(entry?.replyAt)};});
 return {status:unavailable?'UNAVAILABLE':body||title||history.length?'AVAILABLE':'MISSING',title:title.slice(0,200),body:body.slice(0,2000),history,truncated,updatedAt:date(row.source_updated_at||row.updated_at)};
}
module.exports={csDetails};
