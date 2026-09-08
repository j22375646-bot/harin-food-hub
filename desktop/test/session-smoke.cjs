'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {_electron} = require('playwright');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'moaon-session-test-'));
async function launch() {
  return _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'isolated-bootstrap.cjs')],
    env:{...process.env,MOAON_TEST_RUNTIME_ROOT:root,MOAON_TEST_PROFILE:profile}});
}
async function main() {
  for(let step=0;step<3;step++) {
    const app = await launch();
    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      const present = await app.evaluate(async ({session}, step) => {
        const ses = session.fromPartition('persist:moaon-harin-readonly',{cache:false});
        if(step===0) {
          await ses.cookies.set({url:'https://harin-cafe24-sync.vercel.app',name:'moaon_test_only',value:'synthetic-not-auth',secure:true,httpOnly:true,expirationDate:Date.now()/1000+600});
          await ses.cookies.flushStore();
        }
        return (await ses.cookies.get({name:'moaon_test_only'})).length;
      },step);
      assert.equal(present,step===2?0:1);
      if(step===1) {
        await app.evaluate(({session}) => {
          session.fromPartition('persist:moaon-harin-readonly',{cache:false}).fetch=async()=>new Response(JSON.stringify({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false}),{status:200,headers:{'Content-Type':'application/json'}});
        });
        await page.locator('[data-action="hub-connect"]:visible').first().click();
        await page.locator('[data-action="hub-refresh"]:visible').first().waitFor();
        assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.getParentWindow()).length),0,'valid session must bypass login window');
        const result=await page.evaluate(()=>window.moaonHub.disconnect());
        assert.equal(result.status,'DISCONNECTED');
      }
    } finally {await app.close();}
  }
  console.log(JSON.stringify({status:'PASS',scope:'synthetic persistent cookie survives restart; real disconnect removes it across restart; no credentials'}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
