'use strict';
// Real Electron/IPC; only the external HTTP transport is synthetic.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {_electron}=require('playwright');
const root=path.resolve(__dirname,'..');
const packaged=process.argv.includes('--packaged');
const override=process.argv.indexOf('--executable');
const executablePath=override>=0?process.argv[override+1]:packaged?path.join(root,'dist/win-unpacked/MoaonPreview.exe'):require('electron');
async function main(){
  const app=await _electron.launch({executablePath,args:packaged||override>=0?[]:[root],timeout:30000});
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.moaonHub||{}).sort()),['connect','disconnect','refresh']);
    assert.equal(await page.evaluate(()=>typeof require),'undefined');
    const foreignSenderRejected=await app.evaluate(async({BrowserWindow,app})=>{
      const foreign=new BrowserWindow({show:false,webPreferences:{preload:`${app.getAppPath()}/preload.cjs`,nodeIntegration:false,contextIsolation:true,sandbox:true}});
      try{
        await foreign.loadURL('moaon://app/index.html');
        return await foreign.webContents.executeJavaScript('window.moaonHub.refresh().then(() => false, () => true)');
      }finally{foreign.destroy();}
    });
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
      const ses=session.fromPartition('moaon-harin-readonly',{cache:false});
      globalThis.__moaonTestStatus=200;
      ses.fetch=async(url,options)=>{
        if(url!=='https://harin-cafe24-sync.vercel.app/api/orders/page?stage=ACTIVE&platform=ALL'||options.method!=='GET')throw Error('Unexpected request');
        return new Response(JSON.stringify(globalThis.__moaonTestStatus===200?{
          ok:true,orders:[{hubOrderId:'SYNTHETIC-1',platform:'CAFE24',productName:'검증용 상품',stage:'PAID',quantity:2,amount:null,orderedAt:'2026-09-08T00:00:00Z',receiver:{name:'DO-NOT-EXPOSE'},token:'DO-NOT-EXPOSE'}],
          total:21,offset:0,nextOffset:20,snapshot:'a'.repeat(64),partial:true,warning:'untrusted upstream message',orderReadStates:[]
        }:{ok:false,code:'UNAUTHENTICATED'}),{status:globalThis.__moaonTestStatus,headers:{'Content-Type':'application/json'}});
      };
    });
    const ready=await page.evaluate(()=>window.moaonHub.refresh());
    assert.equal(ready.status,'PARTIAL');
    assert.equal(ready.orders.length,1);
    assert.equal(ready.orders[0].amount,null);
    assert.equal(ready.hasMore,true);
    assert.equal(JSON.stringify(ready).includes('DO-NOT-EXPOSE'),false);
    const loginOpened=app.waitForEvent('window');
    await page.locator('[data-action="hub-connect"]:visible').click();
    await loginOpened;
    // Simulate only the server redirect event; actual API projection/IPC/UI stay real.
    await app.evaluate(({BrowserWindow})=>{
      const child=BrowserWindow.getAllWindows().find(win=>win.getParentWindow());
      child.webContents.emit('will-redirect',{preventDefault(){}},'https://harin-cafe24-sync.vercel.app/');
    });
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    await page.getByText('검증용 상품',{exact:true}).waitFor();
    assert.equal(await page.locator('.order-row').count(),1);
    assert.equal(await page.getByText('모아온 데모',{exact:true}).count(),0);
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts','connection-synthetic-orders.png')});
    await app.evaluate(()=>{globalThis.__moaonTestStatus=401;});
    await page.getByRole('button',{name:'오늘',exact:true}).click();
    assert.equal(await page.locator('[data-sample-only]:visible').count(),0);
    await page.locator('[data-action="hub-refresh"]:visible').click();
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    assert.equal(await page.locator('.order-row').count(),0);
    assert.equal(await page.getByText('검증용 상품',{exact:true}).count(),0);
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
