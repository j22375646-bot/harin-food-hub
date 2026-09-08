'use strict';
// Explicit installed-app acceptance. Does not connect, collect, issue or print.
// Reads current theme without changing the user's choice.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {_electron}=require('playwright');
async function main(){
 if(!process.argv.includes('--installed'))throw Error('Use --installed for explicit real-profile acceptance');
 const executablePath=path.join(process.env.LOCALAPPDATA,'Programs','Moaon Preview','MoaonPreview.exe');
 const profile=path.join(process.env.APPDATA,'Moaon Preview','preview-user-data');
 if(fs.existsSync(path.join(profile,'session-cleanup-pending')))throw Error('Pending session cleanup; do not start acceptance');
 const results=[];
 for(let run=0;run<2;run++){
  const started=Date.now();const app=await _electron.launch({executablePath,args:[],timeout:30000});
  try{
   const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
   await page.locator('#theme-toggle').waitFor();
   const errors=[];page.on('pageerror',error=>errors.push(error.name));
   const state=await app.evaluate(({app})=>({version:app.getVersion(),profile:app.getPath('userData')}));
   assert.equal(state.version,'0.13.1');assert.equal(path.resolve(state.profile),path.resolve(profile));
   const theme=await page.evaluate(()=>({visible:document.documentElement.dataset.theme,saved:localStorage.getItem('moaon-preview-theme')}));
   assert.equal(theme.visible,theme.saved);assert.ok(['light','dark'].includes(theme.visible));
   assert.equal(page.url(),'moaon://app/index.html');
   await page.getByRole('button',{name:'앱 설정',exact:true}).click();
   await page.locator('[data-page="settings"]:visible').waitFor();
   await page.getByRole('button',{name:'오늘',exact:true}).click();
   assert.deepEqual(errors,[]);
   results.push({version:state.version,theme:theme.saved,readyAndNavigationMs:Date.now()-started});
  }finally{await app.close();}
 }
 assert.equal(results[0].theme,results[1].theme);
 console.log(JSON.stringify({status:'PASS',runs:results,scope:'installed EXE, existing profile, settings navigation and restart; no login/API/print actions'}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
