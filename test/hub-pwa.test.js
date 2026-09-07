'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function manifest(){
  const source=read('app/manifest.js').replace(/export default function manifest/u,'function manifest');
  const context=vm.createContext({});
  vm.runInContext(`${source}\nglobalThis.value=manifest();`,context,{filename:'app/manifest.js'});
  return structuredClone(context.value);
}
function layoutMetadata(){
  const match=read('app/layout.js').match(/export const metadata\s*=\s*(\{[\s\S]*?\});\s*\n\s*const themeBootstrap/u);
  assert.ok(match,'layout metadata must remain statically evaluable');
  const context=vm.createContext({});
  vm.runInContext(`globalThis.value=${match[1]}`,context);
  return structuredClone(context.value);
}
function pngSize(file){
  const value=fs.readFileSync(path.join(root,file));
  assert.equal(value.subarray(1,4).toString('ascii'),'PNG');
  assert.equal(value.subarray(12,16).toString('ascii'),'IHDR');
  return [value.readUInt32BE(16),value.readUInt32BE(20)];
}
function workerHarness({fetchImpl=async()=>new Response('online'),failInstall=false}={}){
  const handlers=new Map(),addAllCalls=[],stored=new Map();
  let puts=0;
  const cache={
    async addAll(urls){addAllCalls.push([...urls]);if(failInstall)throw new Error('cache unavailable');for(const url of urls)stored.set(url,new Response(read(`public${url}`),{status:200}));},
    async match(url){return stored.get(url)?.clone();},
    async put(){puts+=1;throw new Error('runtime cache forbidden');}
  };
  const activation={skipWaiting:0,claim:0};
  const context=vm.createContext({URL,Response,Headers,Promise,fetch:fetchImpl,caches:{open:async()=>cache},self:{
    location:{origin:'https://hub.example'},
    skipWaiting(){activation.skipWaiting+=1;},clients:{claim(){activation.claim+=1;}},
    addEventListener(type,handler){handlers.set(type,handler);}
  }});
  vm.runInContext(read('public/hub-sw.js'),context,{filename:'public/hub-sw.js'});
  return {handlers,addAllCalls,activation,get puts(){return puts;},
    async install(){let promise;handlers.get('install')?.({waitUntil(value){promise=Promise.resolve(value);}});await promise;},
    async fetch(request){let promise;handlers.get('fetch')?.({request,respondWith(value){promise=Promise.resolve(value);}});return promise?{handled:true,response:await promise}:{handled:false};}
  };
}
function nav(pathname='/',overrides={}){
  return {method:'GET',url:`https://hub.example${pathname}`,mode:'navigate',destination:'document',...overrides,headers:new Headers({accept:'text/html',...(overrides.headers||{})})};
}
function registration({environment='production',useEffect=()=>{}}={}){
  const source=read('app/_pwa/pwa-registration.js')
    .replace(/^['"]use client['"];?\s*/u,'')
    .replace(/import\s*\{\s*useEffect\s*\}\s*from\s*['"]react['"];?/u,'const {useEffect}=deps;')
    .replace(/export function scheduleHubServiceWorker/u,'function scheduleHubServiceWorker')
    .replace(/export default function PwaRegistration/u,'function PwaRegistration');
  const context=vm.createContext({deps:{useEffect},process:{env:{NODE_ENV:environment}},Promise,setTimeout,clearTimeout});
  vm.runInContext(`${source}\nglobalThis.value={scheduleHubServiceWorker,PwaRegistration};`,context,{filename:'pwa-registration.js'});
  return context.value;
}
function proxyModule(){
  const source=read('proxy.js')
    .replace("import { NextResponse } from 'next/server';",'const {NextResponse}=deps;')
    .replace("import authModule from './lib/dashboard-auth.js';",'const {authModule}=deps;')
    .replace("import hubRoutesModule from './lib/navigation/hub-routes.js';",'const {hubRoutesModule}=deps;')
    .replace(/export async function proxy/u,'async function proxy').replace(/export const config/u,'const config');
  let checks=0;
  const context=vm.createContext({URL,Headers,deps:{
    NextResponse:{next:()=>({kind:'next'}),redirect:(url,status=307)=>({kind:'redirect',url:String(url),status}),json:(body,init)=>({kind:'json',body,...init})},
    authModule:{COOKIE_NAME:'session',developmentAuthBypassEnabled:()=>false,async validateSession(){checks+=1;return null;}},
    hubRoutesModule:{canonicalLegacyHubHref:()=>null}
  }});
  vm.runInContext(`${source}\nglobalThis.value=proxy;`,context,{filename:'proxy.js'});
  return {proxy:context.value,get checks(){return checks;}};
}
function proxyRequest(pathname){const nextUrl=new URL(pathname,'https://hub.example');return {nextUrl,url:nextUrl.href,method:'GET',headers:new Headers(),cookies:{get:()=>undefined}};}

test('manifest has stable standalone identity and correctly sized install icons',()=>{
  const value=manifest();
  assert.deepEqual({id:value.id,start:value.start_url,scope:value.scope,name:value.name,short:value.short_name,lang:value.lang,display:value.display,background:value.background_color,theme:value.theme_color},{id:'/',start:'/',scope:'/',name:'하린식품 허브',short:'하린허브',lang:'ko',display:'standalone',background:'#f7f4ff',theme:'#6f63bd'});
  assert.deepEqual(value.icons,[{src:'/icons/hub-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/hub-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]);
  assert.deepEqual(pngSize('public/icons/hub-icon-192.png'),[192,192]);
  assert.deepEqual(pngSize('public/icons/hub-icon-512.png'),[512,512]);
  assert.deepEqual(pngSize('public/icons/hub-apple-touch-180.png'),[180,180]);
});
test('layout adds manifest and Apple metadata without changing title',()=>{
  const value=layoutMetadata();
  assert.equal(value.title,'하린식품 광고·매출 진단 허브');
  assert.equal(value.manifest,'/manifest.webmanifest');
  assert.deepEqual(value.icons.apple,[{url:'/icons/hub-apple-touch-180.png',sizes:'180x180',type:'image/png'}]);
  assert.deepEqual(value.appleWebApp,{capable:true,title:'하린허브',statusBarStyle:'default'});
});
test('worker precaches only public explanation without forcing activation',async()=>{
  const value=workerHarness();await value.install();
  assert.deepEqual(value.addAllCalls,[['/hub-offline-v1.html']]);
  assert.deepEqual(value.activation,{skipWaiting:0,claim:0});assert.equal(value.handlers.has('activate'),false);assert.equal(value.puts,0);
});
test('worker falls back on rejected document navigation only',async()=>{
  const value=workerHarness({fetchImpl:async()=>{throw new TypeError('offline');}});
  await value.install();
  const result=await value.fetch(nav('/orders?tab=paid'));
  assert.equal(result.handled,true);assert.equal(result.response.status,200);
  const html=await result.response.text();
  assert.match(html,/데이터를 새로고침할 수 없습니다/u);assert.match(html,/배송·환불·기타 변경 작업은 인터넷 연결이 필요합니다/u);assert.match(html,/href="\/"/u);assert.equal(value.puts,0);
});
test('worker returns successful and HTTP error documents unchanged without caching',async()=>{
  for(const status of [200,401,403,500]){const response=new Response(`network-${status}`,{status});const value=workerHarness({fetchImpl:async()=>response});const result=await value.fetch(nav('/private'));assert.equal(result.response,response);assert.equal(await result.response.text(),`network-${status}`);assert.equal(value.puts,0);}
});
test('document navigation requests fresh data without using the browser HTTP cache',async()=>{
  const request=nav('/orders');let received,options;
  const value=workerHarness({fetchImpl:async(input,init)=>{received=input;options=init;return new Response('fresh');}});
  await value.fetch(request);
  assert.equal(received,request);assert.equal(options?.cache,'no-store');
});
test('worker leaves API, RSC, non-document, external and every mutation untouched',async()=>{
  let network=0;const value=workerHarness({fetchImpl:async()=>{network+=1;return new Response('bad');}});
  const requests=[nav('/api'),nav('/api/orders'),nav('/orders',{headers:{RSC:'1'}}),nav('/orders?_rsc=abc'),nav('/orders',{headers:{accept:'text/x-component'}}),nav('/orders',{mode:'cors',destination:''}),nav('/_next/static/a.js',{mode:'cors',destination:'script'}),{...nav('/orders'),url:'https://external.example/orders'},...['POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(method=>nav('/orders',{method}))];
  for(const request of requests)assert.equal((await value.fetch(request)).handled,false,`${request.method} ${request.url}`);
  assert.equal(network,0);assert.equal(value.puts,0);
});
test('worker installation cache failure is fail-safe',async()=>{const value=workerHarness({failInstall:true});await assert.doesNotReject(()=>value.install());assert.deepEqual(value.activation,{skipWaiting:0,claim:0});});
test('registration waits for load and idle, fails safely, cleans up, and stays production-only',async()=>{
  const {scheduleHubServiceWorker,PwaRegistration}=registration();const listeners=new Map(),removed=[],idles=new Map(),cancelled=[],calls=[];
  const windowObject={document:{readyState:'loading'},addEventListener(type,handler,options){listeners.set(type,{handler,options});},removeEventListener(type,handler){removed.push([type,handler]);},requestIdleCallback(handler){idles.set(17,handler);return 17;},cancelIdleCallback(id){cancelled.push(id);},location:{reload(){throw new Error('no reload');}}};
  const navigatorObject={serviceWorker:{register(url,options){calls.push([url,structuredClone(options)]);return Promise.reject(new Error('unavailable'));}}};
  const cleanup=scheduleHubServiceWorker({windowObject,navigatorObject});assert.equal(calls.length,0);assert.equal(listeners.get('load').options.once,true);listeners.get('load').handler();assert.equal(calls.length,0);idles.get(17)();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,[['/hub-sw.js',{scope:'/',updateViaCache:'none'}]]);cleanup();assert.deepEqual(removed,[['load',listeners.get('load').handler]]);assert.deepEqual(cancelled,[17]);
  let effect;const component=registration({useEffect(setup){effect=setup;}}).PwaRegistration;assert.equal(component(),null);assert.equal(typeof effect,'function');
  const development=registration({environment:'development'});assert.equal(development.scheduleHubServiceWorker({windowObject,navigatorObject})(),undefined);assert.equal(calls.length,1);
});
test('exact manifest and offline routes are public while private pages require auth',async()=>{
  const value=proxyModule();for(const pathname of ['/manifest.webmanifest','/hub-offline-v1.html'])assert.equal((await value.proxy(proxyRequest(pathname))).kind,'next');
  const result=await value.proxy(proxyRequest('/orders?tab=paid'));assert.equal(result.kind,'redirect');assert.equal(result.url,'https://hub.example/login?next=%2Forders%3Ftab%3Dpaid');assert.equal(value.checks,0);
  for(const pathname of ['/manifest.webmanifest/private','/hub-offline-v1.html/private'])assert.equal((await value.proxy(proxyRequest(pathname))).kind,'redirect');
  assert.equal((await value.proxy(proxyRequest('/api/orders'))).status,401);
});
test('offline without an installed explanation preserves the original network failure',async()=>{
  const error=new TypeError('network unavailable');
  const value=workerHarness({failInstall:true,fetchImpl:async()=>{throw error;}});
  await value.install();
  await assert.rejects(()=>value.fetch(nav('/orders')),actual=>actual===error);
});
test('registration cleanup prevents late load, idle and timeout registration',()=>{
  const {scheduleHubServiceWorker}=registration();let callback,load,calls=0,cleared;
  const navigatorObject={serviceWorker:{register(){calls+=1;}}};
  const windowObject={document:{readyState:'loading'},addEventListener(type,handler){load=handler;},removeEventListener(){},setTimeout(handler){callback=handler;return 8;},clearTimeout(id){cleared=id;}};
  const beforeLoad=scheduleHubServiceWorker({windowObject,navigatorObject});beforeLoad();load();assert.equal(callback,undefined);
  windowObject.document.readyState='complete';
  const beforeTimeout=scheduleHubServiceWorker({windowObject,navigatorObject});beforeTimeout();assert.equal(cleared,8);callback();assert.equal(calls,0);
  windowObject.requestIdleCallback=handler=>{callback=handler;return 9;};windowObject.cancelIdleCallback=id=>{cleared=id;};
  const beforeIdle=scheduleHubServiceWorker({windowObject,navigatorObject});beforeIdle();assert.equal(cleared,9);callback();assert.equal(calls,0);
  assert.doesNotThrow(()=>scheduleHubServiceWorker({windowObject,navigatorObject:{}})());
});
test('Next headers keep worker fresh and cache only versioned offline HTML immutably',async()=>{
  const rules=await require('../next.config.js').headers();const worker=rules.find(rule=>rule.source==='/hub-sw.js'),offline=rules.find(rule=>rule.source==='/hub-offline-v1.html');
  assert.equal(worker.headers.find(item=>item.key==='Content-Type').value,'application/javascript; charset=utf-8');assert.equal(worker.headers.find(item=>item.key==='Cache-Control').value,'no-cache, no-store, must-revalidate');assert.equal(offline.headers.find(item=>item.key==='Cache-Control').value,'public, max-age=31536000, immutable');
});
