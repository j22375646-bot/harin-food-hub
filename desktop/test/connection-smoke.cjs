'use strict';
// Real Electron/IPC; only the external HTTP transport is synthetic.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
const root=path.resolve(__dirname,'..');
const packaged=process.argv.includes('--packaged');
const override=process.argv.indexOf('--executable');
const executablePath=override>=0?process.argv[override+1]:packaged?path.join(root,'dist/win-unpacked/MoaonPreview.exe'):require('electron');
async function main(){
  const app=await launchDesktop({root,executablePath,packaged,override});
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.moaonHub||{}).sort()),['connect','disconnect','nextPage','previousPage','recheckPage','refresh','viewActive','viewCompleted','viewInTransit','viewRegistered']);
    assert.equal(await page.evaluate(()=>typeof require),'undefined');
    const testPreload=packaged?path.join(root,'dist/win-unpacked/resources/app.asar/preload.cjs'):override>=0?path.join(path.dirname(executablePath),'resources/app.asar/preload.cjs'):path.join(root,'preload.cjs');
    const foreignSenderRejected=await app.evaluate(async({BrowserWindow},preload)=>{
      const foreign=new BrowserWindow({show:false,webPreferences:{preload,nodeIntegration:false,contextIsolation:true,sandbox:true}});
      try{
        await foreign.loadURL('moaon://app/index.html');
        return await foreign.webContents.executeJavaScript('window.moaonHub.refresh().then(() => false, () => true)');
      }finally{foreign.destroy();}
    },testPreload);
    assert.equal(foreignSenderRejected,true);
    if(process.argv.includes('--live-unauth')){
      const result=await page.evaluate(()=>window.moaonHub.refresh());
      assert.equal(result.status,'LOGIN_REQUIRED');
      assert.equal(result.orders.length,0);
      const loginOpened=app.waitForEvent('window');
      await page.evaluate(()=>{void window.moaonHub.connect();});
      const login=await loginOpened;
      await login.getByLabel('사장님 비밀번호',{exact:true}).waitFor({timeout:30000});
      assert.equal(await login.evaluate(()=>typeof window.moaonHub),'undefined');
      assert.equal(await login.evaluate(()=>typeof require),'undefined');
      assert.match(login.url(),/^https:\/\/harin-cafe24-sync\.vercel\.app\/login/);
      console.log(JSON.stringify({status:'PASS',scope:'actual unauthenticated GET rejected and official login form loaded; no credentials entered'}));
      return;
    }
    await app.evaluate(({session})=>{
      const ses=session.fromPartition('persist:moaon-harin-readonly',{cache:false});
      globalThis.__moaonTestStatus=200;
      globalThis.__moaonTestRequests=[];
      ses.fetch=async(url,options)=>{
        const base='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/orders?stage=ACTIVE&platform=ALL';
        const permitted=[base,...[0,20,40].map(n=>`${base}&offset=${n}&snapshot=${'a'.repeat(64)}`)];
        if(!permitted.includes(url)||options.method!=='GET')throw Error('Unexpected request');
        globalThis.__moaonTestRequests.push(url);
        const offset=Number(new URL(url).searchParams.get('offset')||0);
        const orders=Array.from({length:Math.min(20,45-offset)},(_,index)=>({
          hubOrderId:`SYNTHETIC-${offset+index+1}`,platform:'CAFE24',productName:`검증용 상품 ${offset+index+1}`,
          stage:'PAID',quantity:2,amount:null,orderedAt:'2026-09-08T00:00:00Z',receiver:{name:'DO-NOT-EXPOSE'},token:'DO-NOT-EXPOSE'
        }));
        return new Response(JSON.stringify(globalThis.__moaonTestStatus===200?{
          ok:true,orders,total:45,offset,nextOffset:offset+20<45?offset+20:null,snapshot:'a'.repeat(64),partial:true,
          warning:'untrusted upstream message',orderReadStates:[]
        }:{ok:false,code:'UNAUTHENTICATED'}),{status:globalThis.__moaonTestStatus,headers:{'Content-Type':'application/json'}});
      };
    });
    const ready=await page.evaluate(()=>window.moaonHub.refresh());
    assert.equal(ready.status,'PARTIAL');
    assert.equal(ready.orders.length,20);
    assert.equal(ready.orders[0].amount,null);
    assert.equal(ready.hasMore,true);
    assert.equal(JSON.stringify(ready).includes('DO-NOT-EXPOSE'),false);
    assert.equal('snapshot' in ready,false);
    const loginOpened=app.waitForEvent('window');
    await page.locator('[data-action="hub-connect"]:visible').click();
    await loginOpened;
    // Simulate only the server redirect event; actual API projection/IPC/UI stay real.
    await app.evaluate(({BrowserWindow})=>{
      const child=BrowserWindow.getAllWindows().find(win=>win.getParentWindow());
      child.webContents.emit('will-redirect',{preventDefault(){}},'https://harin-cafe24-sync.vercel.app/');
    });
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    await page.getByText('검증용 상품 1',{exact:true}).waitFor();
    assert.equal(await page.locator('.order-row').count(),20);
    assert.equal(await page.getByText('모아온 데모',{exact:true}).count(),0);
    assert.equal(await page.locator('[data-action="hub-previousPage"]:visible').isEnabled(),false);
    await page.locator('.order-row').first().click();
    await page.getByRole('heading',{name:'주문 상세',exact:true}).waitFor();
    await page.locator('[data-action="hub-nextPage"]:visible').click();
    await page.getByText('검증용 상품 21',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'주문 상세',exact:true}).count(),0);
    assert.equal(await page.locator('.order-row').count(),20);
    await page.locator('#order-search').fill('SYNTHETIC-1');
    assert.equal(await page.locator('.order-row').count(),0);
    await page.locator('[data-action="hub-nextPage"]:visible').click();
    await page.getByText('검증용 상품 41',{exact:true}).waitFor();
    assert.equal(await page.locator('#order-search').inputValue(),'');
    assert.equal(await page.locator('.order-row').count(),5);
    assert.equal(await page.locator('[data-action="hub-nextPage"]:visible').isEnabled(),false);
    await page.locator('[data-action="hub-previousPage"]:visible').click();
    await page.getByText('검증용 상품 21',{exact:true}).waitFor();
    assert.equal(await page.locator('.order-row').count(),20);
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts','pagination-synthetic-orders.png')});
    await app.evaluate(()=>{globalThis.__moaonTestStatus=409;});
    await page.locator('[data-action="hub-nextPage"]:visible').click();
    await page.locator('[data-action="hub-refresh"]:visible').waitFor();
    assert.equal(await page.locator('.order-row').count(),0);
    await app.evaluate(()=>{globalThis.__moaonTestStatus=200;});
    await page.locator('[data-action="hub-refresh"]:visible').click();
    await page.getByText('검증용 상품 1',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-action="hub-previousPage"]:visible').isEnabled(),false);
    await app.evaluate(()=>{globalThis.__moaonTestStatus=401;});
    await page.getByRole('button',{name:'오늘',exact:true}).click();
    assert.equal(await page.locator('[data-sample-only]:visible').count(),0);
    await page.locator('[data-action="hub-refresh"]:visible').click();
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    assert.equal(await page.locator('.order-row').count(),0);
    assert.equal(await page.getByText('검증용 상품 1',{exact:true}).count(),0);
    const disconnected=await page.evaluate(()=>window.moaonHub.disconnect());
    assert.equal(disconnected.status,'DISCONNECTED');
    await page.getByRole('button',{name:'오늘',exact:true}).click();
    await page.locator('[data-action="sample-mode"]:visible').click();
    await page.getByRole('region',{name:'현재 사업장'}).getByText('모아온 데모',{exact:true}).waitFor();
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    assert.equal(await page.locator('.order-row').count(),3);
    console.log(JSON.stringify({status:'PASS',packaged,scope:'actual Electron IPC with synthetic HTTP, not authenticated production proof'}));
  }finally{await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
