'use strict';

const crypto=require('node:crypto');

function cleanText(value,max=4000){
  return String(value??'').replace(/<[^>]*>/gu,' ').replace(/&nbsp;|&#160;/giu,' ')
    .replace(/&amp;/giu,'&').replace(/&quot;/giu,'"').replace(/&#39;|&apos;/giu,"'")
    .replace(/&lt;/giu,'<').replace(/&gt;/giu,'>').replace(/\s+/gu,' ').trim().slice(0,max);
}

function safeUrl(value){
  try{const url=new URL(String(value||''));if(!['http:','https:'].includes(url.protocol))return null;return url.toString().slice(0,2000);}catch{return null;}
}

function dateValue(value){
  const text=cleanText(value,40).replace(/[^0-9]/gu,'');
  if(text.length>=8)return `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}`;
  const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}

function externalKey(provider,externalId,sourceUrl){return crypto.createHash('sha256').update(`${provider}\n${externalId}\n${sourceUrl}`).digest('hex');}
function signatureSecret(env=process.env){return cleanText(env.OFFICIAL_EVIDENCE_SIGNING_SECRET||env.SUPABASE_SERVICE_ROLE_KEY||env.HUB_SESSION_SECRET,10000);}
function signCandidate(candidate,secret=signatureSecret()){
  if(!secret){const error=new Error('공식 근거 후보 확인용 서버 비밀값이 준비되지 않았습니다.');error.code='OFFICIAL_EVIDENCE_SIGNING_REQUIRED';error.status=503;throw error;}
  return crypto.createHmac('sha256',secret).update(JSON.stringify(stable(candidate))).digest('hex');
}
function verifyCandidate(candidate,token,secret=signatureSecret()){
  if(!secret)return false;
  const expected=Buffer.from(signCandidate(candidate,secret),'hex'),received=Buffer.from(String(token||''),'hex');
  return expected.length===received.length&&crypto.timingSafeEqual(expected,received);
}

module.exports={cleanText,safeUrl,dateValue,stable,externalKey,signatureSecret,signCandidate,verifyCandidate};
