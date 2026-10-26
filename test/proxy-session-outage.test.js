'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {NextRequest,NextResponse}=require('next/server');
function handler(validateSession, timers={setTimeout,clearTimeout}){
 const source=fs.readFileSync(path.join(__dirname,'../proxy.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export async function proxy','async function proxy').replace('export const config','const config');
 return new Function('NextResponse','authModule','hubRoutesModule','setTimeout','clearTimeout',source+'\nreturn proxy;')(NextResponse,{COOKIE_NAME:'harin_dashboard_session',developmentAuthBypassEnabled:()=>false,validateSession},{canonicalLegacyHubHref:()=>null},timers.setTimeout,timers.clearTimeout);
}

test('a stalled provider is aborted at eight seconds without accepting a late identity',async()=>{
 let signal,finish,deadline,cleared=false;
 const proxy=handler(async(_token,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});},{setTimeout:(callback,ms)=>{deadline=ms;queueMicrotask(callback);return 1;},clearTimeout:()=>{cleared=true;}});
 const response=await proxy(new NextRequest('https://hub.example/api/moaon/team',{headers:{cookie:'harin_dashboard_session=opaque-test-session'}}));
 assert.equal(deadline,8000);assert.equal(signal.aborted,true);assert.equal(cleared,true);assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('x-middleware-next'),null);
 finish({userId:'late-identity',role:'OWNER'});await Promise.resolve();assert.equal(response.status,503);
});
test('session storage failure returns unavailable, never a false logout or forwarded identity',async()=>{
 const proxy=handler(async()=>{throw Object.assign(Error('private-provider-detail'),{code:'PGRST002'});});
 for(const url of ['https://hub.example/api/moaon/team','https://hub.example/orders']){
  const response=await proxy(new NextRequest(url,{headers:{cookie:'harin_dashboard_session=opaque-test-session'}}));
  assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('set-cookie'),null);assert.doesNotMatch(await response.text(),/private-provider-detail|opaque-test-session/);assert.equal(response.headers.get('x-middleware-next'),null);
 }
});
test('a confirmed expired session still requires authentication',async()=>{
 const response=await handler(async()=>null)(new NextRequest('https://hub.example/api/moaon/team',{headers:{cookie:'harin_dashboard_session=opaque-test-session'}}));assert.equal(response.status,401);
});
test('an outage on the public login form does not cause a redirect loop',async()=>{
 const response=await handler(async()=>{throw Error('outage');})(new NextRequest('https://hub.example/login',{headers:{cookie:'harin_dashboard_session=opaque-test-session'}}));assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('x-middleware-next'),'1');
});
