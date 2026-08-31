'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {registerHooks}=require('node:module');
const fs=require('node:fs');
const {fileURLToPath,pathToFileURL}=require('node:url');
const path=require('node:path');
const {transformSync}=require('next/dist/build/swc');

registerHooks({
  resolve(specifier,context,nextResolve){
    const mapped=specifier==='next/navigation'?'next/navigation.js':specifier==='next/image'?'next/image.js':specifier;
    return nextResolve(mapped,context);
  },
  load(url,context,nextLoad){
    if(url.endsWith('.css'))return {format:'module',shortCircuit:true,source:'export default {};'};
    if(url.includes('/app/')&&url.endsWith('.js')){
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

const pageUrl=pathToFileURL(path.resolve(__dirname,'../app/_phase28/pages/orders-page.js')).href;

test('clicking an order row sends that exact order to the right-rail preview',async()=>{
  const {OrderRow}=await import(pageUrl);
  const order={hubOrderId:'HR-NV-SECOND',productName:'두 번째 주문',platform:'NAVER',receiver:{},items:[],selectionEligible:false};
  let previewed=null;
  const row=OrderRow({order,selected:false,previewed:false,onSelect:()=>{},onPreview:item=>{previewed=item;}});

  row.props.onClick();

  assert.equal(previewed,order);
});
