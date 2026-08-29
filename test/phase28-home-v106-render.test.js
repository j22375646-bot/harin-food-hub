'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {registerHooks}=require('node:module');
const fs=require('node:fs');
const {fileURLToPath,pathToFileURL}=require('node:url');
const path=require('node:path');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {transformSync}=require('next/dist/build/swc');

registerHooks({
  load(url,context,nextLoad){
    if(url.endsWith('.css')){
      return {
        format:'module',
        shortCircuit:true,
        source:'export default new Proxy({}, {get:(_, key)=>String(key)});'
      };
    }
    if(url.includes('/app/_phase28/')&&url.endsWith('.js')){
      const filename=fileURLToPath(url);
      const transformed=transformSync(fs.readFileSync(filename,'utf8'),{
        filename,
        jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},
        module:{type:'es6'}
      });
      return {format:'module',shortCircuit:true,source:transformed.code};
    }
    return nextLoad(url,context);
  }
});

const pageUrl=pathToFileURL(path.resolve(__dirname,'../app/_phase28/pages/home-page.js')).href;

test('V106 Main renders the complete owner-approved executive desk',async()=>{
  const {default:Phase28HomePage}=await import(pageUrl);
  const html=renderToStaticMarkup(React.createElement(Phase28HomePage,{
    model:{
      hero:{taskCount:3,exceptionCount:1,summary:'운영 요약',note:'오후 우체국 방문',asOf:'2026-08-28T10:42:00+09:00'},
      metrics:{
        current:{value:60829400,status:'READY'},
        forecast:{value:72527360,status:'READY'},
        profit:{value:12634200,status:'READY'},
        target:{value:85000000,status:'READY'}
      },
      schedule:[{id:'shipping',time:'15:00',label:'출고 마감',status:'ACTIVE',view:'orders'}],
      decisions:[],growth:[],risks:[],channels:[],
      cashflow:{rows:[]},forecast:{days:[]},cashCalendar:[],changeEffects:[]
    }
  }));

  for(const label of [
    '오늘의 메모',
    '다음 운영 마감',
    '돈이 얼마나 남았나요?',
    '다음 7일 전망',
    '앞으로 7일 입출금',
    '변경 후 좋아진 것'
  ])assert.match(html,new RegExp(label));
  assert.match(html,/이번 달 실제 이익/);
  assert.match(html,/목표 85,000,000원/);
});
