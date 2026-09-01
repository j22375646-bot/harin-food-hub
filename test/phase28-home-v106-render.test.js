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

test('V106 Main mounts the monthly goal dialog inside the Phase 28 theme root',()=>{
  const pageSource=fs.readFileSync(path.resolve(__dirname,'../app/_phase28/pages/home-page.js'),'utf8');
  const shellSource=fs.readFileSync(path.resolve(__dirname,'../app/_phase28/phase28-shell.js'),'utf8');

  assert.match(shellSource,/data-phase28-root="true"/);
  assert.match(pageSource,/document\.querySelector\('\[data-phase28-root="true"\]'\)/);
  assert.match(pageSource,/createPortal\(content,portalTarget\)/);
  assert.doesNotMatch(pageSource,/createPortal\(content,document\.body\)/);
});

test('V106 Main keeps the calendar memo divider straight inside the rounded card',()=>{
  const css=fs.readFileSync(path.resolve(__dirname,'../app/_phase28/pages/home-page.module.css'),'utf8');
  const rowRule=css.match(/\.todayCalendarList>button\{([^}]*)\}/)?.[1]||'';

  assert.match(rowRule,/border-right:1px solid var\(--p28-line\)/);
  assert.match(rowRule,/border-radius:0/);
});

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
      calendar:{items:[{id:'memo-1',type:'MEMO',title:'택배 상자 주문',body:'오후 확인',date:'2026-08-28',status:'OPEN'}]},
      decisions:[],growth:[],risks:[],channels:[],
      cashflow:{rows:[]},forecast:{
        actualRevenue:1_260_000,
        actualDays:[{date:'2026-08-22',revenue:120_000},{date:'2026-08-23',revenue:180_000}],
        expectedRevenue:1_400_000,
        days:[{date:'2026-08-29',revenue:200_000},{date:'2026-08-30',revenue:200_000}],
        status:'PARTIAL',basis:'최근 2일 결제 주문 평균을 단순 연장한 예상값'
      },cashCalendar:[],changeEffects:[]
    }
  }));

  for(const label of [
    '오늘 운영 신호',
    '이번 달 운영 흐름',
    '오늘의 메모',
    '다음 운영 마감',
    '오늘 일정과 판매 이벤트',
    '택배 상자 주문',
    '돈이 얼마나 남았나요?',
    '최근 7일 실제 매출',
    '다음 7일 전망',
    '앞으로 7일 입출금',
    '변경 후 좋아진 것'
  ])assert.match(html,new RegExp(label));
  assert.match(html,/data-main-layout="daily-desk"/);
  assert.match(html,/이번 달 실제 이익/);
  assert.match(html,/목표 85,000,000원/);
  assert.match(html,/월 목표 수정/);
  assert.doesNotMatch(html,/role="progressbar"/);
});

test('V106 Main gives a direct goal-setting action when the monthly target is missing',async()=>{
  const {default:Phase28HomePage}=await import(pageUrl);
  const html=renderToStaticMarkup(React.createElement(Phase28HomePage,{
    model:{
      hero:{taskCount:0,exceptionCount:0,summary:'운영 요약',asOf:'2026-08-31T10:42:00+09:00'},
      metrics:{
        current:{value:8_327_610,status:'READY',asOf:'2026-08-31T10:42:00+09:00'},
        forecast:{value:8_327_610,status:'PARTIAL'},
        profit:{value:null,status:'BLOCKED'},
        target:{value:null,status:'BLOCKED'}
      },
      schedule:[],decisions:[],growth:[],risks:[],channels:[],cashflow:{rows:[]},forecast:{days:[]},cashCalendar:[]
    }
  }));

  assert.match(html,/이번 달 목표 설정/);
  assert.match(html,/저장하면 월 매출과 예상치를 자동으로 다시 계산해요/);
  assert.doesNotMatch(html,/goalRunway/);
});
