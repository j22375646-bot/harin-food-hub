'use strict';

const crypto=require('node:crypto');
const http=require('node:http');
const https=require('node:https');

const LAB_ORIGIN='https://127.0.0.1:54443';
const LAB_AUTH_PREFIX='/auth/v1';
const UPSTREAM_HOST='127.0.0.1';
const UPSTREAM_PORT=54323;

function labError(code){
  const error=new Error(code);
  error.code=code;
  return error;
}

function readLabConfiguration(env){
  if(env?.MOAON_AUTH_LAB_RUN!=='1'||typeof env.MOAON_AUTH_LAB_CERT!=='string'||env.MOAON_AUTH_LAB_CERT.length===0||
      typeof env.MOAON_AUTH_LAB_KEY!=='string'||env.MOAON_AUTH_LAB_KEY.length===0)throw labError('AUTH_LAB_DISABLED');
  return Object.freeze({certPath:env.MOAON_AUTH_LAB_CERT,keyPath:env.MOAON_AUTH_LAB_KEY});
}

function authorizeClientUrl(value){
  let target;
  try{target=new URL(String(value));}catch{throw labError('AUTH_LAB_TARGET_REJECTED');}
  if(target.origin!==LAB_ORIGIN||target.username||target.password||target.hash||
      !(target.pathname===LAB_AUTH_PREFIX||target.pathname.startsWith(`${LAB_AUTH_PREFIX}/`)))throw labError('AUTH_LAB_TARGET_REJECTED');
  return target;
}

function mapGatewayPath(value){
  if(typeof value!=='string'||!value.startsWith('/'))throw labError('AUTH_LAB_TARGET_REJECTED');
  const target=authorizeClientUrl(`${LAB_ORIGIN}${value}`);
  const path=target.pathname.slice(LAB_AUTH_PREFIX.length)||'/';
  return `${path}${target.search}`;
}

function base32Bytes(secret){
  if(typeof secret!=='string')throw new TypeError('TOTP secret is required.');
  const normalized=secret.toUpperCase().replace(/=+$/,'');
  if(normalized.length===0||!/^[A-Z2-7]+$/.test(normalized))throw new TypeError('TOTP secret is invalid.');
  let bits=0;
  let value=0;
  const bytes=[];
  for(const character of normalized){
    const digit='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(character);
    value=(value<<5)|digit;
    bits+=5;
    if(bits>=8){
      bytes.push((value>>>(bits-8))&255);
      bits-=8;
    }
  }
  return Buffer.from(bytes);
}

function totpCode(secret,{timestampMs=Date.now(),digits=6,periodSeconds=30}={}){
  if(!Number.isFinite(timestampMs)||timestampMs<0||!Number.isInteger(digits)||digits<6||digits>8||
      !Number.isInteger(periodSeconds)||periodSeconds<1)throw new TypeError('TOTP parameters are invalid.');
  const counter=Math.floor(timestampMs/1000/periodSeconds);
  const message=Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest=crypto.createHmac('sha1',base32Bytes(secret)).update(message).digest();
  const offset=digest[digest.length-1]&15;
  const binary=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3];
  return String(binary%(10**digits)).padStart(digits,'0');
}

function nextTotpWaitMs(nowMs,previousCounter){
  if(!Number.isFinite(nowMs)||nowMs<0||!Number.isSafeInteger(previousCounter)||previousCounter<0)throw new TypeError('TOTP timing is invalid.');
  const currentCounter=Math.floor(nowMs/30_000);
  const targetMs=(Math.max(currentCounter,previousCounter)+1)*30_000+50;
  const waitMs=Math.max(0,Math.ceil(targetMs-nowMs));
  if(waitMs>31_000)throw labError('AUTH_LAB_WAIT_REJECTED');
  return waitMs;
}

function tamperJwtSignature(token){
  const parts=String(token).split('.');
  if(parts.length!==3||parts[2].length===0)throw new TypeError('JWT is invalid.');
  const replacement=parts[2][0]==='A'?'Q':'A';
  return `${parts[0]}.${parts[1]}.${replacement}${parts[2].slice(1)}`;
}

function validateLogoutRefreshRevocation({requests,logout,refresh}={}){
  const logoutRequest=requests?.[0];
  const refreshRequest=requests?.[1];
  const valid=Array.isArray(requests)&&requests.length===2&&
    logoutRequest?.method==='POST'&&logoutRequest.path==='/auth/v1/logout?scope=global'&&logoutRequest.status===204&&
    refreshRequest?.method==='POST'&&refreshRequest.path==='/auth/v1/token?grant_type=refresh_token'&&refreshRequest.status===400&&
    !logout?.error&&refresh?.error?.status===400&&refresh.error.code==='refresh_token_not_found'&&!refresh?.data?.session;
  if(!valid)throw labError('AUTH_LAB_REVOCATION_REJECTED');
  return Object.freeze({logoutStatus:204,refreshStatus:400});
}

function requestBody(body){
  if(body===undefined||body===null)return null;
  if(typeof body==='string'||Buffer.isBuffer(body))return body;
  if(body instanceof URLSearchParams)return body.toString();
  if(ArrayBuffer.isView(body))return Buffer.from(body.buffer,body.byteOffset,body.byteLength);
  if(body instanceof ArrayBuffer)return Buffer.from(body);
  throw labError('AUTH_LAB_REQUEST_REJECTED');
}

