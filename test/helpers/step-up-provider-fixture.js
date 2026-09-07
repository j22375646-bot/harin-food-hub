'use strict';

const {webcrypto}=require('node:crypto');

const USER='11111111-1111-4111-8111-111111111111';
const SESSION='22222222-2222-4222-8222-222222222222';
const FACTOR='33333333-3333-4333-8333-333333333333';
const CHALLENGE='44444444-4444-4444-8444-444444444444';

function b64url(value){return Buffer.from(value).toString('base64url');}

async function signJwt(privateKey,header,claims){
  const encoded=`${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature=await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,Buffer.from(encoded));
  return `${encoded}.${b64url(signature)}`;
}

function tamperJwt(token){
  const parts=token.split('.');
  const signature=Buffer.from(parts[2],'base64url');
  signature[0]^=1;
  parts[2]=signature.toString('base64url');
  return parts.join('.');
}

function headersObject(headers){return Object.fromEntries(new Headers(headers).entries());}

async function createStepUpProviderFixture(options={}){
  const suffix=Math.random().toString(36).slice(2);
  const url=options.url??`https://step-up-${suffix}.example`;
  const userId=options.userId??USER;
  const sessionId=options.sessionId??SESSION;
  const factorId=options.factorId??FACTOR;
  const challengeId=options.challengeId??CHALLENGE;
  const nowMs=options.nowMs??Date.now();
  const clock={value:nowMs};
  const now=options.now??(()=>clock.value);
  const keyPair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const publicJwk=await webcrypto.subtle.exportKey('jwk',keyPair.publicKey);
  const kid=`kid-${suffix}`;
  const header={alg:'ES256',kid,typ:'JWT'};
  const issuedSeconds=Math.floor(nowMs/1000)-30;
  const expiresSeconds=Math.floor(nowMs/1000)+600;
  let totpSeconds=Math.floor(nowMs/1000);
  const baseClaims={
    iss:`${url}/auth/v1`,aud:'authenticated',role:'authenticated',sub:userId,
    session_id:sessionId,is_anonymous:false,iat:issuedSeconds,exp:expiresSeconds,aal:'aal1',
    amr:[{method:'password',timestamp:issuedSeconds}],
  };
  const originalClaims={...baseClaims,...options.originalClaims};
  let verifiedClaims={...baseClaims,aal:'aal2',amr:[{method:'password',timestamp:issuedSeconds},{method:'totp',timestamp:totpSeconds}],...options.verifiedClaims};
  const accessToken=await signJwt(keyPair.privateKey,header,originalClaims);
  let verifiedJwt=await signJwt(keyPair.privateKey,header,verifiedClaims);
  const refreshToken='original-refresh-secret';
  const verifiedRefreshToken='verified-refresh-secret';
  const factor={id:factorId,factor_type:'totp',status:'verified'};
  const baseUser={
    id:userId,email:`owner-${suffix}@example.test`,email_confirmed_at:new Date(nowMs-60_000).toISOString(),
    is_anonymous:false,banned_until:null,deleted_at:null,factors:[factor],
  };
  const originalUser={...baseUser,...options.originalUser};
  const verifiedUser={...baseUser,...options.verifiedUser};
  const requests=[];
  const writes=[];
  let challengeCount=0;
  let verifyCount=0;
  let userCount=0;
  let refreshRequests=0;

  async function syntheticFetch(input,init={}){
    const requestUrl=new URL(String(input));
    const method=String(init.method||'GET').toUpperCase();
    const request={url:requestUrl.toString(),method,headers:headersObject(init.headers),body:init.body,signal:init.signal,redirect:init.redirect};
    requests.push(request);
    if(options.onRequest){
      const override=await options.onRequest(request,{clock,requests,writes});
      if(override instanceof Response)return override;
    }
    if(requestUrl.pathname==='/auth/v1/.well-known/jwks.json'){
      if(options.malformedJwks)return new Response('{',{status:200,headers:{'content-type':'application/json'}});
      return json(options.jwksResponse??{keys:[{...publicJwk,kid,alg:'ES256',use:'sig'}]},options.jwksStatus??200);
    }
    if(requestUrl.pathname==='/auth/v1/user'&&method==='GET'){
      userCount+=1;
      const token=request.headers.authorization?.replace(/^Bearer /,'');
      if(token!==accessToken&&token!==verifiedJwt)return json({code:'invalid_token',message:'invalid token'},401);
      const user=token===verifiedJwt?verifiedUser:originalUser;
      const body=options.userResponse?.(userCount,user,request)??user;
      if(options.malformedUserAt===userCount)return new Response('{',{status:200,headers:{'content-type':'application/json'}});
      return json(body,options.userStatus?.(userCount,request)??200);
    }
    if(requestUrl.pathname==='/auth/v1/token'){
      refreshRequests+=1;
      return json({code:'refresh_not_allowed',message:'refresh not allowed'},400);
    }
    if(requestUrl.pathname===`/auth/v1/factors/${factorId}/challenge`&&method==='POST'){
      writes.push(request);challengeCount+=1;
      if(options.malformedChallenge)return new Response('{',{status:200,headers:{'content-type':'application/json'}});
      const challengeBody=typeof options.challengeResponse==='function'?options.challengeResponse({challengeId,clock,request}):options.challengeResponse;
      return json(challengeBody??{id:challengeId,type:'totp',expires_at:Math.floor(clock.value/1000)+60},options.challengeStatus??200);
    }
    if(requestUrl.pathname===`/auth/v1/factors/${factorId}/verify`&&method==='POST'){
      writes.push(request);verifyCount+=1;
      if(options.malformedVerify)return new Response('{',{status:200,headers:{'content-type':'application/json'}});
      if(typeof options.verificationNow==='function'){
        const verificationMs=options.verificationNow();
        totpSeconds=Math.floor(verificationMs/1000);
        verifiedClaims={...baseClaims,iat:totpSeconds,exp:totpSeconds+600,aal:'aal2',
          amr:[{method:'password',timestamp:issuedSeconds},{method:'totp',timestamp:totpSeconds}],...options.verifiedClaims};
        verifiedJwt=await signJwt(keyPair.privateKey,header,verifiedClaims);
      }
      const defaultVerify={
        access_token:verifiedJwt,refresh_token:verifiedRefreshToken,expires_in:600,
        expires_at:verifiedClaims.exp,token_type:'bearer',user:verifiedUser,
      };
      const verifyBody=typeof options.verifyResponse==='function'?options.verifyResponse({defaultVerify,verifiedJwt,verifiedRefreshToken,verifiedUser,request}):options.verifyResponse;
      return json(verifyBody??defaultVerify,options.verifyStatus??200);
    }
    return json({message:'unexpected request'},500);
  }

  return {
    url,now,clock,publicJwk,kid,header,keyPair,originalClaims,
    get verifiedClaims(){return verifiedClaims;},originalUser,verifiedUser,
    accessToken,get verifiedJwt(){return verifiedJwt;},refreshToken,verifiedRefreshToken,
    get totpSeconds(){return totpSeconds;},
    input:{userId,accessToken,refreshToken,factorId,code:'123456'},
    config:{url,publishableKey:'test-publishable-key',fetch:syntheticFetch,timeoutMs:500,now},
    requests,writes,
    counts:()=>({challengeCount,verifyCount,userCount,refreshRequests}),
  };
}

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});
}

module.exports={createStepUpProviderFixture,signJwt,tamperJwt,json,USER,SESSION,FACTOR,CHALLENGE};
