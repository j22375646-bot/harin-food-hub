'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {_electron}=require('playwright');
(async()=>{
 const visible=process.argv.includes('--visible-demo'),installed=process.argv.includes('--installed-package'),baseline=process.argv.includes('--baseline');
 const root=installed?path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','resources','app.asar'):path.resolve(__dirname,'..');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'moaon-alignment-'));
 const app=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],env:{...process.env,MOAON_TEST_RUNTIME_ROOT:root,MOAON_TEST_PROFILE:profile,MOAON_TEST_HIDDEN:visible?'0':'1',MOAON_TEST_DISPLAY:visible?'right':''}});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>document.querySelector('#entry-status')?.textContent&&!document.querySelector('#entry-status').textContent.includes('확인하고 있습니다'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{document.querySelector('#entry-screen').hidden=true;const shell=document.querySelector('.preview-shell');shell.hidden=false;shell.inert=false;});
  if(visible){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setTitle('모아온 · UI 정렬 검증 · 시험 자료'));await page.evaluate(()=>{const banner=document.createElement('div');banner.textContent='UI 정렬 확인 · 시험 자료 · 실제 저장 실행 없음';Object.assign(banner.style,{position:'fixed',bottom:'24px',right:'24px',zIndex:'99999',padding:'8px 12px',background:'#172554',color:'#fff',borderRadius:'8px',fontSize:'13px'});document.body.append(banner);});}
  for(const width of visible?[1040]:[1040,1440,2200]){
   if(!visible)await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,1000),width);
   for(const name of ['settings','orders','calendar']){
    await page.evaluate(name=>{
     document.querySelectorAll('main [data-page]').forEach(el=>{el.hidden=el.dataset.page!==name;el.classList.toggle('is-visible',el.dataset.page===name);});
     document.querySelectorAll('[data-route]').forEach(el=>{el.classList.toggle('is-active',el.dataset.route===name);if(el.dataset.route===name)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
     if(name==='settings'){
      document.querySelector('#api-source').value='owned';
      document.querySelector('#api-draft-form').hidden=false;document.querySelector('#api-owned-business').hidden=false;document.querySelector('#api-existing').hidden=true;
      document.querySelector('#api-server-controls').hidden=false;document.querySelector('#api-server-confirm').hidden=false;
      document.querySelector('#api-tenant').innerHTML='<option>정렬 확인용 시험 사업장</option>';
      document.querySelector('#api-server-confirm-summary').textContent='시험 화면 · 실제 저장 요청 없음';
      document.querySelector('#api-settings').scrollIntoView({block:'start'});
     }else document.querySelector(`main [data-page="${name}"] h1`).scrollIntoView({block:'start'});
    },name);
    if(!baseline){
     const geometry=await page.evaluate(name=>{
      const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
      const active=document.querySelector(`main [data-page="${name}"]`);
      return {overflow:active.scrollWidth>active.clientWidth+1,boxes:Object.fromEntries((name==='settings'?['api-tenant','api-business-refresh','api-server-read','api-server-save','api-server-cancel','api-server-confirm-save']:name==='orders'?['order-search','order-channel','order-tools-reset']:['month-refresh','month-prev','month-next','month-today']).map(id=>[id,box(id)])),header:name==='calendar'?document.querySelector('.month-heading').contains(document.getElementById('month-refresh')):null};
     },name);
     assert.equal(geometry.overflow,false,`${name} overflow at ${width}`);
     const b=geometry.boxes;
     if(name==='settings'){
      assert.ok(Math.abs(b['api-tenant'].bottom-b['api-business-refresh'].bottom)<=1,'business picker and refresh baseline');
      assert.ok(b['api-server-save'].x>b['api-server-read'].x,'save anchored after read');
      assert.ok(b['api-server-confirm-save'].x>b['api-server-cancel'].x,'cancel precedes confirmation');
      assert.equal(b['api-server-confirm-save'].h,b['api-server-cancel'].h);
     }else if(name==='calendar'){assert.equal(geometry.header,true);assert.equal(b['month-prev'].h,b['month-next'].h);assert.ok(b['month-refresh'].h>=40);}
     else assert.ok(Math.abs(b['order-channel'].h-b['order-tools-reset'].h)<=1);
    }
    if(visible){
     await new Promise(resolve=>setTimeout(resolve,800));
     const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
     fs.writeFileSync(path.join(os.tmpdir(),`moaon-alignment-${baseline?'before':'after'}-${name}-${width}.png`),Buffer.from(png,'base64'));
    }
    if(visible)await new Promise(resolve=>setTimeout(resolve,2500));
   }
  }
  assert.deepEqual(errors,[]);
  if(visible){const placement=await app.evaluate(({BrowserWindow,screen})=>{const w=BrowserWindow.getAllWindows()[0],b=w.getBounds(),d=screen.getDisplayMatching(b),p=screen.getPrimaryDisplay();return {focused:w.isFocused(),right:d.id!==p.id&&d.workArea.x>=p.workArea.x+p.workArea.width,contained:b.x>=d.workArea.x&&b.y>=d.workArea.y&&b.x+b.width<=d.workArea.x+d.workArea.width&&b.y+b.height<=d.workArea.y+d.workArea.height};});assert.deepEqual(placement,{focused:false,right:true,contained:true});}
  console.log(JSON.stringify({status:'PASS',scope:'synthetic UI layout; no writes',installed,visible,widths:visible?[1040]:[1040,1440,2200]}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
