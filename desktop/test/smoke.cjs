'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {launchDesktop}=require('./launch.cjs');
const root=path.resolve(__dirname,'..');
const packaged=process.argv.includes('--packaged');
const override=process.argv.indexOf('--executable');
const executablePath=override>=0?process.argv[override+1]:packaged?path.join(root,'dist/win-unpacked/MoaonPreview.exe'):require('electron');
const started=Date.now();
async function main(){
  assert.ok(fs.existsSync(path.join(root,'main.cjs')),'Desktop entry must exist');
  const app=await launchDesktop({root,executablePath,packaged,override});
  try{
    const page=await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('region',{name:'현재 사업장'}).getByText('모아온 데모',{exact:true}).waitFor();
    const firstReadyMs=Date.now()-started;
    const prefs=await app.evaluate(({BrowserWindow})=>{
      const win=BrowserWindow.getAllWindows()[0];
      const p=win.webContents.getLastWebPreferences();
      return {count:BrowserWindow.getAllWindows().length,node:p.nodeIntegration,sandbox:p.sandbox,isolated:p.contextIsolation,webSecurity:p.webSecurity};
    });
    assert.deepEqual(prefs,{count:1,node:false,sandbox:true,isolated:true,webSecurity:true});
    assert.equal(await page.evaluate(()=>typeof require),'undefined');
    assert.equal(await page.evaluate(()=>typeof process),'undefined');
    await page.getByRole('button',{name:'주문·배송',exact:true}).click();
    await page.getByRole('heading',{name:'주문·배송',exact:true}).waitFor();
    assert.equal(await page.locator('.order-row').count(),3);
    await page.locator('#order-search').fill('MOAON-S002');
    assert.equal(await page.locator('.order-row').count(),1);
    await page.locator('.order-row').click();
    await page.getByRole('heading',{name:'주문 상세',exact:true}).waitFor();
    await page.getByRole('button',{name:'주문 상세 닫기'}).click();
    await page.locator('#order-search').fill('없는주문');
    assert.equal(await page.locator('.order-row').count(),0);
    await page.locator('#order-search').fill('');
    await page.locator('.order-row').first().click();
    await page.locator('#order-search').fill('MOAON-S001');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.order-row').evaluate(element=>element===document.activeElement),true);
    await page.locator('#order-search').fill('');
    await page.getByRole('button',{name:'앱 설정',exact:true}).click();
    await page.getByRole('heading',{name:'앱 설정',exact:true}).waitFor();
    await page.locator('[data-theme-choice="dark"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.getByRole('button',{name:'오늘',exact:true}).click();
    await page.getByRole('heading',{name:'오늘',exact:true}).waitFor();
    const before=page.url();
    await page.evaluate(()=>window.open('https://example.invalid','_blank'));
    assert.equal((await app.windows()).length,1);
    const policyViolation=await page.evaluate(async()=>{
      const violation=new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('Timed out waiting for CSP violation')),3000);
        document.addEventListener('securitypolicyviolation',event=>{
          if(event.effectiveDirective!=='connect-src')return;
          clearTimeout(timeout);
          resolve({effectiveDirective:event.effectiveDirective,blockedURI:event.blockedURI});
        },{once:true});
      });
      void fetch('https://example.invalid').catch(()=>{});
      return violation;
    });
    assert.equal(policyViolation.effectiveDirective,'connect-src');
    assert.match(policyViolation.blockedURI,/^https:\/\/example\.invalid\/?$/);
    assert.equal(page.url(),before);
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
    await page.screenshot({path:path.join(root,'artifacts',packaged?'packaged-preview.png':'development-preview.png')});
    await page.locator('[data-route="settings"]').click();
    await page.locator('[data-theme-choice="light"]').click();
    await page.locator('[data-route="orders"]').click();
    await page.locator('.order-row').first().click();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,720));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
    await page.screenshot({path:path.join(root,'artifacts',packaged?'packaged-orders-small.png':'development-orders-small.png')});
    console.log(JSON.stringify({status:'PASS',packaged,firstReadyMs,scope:'single Windows PC synthetic preview, not production integration',security:prefs}));
  }finally{await app.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
