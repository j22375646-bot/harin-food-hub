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

function requestBody(body){
  if(body===undefined||body===null)return null;
  if(typeof body==='string'||Buffer.isBuffer(body))return body;
  if(body instanceof URLSearchParams)return body.toString();
  if(ArrayBuffer.isView(body))return Buffer.from(body.buffer,body.byteOffset,body.byteLength);
  if(body instanceof ArrayBuffer)return Buffer.from(body);
  throw labError('AUTH_LAB_REQUEST_REJECTED');
}

function createPinnedFetch({ca,onRequest=()=>{}}){
  if(!(typeof ca==='string'||Buffer.isBuffer(ca))||typeof onRequest!=='function')throw new TypeError('Pinned TLS configuration is required.');
  return async function pinnedFetch(rawUrl,init={}){
    const target=authorizeClientUrl(rawUrl);
    const method=String(init.method||'GET').toUpperCase();
    const headers=Object.fromEntries(new Headers(init.headers).entries());
    const body=requestBody(init.body);
    return await new Promise((resolve,reject)=>{
      const request=https.request(target,{method,headers,ca,rejectUnauthorized:true},response=>{
        const chunks=[];
        response.on('data',chunk=>chunks.push(chunk));
        response.on('end',()=>{
          const status=response.statusCode||0;
          onRequest(Object.freeze({method,path:`${target.pathname}${target.search}`,status}));
          if(status>=300&&status<400){reject(labError('AUTH_LAB_REDIRECT_REJECTED'));return;}
          const payload=Buffer.concat(chunks);
          resolve(new Response(payload.length===0?null:payload,{status,headers:response.headers}));
        });
      });
      request.on('error',reject);
      if(init.signal){
        if(init.signal.aborted){request.destroy(labError('AUTH_LAB_ABORTED'));return;}
        init.signal.addEventListener('abort',()=>request.destroy(labError('AUTH_LAB_ABORTED')),{once:true});
      }
      if(body!==null)request.write(body);
      request.end();
    });
  };
}

async function startTlsGateway({cert,key}){
  if(!(typeof cert==='string'||Buffer.isBuffer(cert))||!(typeof key==='string'||Buffer.isBuffer(key)))throw new TypeError('Gateway TLS configuration is required.');
  const server=https.createServer({cert,key},(incoming,outgoing)=>{
    let upstreamPath;
    try{upstreamPath=mapGatewayPath(incoming.url||'');}
    catch{outgoing.writeHead(404);outgoing.end();return;}
    const upstream=http.request({host:UPSTREAM_HOST,port:UPSTREAM_PORT,path:upstreamPath,method:incoming.method,headers:incoming.headers},response=>{
      outgoing.writeHead(response.statusCode||502,response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});
    incoming.pipe(upstream);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(54443,UPSTREAM_HOST,()=>{server.off('error',reject);resolve();});
  });
  return Object.freeze({
    close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),
  });
}

module.exports={LAB_ORIGIN,LAB_AUTH_PREFIX,authorizeClientUrl,createPinnedFetch,mapGatewayPath,nextTotpWaitMs,readLabConfiguration,startTlsGateway,tamperJwtSignature,totpCode};
