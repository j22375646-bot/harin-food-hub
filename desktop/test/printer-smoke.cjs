'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  await app.evaluate(({dialog})=>{globalThis.printerDialogCount=0;dialog.showMessageBox=async(_win,options)=>{if(options.title==='출고 PC 프린터 점검')globalThis.printerDialogCount++;return {response:0};};});
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await page.locator('#entry-printers').click();
  await page.locator('#entry-printers:not([disabled])').waitFor();
  assert.equal(await app.evaluate(()=>globalThis.printerDialogCount),1);
  assert.equal(await page.locator('#entry-printers').isEnabled(),true);
  console.log(JSON.stringify({status:'PASS',scope:'real OS printer enumeration, UI/IPC; dialog response mocked, no print or settings changes'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
