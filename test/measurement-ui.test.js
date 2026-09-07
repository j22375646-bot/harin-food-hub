'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {registerHooks}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const {fileURLToPath,pathToFileURL}=require('node:url');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {transformSync}=require('next/dist/build/swc');

registerHooks({load(url,context,nextLoad){
  if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export default {};'};
  if(url.includes('/app/')&&url.endsWith('.js')){
    const filename=fileURLToPath(url);
    return {format:'module',shortCircuit:true,source:transformSync(fs.readFileSync(filename,'utf8'),{filename,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}}).code};
  }
  return nextLoad(url,context);
}});
const root=path.resolve(__dirname,'..');
const load=()=>import(pathToFileURL(path.join(root,'app/_phase28/pages/system-measurement-panel.js')).href);
const input={landingUrl:'https://harin.example/products/1',source:'naver',medium:'cpc',campaign:'가을 할인',campaignId:'fall-2026',creativeId:'',term:'',productId:''};

test('advertising form renders accessible inputs and requires inspection before saving',async()=>{
  const {MeasurementForm}=await load();
  const html=renderToStaticMarkup(React.createElement(MeasurementForm,{input,products:{available:false,items:[]}}));
  for(const label of ['랜딩 URL','유입 출처','매체','캠페인명','캠페인 ID','소재 ID','검색어','연결 상품'])assert.ok(html.includes(label),label);
  assert.match(html,/링크 검사/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>링크 저장/);
  assert.match(html,/상품 없이/);
  assert.equal((html.match(/required=""/g)||[]).length,5);
});

function nodes(element){
  if(element==null||typeof element!=='object')return [];
  return [element,...React.Children.toArray(element.props?.children).flatMap(nodes)];
}
test('preview renders the full selectable URL and form handlers preserve raw inputs',async()=>{
  const {MeasurementForm}=await load();
  const calls=[];
  const preview={url:'https://harin.example/?utm_campaign=%EA%B0%80%EC%9D%84',ruleVersion:'utm-v1',warnings:['개인정보를 입력하지 마세요.']};
  const props={input,preview,products:{available:true,items:[{id:'p1',name:'하린 상품'}]},onChange:(...args)=>calls.push(args),onPreview:()=>calls.push('preview'),onSave:()=>calls.push('save'),onCopy:url=>calls.push(url)};
  const tree=MeasurementForm(props);
  tree.props.onSubmit({preventDefault(){}});
  nodes(tree).find(node=>node.props.name==='campaign').props.onChange({target:{value:'  RAW 캠페인  '}});
  nodes(tree).find(node=>node.type==='button'&&node.props.children==='링크 저장').props.onClick();
  nodes(tree).find(node=>node.type==='button'&&node.props.children==='링크 복사').props.onClick();
  assert.deepEqual(calls,['preview',['campaign','  RAW 캠페인  '],'save',preview.url]);
  const html=renderToStaticMarkup(React.createElement(MeasurementForm,props));
  assert.ok(html.includes(preview.url));
  assert.match(html,/<textarea[^>]*readOnly=""/);
  assert.match(html,/개인정보를 입력하지/);
  assert.doesNotMatch(html,/<a |target="_blank"/);
});

test('history exposes original metadata, archive and restore callbacks, and load more',async()=>{
  const {MeasurementHistory}=await load();
  const active={id:'a',generated_url:input.landingUrl+'?utm_source=naver',normalized_input:input,campaign_id:'fall-2026',creative_id:'banner-01',product_id:'p1',created_at:'2026-09-07T01:00:00Z',archived_at:null};
  const archived={...active,id:'b',archived_at:'2026-09-07T02:00:00Z'};
  const calls=[];
  const props={links:[active,archived],products:{items:[{id:'p1',name:'하린 상품'}]},hasMore:true,onArchive:row=>calls.push(['archive',row.id]),onRestore:row=>calls.push(['restore',row.id]),onMore:()=>calls.push('more')};
  const html=renderToStaticMarkup(React.createElement(MeasurementHistory,props));
  for(const value of ['가을 할인','fall-2026','banner-01','하린 상품','naver','cpc','보관','복원','더 보기'])assert.ok(html.includes(value),value);
  const tree=MeasurementHistory(props);
  for(const label of ['보관','복원','더 보기'])nodes(tree).find(node=>node.type==='button'&&node.props.children===label).props.onClick();
  assert.deepEqual(calls,[['archive','a'],['restore','b'],'more']);
});

test('panel SSR is explicit about unverified GA4 and performs no API requests',async()=>{
  const {default:Panel}=await load();
  const original=global.fetch;
  let requests=0;
  global.fetch=()=>{requests++;throw new Error('SSR cannot fetch');};
  try{
    const html=renderToStaticMarkup(React.createElement(Panel));
    assert.match(html,/광고 링크 측정/);
    assert.match(html,/구매·환불/);
    assert.match(html,/확인 필요/);
    assert.match(html,/기존 UTM과 입력값이 다르면 검사를 통과할 수 없습니다/);
    assert.equal(requests,0);
  }finally{global.fetch=original;}
});

test('history keeps a missing timestamp visibly unknown',async()=>{
  const {MeasurementHistory}=await load();
  const html=renderToStaticMarkup(React.createElement(MeasurementHistory,{links:[{id:'missing',generated_url:input.landingUrl,normalized_input:input,created_at:null}]}));
  assert.match(html,/생성 시각 확인 필요/);
  assert.doesNotMatch(html,/1970/);
});

test('system lazily mounts measurement only in datasets and keeps four workspaces',()=>{
  const source=fs.readFileSync(path.join(root,'app/_phase28/pages/system-page.js'),'utf8');
  assert.match(source,/dynamic\(\(\)=>import\('\.\/system-measurement-panel\.js'\)\)/);
  assert.match(source,/workspace==='datasets'\?<><DatasetsPanel[^]*?<SystemMeasurementPanel\/><\/>:null/);
  assert.doesNotMatch(source,/\/api\/system\/measurement/);
  for(const workspace of ['connections','datasets','jobs','recovery'])assert.match(source,new RegExp(`id:'${workspace}'`));
  const css=fs.readFileSync(path.join(root,'app/_phase28/pages/system-measurement-panel.css'),'utf8');
  assert.match(css,/minmax\(0,1fr\)/);
  assert.match(css,/overflow-wrap:anywhere/);
  assert.doesNotMatch(css,/border-left\s*:|font-size:\s*(?:[0-9]|1[01])px|#[0-9a-f]{3,8}\b/i);
});

test('failed and pending history never claim an empty successful ledger',async()=>{
  const {MeasurementHistory,MeasurementForm}=await load();
  for(const props of [{failed:true},{loading:true}]){
    const html=renderToStaticMarkup(React.createElement(MeasurementHistory,props));
    assert.doesNotMatch(html,/표시할 링크가 없습니다/);
  }
  const tree=MeasurementForm({input:{...input,productId:'previous-product'},busy:'SAVE_LINK',products:{available:false,items:[]}});
  for(const node of nodes(tree).filter(node=>node.type==='input')){
    assert.equal(node.props.readOnly,true);
    assert.equal(node.props.disabled,undefined);
  }
  const idle=MeasurementForm({input:{...input,productId:'previous-product'},products:{available:false,items:[]}});
  assert.equal(nodes(idle).find(node=>node.type==='select').props.disabled,false);
  assert.match(renderToStaticMarkup(idle),/선택한 상품 · 확인 필요/);
});