function createPinnedFetch({ca,onRequest=()=>{},timeoutMs=10_000}){
  if(!(typeof ca==='string'||Buffer.isBuffer(ca))||typeof onRequest!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)throw new TypeError('Pinned TLS configuration is required.');
  return async function pinnedFetch(rawUrl,init={}){
    const target=authorizeClientUrl(rawUrl);
    const method=String(init.method||'GET').toUpperCase();
    const headers=Object.fromEntries(new Headers(init.headers).entries());
    const body=requestBody(init.body);
    return await new Promise((resolve,reject)=>{
      let request;
      let response;
      let settled=false;
      let abortListener;
      const cleanup=()=>{
        clearTimeout(timer);
        if(abortListener&&typeof init.signal?.removeEventListener==='function')init.signal.removeEventListener('abort',abortListener);
      };
      const rejectOnce=error=>{
        if(settled)return;
        settled=true;
        cleanup();
        if(response&&!response.destroyed)response.destroy();
        if(request&&!request.destroyed)request.destroy();
        reject(error);
      };
      const resolveOnce=value=>{
        if(settled)return;
        settled=true;
        cleanup();
        resolve(value);
      };
      const timer=setTimeout(()=>rejectOnce(labError('AUTH_LAB_TIMEOUT')),timeoutMs);
      try{
        request=https.request(target,{method,headers,ca,rejectUnauthorized:true},incoming=>{
          if(settled){incoming.destroy();return;}
          response=incoming;
          const chunks=[];
          const status=incoming.statusCode||0;
          try{onRequest(Object.freeze({method,path:`${target.pathname}${target.search}`,status}));}
          catch{rejectOnce(labError('AUTH_LAB_REQUEST_REJECTED'));return;}
          incoming.on('data',chunk=>chunks.push(chunk));
          incoming.once('aborted',()=>rejectOnce(labError('AUTH_LAB_RESPONSE_ABORTED')));
          incoming.once('error',()=>rejectOnce(labError('AUTH_LAB_RESPONSE_ERROR')));
          incoming.once('end',()=>{
            if(incoming.complete===false){rejectOnce(labError('AUTH_LAB_RESPONSE_ABORTED'));return;}
            if(status>=300&&status<400){rejectOnce(labError('AUTH_LAB_REDIRECT_REJECTED'));return;}
            const payload=Buffer.concat(chunks);
            try{resolveOnce(new Response(payload.length===0?null:payload,{status,headers:incoming.headers}));}
            catch{rejectOnce(labError('AUTH_LAB_RESPONSE_ERROR'));}
          });
        });
        request.on('error',rejectOnce);
        if(init.signal){
          abortListener=()=>rejectOnce(labError('AUTH_LAB_ABORTED'));
          if(init.signal.aborted){abortListener();return;}
          init.signal.addEventListener('abort',abortListener,{once:true});
        }
        if(body!==null)request.write(body);
        request.end();
      }catch{
        rejectOnce(labError('AUTH_LAB_REQUEST_REJECTED'));
      }
    });
  };
}

async function startTlsGateway({cert,key,timeoutMs=10_000}){
  if(!(typeof cert==='string'||Buffer.isBuffer(cert))||!(typeof key==='string'||Buffer.isBuffer(key))||
      !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)throw new TypeError('Gateway TLS configuration is required.');
  const active=new Set();
  let closing=false;
  const server=https.createServer({cert,key},(incoming,outgoing)=>{
    if(closing){outgoing.writeHead(503);outgoing.end();return;}
    let upstreamPath;
    try{upstreamPath=mapGatewayPath(incoming.url||'');}
    catch{outgoing.writeHead(404);outgoing.end();return;}
    const state={settled:false,timer:null,upstream:null,response:null,terminate:null};
    const settle=()=>{
      if(state.settled)return false;
      state.settled=true;
      clearTimeout(state.timer);
      active.delete(state);
      return true;
    };
    const terminate=(status,destroyDownstream=true)=>{
      if(!settle())return;
      if(state.response&&!state.response.destroyed)state.response.destroy();
      if(state.upstream&&!state.upstream.destroyed)state.upstream.destroy();
      if(!destroyDownstream||outgoing.destroyed)return;
      if(status&&!outgoing.headersSent){outgoing.writeHead(status);outgoing.end();}
      else outgoing.destroy();
    };
    state.terminate=terminate;
    state.timer=setTimeout(()=>terminate(504),timeoutMs);
    active.add(state);
    incoming.once('aborted',()=>terminate(undefined));
    incoming.once('error',()=>terminate(undefined));
    outgoing.once('close',()=>terminate(undefined,false));
    outgoing.once('error',()=>terminate(undefined,false));
    try{
      state.upstream=http.request({host:UPSTREAM_HOST,port:UPSTREAM_PORT,path:upstreamPath,method:incoming.method,headers:incoming.headers},response=>{
        if(state.settled){response.destroy();return;}
        state.response=response;
        response.once('aborted',()=>terminate(undefined));
        response.once('error',()=>terminate(undefined));
        response.once('end',settle);
        try{
          outgoing.writeHead(response.statusCode||502,response.headers);
          response.pipe(outgoing);
        }catch{terminate(undefined);}
      });
      state.upstream.once('error',()=>terminate(502));
      incoming.pipe(state.upstream);
    }catch{terminate(502);}
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(54443,UPSTREAM_HOST,()=>{server.off('error',reject);resolve();});
  });
  let closePromise;
  return Object.freeze({close:()=>{
    if(closePromise)return closePromise;
    closing=true;
    for(const state of [...active])state.terminate(undefined);
    closePromise=new Promise((resolve,reject)=>{
      try{
        server.close(error=>error?reject(error):resolve());
        server.closeAllConnections?.();
      }catch(error){reject(error);}
    });
    return closePromise;
  }});
}

module.exports={LAB_ORIGIN,LAB_AUTH_PREFIX,authorizeClientUrl,createPinnedFetch,mapGatewayPath,nextTotpWaitMs,readLabConfiguration,startTlsGateway,tamperJwtSignature,totpCode,validateLogoutRefreshRevocation};
