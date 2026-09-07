'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {registerHooks}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const {fileURLToPath,pathToFileURL}=require('node:url');
const {transformSync}=require('next/dist/build/swc');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');

registerHooks({
  resolve(specifier,context,next){return next(specifier==='next/navigation'?'next/navigation.js':specifier,context);},
  load(url,context,next){
    if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export default {};'};
    if(url.includes('/app/')&&url.endsWith('.js')){
      const filename=fileURLToPath(url);
      return {format:'module',shortCircuit:true,source:transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code};
    }
    return next(url,context);
  }
});

test('CS rail renders a body once when its conversation already contains the same text', async () => {
  const { CsRail } = await import(pathToFileURL(path.resolve(__dirname, '../app/_phase28/pages/cs-page.js')).href);
  const row = {
    id: 'c1', platform: 'COUPANG', kind: 'INQUIRY', title: '배송 문의', content: '같은 문의 본문',
    source: { inquiryType: 'CALL_CENTER', conversation: [{ answerId: '20', answerType: 'csAgent', content: '같은 문의 본문' }] },
  };
  const props = { row, activeTab: 'message', draft: '', templates: [], replyBy: '', busy: false };
  const repeated = renderToStaticMarkup(React.createElement(CsRail, props));
  assert.equal((repeated.match(/같은 문의 본문/g) || []).length, 1);
  assert.match(repeated, /문의 대화 이력/);

  const distinct = renderToStaticMarkup(React.createElement(CsRail, {
    ...props, row: { ...row, content: '별도의 문의 본문' },
  }));
  assert.match(distinct, /별도의 문의 본문/);
  assert.match(distinct, /같은 문의 본문/);
});

test('CS rail shows conversation text and locks actual send until the current target is verified',async()=>{
  const {CsRail}=await import(pathToFileURL(path.resolve(__dirname,'../app/_phase28/pages/cs-page.js')).href);
  const row={id:'c1',platform:'COUPANG',kind:'INQUIRY',title:'배송 문의',content:'추가 확인 요청',source:{inquiryType:'CALL_CENTER',parentAnswerId:'20',replyRequired:true,canReply:true,statusVerified:false,conversation:[{answerId:'10',answerType:'vendor',replyAt:'2026-09-07T09:00:00Z',content:'이전 판매자 답변'}]}};
  const props={row,activeTab:'compose',draft:'답변입니다.',templates:[],replyBy:'wing-user',busy:false};
  const locked=renderToStaticMarkup(React.createElement(CsRail,props));
  assert.match(locked,/이전 판매자 답변/);
  assert.match(locked,/고객센터 문의 상태를 확인하지 못했습니다/);
  assert.match(locked,/<button[^>]*disabled=""[^>]*>확인 후 실제 전송<\/button>/);
  const ready=renderToStaticMarkup(React.createElement(CsRail,{...props,row:{...row,source:{...row.source,statusVerified:true}}}));
  assert.doesNotMatch(ready,/<button[^>]*disabled=""[^>]*>확인 후 실제 전송<\/button>/);
});
