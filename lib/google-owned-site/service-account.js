'use strict';

const crypto=require('node:crypto');

const TOKEN_ENDPOINT='https://oauth2.googleapis.com/token';

function base64url(value){
  return Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
}

async function accessToken({clientEmail,privateKey,scope,fetchImpl=fetch,now=Date.now()}){
  const issued=Math.floor(now/1000);
  const header=base64url({alg:'RS256',typ:'JWT'});
  const claim=base64url({iss:clientEmail,scope,aud:TOKEN_ENDPOINT,iat:issued,exp:issued+3600});
  const unsigned=`${header}.${claim}`;
  const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url');
  const response=await fetchImpl(TOKEN_ENDPOINT,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.access_token){
    const error=new Error(payload.error_description||payload.error||'Google 읽기 토큰을 발급받지 못했습니다.');
    error.code='GOOGLE_TOKEN_FAILED';error.status=response.status||502;throw error;
  }
  return payload.access_token;
}

module.exports={ TOKEN_ENDPOINT, accessToken };
