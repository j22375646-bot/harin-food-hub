'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {transformSync}=require('next/dist/build/swc');

const root=path.resolve(__dirname,'..');
const brandPath=path.join(root,'lib/brand.js');
const brand=fs.existsSync(brandPath)?require(brandPath):{};
const css=new Proxy({}, {get:(_,key)=>String(key)});
const inert=new Proxy(function(){return null;},{get:()=>inert});
const jsxRuntime=require('react/jsx-runtime');
function loadOwned(file,dependencies={}){
  const filename=path.join(root,file);
  const code=transformSync(fs.readFileSync(filename,'utf8'),{
    filename,
    jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},
    module:{type:'commonjs'}
  }).code;
  const module={exports:{}};
  const localRequire=specifier=>{
    if(specifier==='react/jsx-runtime')return jsxRuntime;
    if(specifier==='react')return React;
    if(specifier.endsWith('/lib/brand.js')||specifier.endsWith('../lib/brand.js'))return brand;
    if(specifier.endsWith('.css'))return css;
    if(Object.hasOwn(dependencies,specifier))return dependencies[specifier];
    return inert;
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})(require,module,module.exports)`,{require:localRequire,module,exports:module.exports},{filename});
  return module.exports;
}

test('manifest and layout expose the MOAON product identity while preserving install identity',async()=>{
  const {default:manifest}=loadOwned('app/manifest.js');
  const {metadata}=loadOwned('app/layout.js');
  const installed=manifest();
  assert.deepEqual(
    {id:installed.id,start:installed.start_url,scope:installed.scope,name:installed.name,short:installed.short_name},
    {id:'/',start:'/',scope:'/',name:'모아온',short:'모아온'}
  );
  assert.equal(installed.description,'모아온 · 사업 운영 허브');
  assert.equal(metadata.title,'모아온 · 사업 운영 허브');
  assert.equal(metadata.appleWebApp.title,'모아온');
  assert.equal(metadata.manifest,'/manifest.webmanifest');
});

test('login renders MOAON as the product with equal-account password access',async()=>{
  const {default:LoginPage}=loadOwned('app/login/page.js',{
    'next/headers':{cookies:async()=>({get:()=>undefined})},
    'next/navigation':{redirect:path=>{throw new Error(`unexpected redirect ${path}`);}},
    '../../lib/dashboard-auth.js':{COOKIE_NAME:'harin_dashboard_session',validateSession:async()=>null},
    '../_design-system/harin-icon.js':{HarinIcon:()=>React.createElement('i')},
    './login-form.js':{LoginForm:()=>React.createElement('form',{action:'/api/dashboard/login',method:'post'},React.createElement('input',{name:'password',type:'password'}))}
  });
  const html=renderToStaticMarkup(await LoginPage({searchParams:Promise.resolve({})}));
  assert.match(html,/>M<\/span>/u);
  assert.match(html,/<b>모아온<\/b><small>사업 운영 허브<\/small>/u);
  assert.match(html,/MOAON DAILY DESK/u);
  assert.match(html,/로그인할 사람을 선택하고 비밀번호를 입력해주세요\./u);
});

test('current and fallback shells render product and Harin Food business as separate identities',async()=>{
  const {Phase28Brand}=loadOwned('app/_phase28/phase28-shell.js');
  const {HarinTopbar}=loadOwned('app/_shell/harin-app-shell.js',{
    '../../lib/ui/brand-system.js':{resolveStatusTone:value=>value,resolvePageTone:()=>''},
    '../../lib/ui/sidebar-collapse.js':{resolveSidebarGroupAction:()=>({})},
    '../_design-system/harin-icon.js':{HarinIcon:()=>React.createElement('i')}
  });
  const current=renderToStaticMarkup(React.createElement(Phase28Brand));
  assert.match(current,/>M<\/span>/u);
  assert.match(current,/<strong>모아온<\/strong><small>사업 운영 허브<\/small>/u);
  assert.match(current,/하린식품 사업장/u);

  const fallback=renderToStaticMarkup(React.createElement(HarinTopbar,{
    context:{group:{label:'운영'},item:{label:'오늘'}},connectionLabel:'확인 필요',fontScale:'large',onFontScale(){},syncing:false,onSync(){}
  }));
  assert.match(fallback,/>M<\/span>/u);
  assert.match(fallback,/<b>모아온<\/b><small>사업 운영 허브<\/small>/u);
  assert.match(fallback,/하린식품 사업장/u);
});
