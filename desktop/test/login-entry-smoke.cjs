'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {launchDesktop}=require('./launch.cjs');
async function main(){
 if(!process.argv.includes('--isolated'))throw Error('Isolated profile required');
 const app=await launchDesktop({root:path.resolve(__dirname,'..'),executablePath:require('electron'),packaged:process.argv.includes('--packaged'),override:-1});
 try{
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({session})=>{
   globalThis.entryAuthorized=false;
   const remote=session.fromPartition('persist:moaon-harin-readonly');
   remote.fetch=async()=>globalThis.entryAuthorized?Response.json({ok:true,orders:[],total:0,offset:0,nextOffset:null,snapshot:'a'.repeat(64),partial:false}):new Response('',{status:401});
   remote.protocol.handle('https',()=>new Response('<html><body><main class="loginPage"><section class="loginFrame"><header class="loginTopbar">모아온</header><section class="loginAccess"><header class="accessHeader"><h2>로그인</h2></header><form class="loginForm"><label>비밀번호<input type="password"></label><button>로그인</button></form></section></section></main></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}));
  });
  await page.evaluate(()=>runHubAction('viewActive'));await page.getByText('로그인이 필요합니다. 아래 버튼으로 시작하세요.',{exact:true}).waitFor({timeout:20000});
  assert.equal(await page.locator('.preview-shell').isVisible(),false);
  await page.screenshot({path:path.resolve(__dirname,'../dist/login-entry-light.png')});
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:path.resolve(__dirname,'../dist/login-entry-dark.png')});
  const nextWindow=app.waitForEvent('window');await page.locator('#entry-login').click();
  const login=await nextWindow;await login.waitForLoadState('domcontentloaded');
  assert.equal(await login.locator('input[type=password]').count(),1);
  await login.close();await page.locator('#entry-login:not([disabled])').waitFor();
  assert.equal(await page.locator('.preview-shell').isVisible(),false);
  await app.evaluate(()=>globalThis.entryAuthorized=true);await page.locator('#entry-login').click();
  await page.locator('.preview-shell:visible').waitFor();assert.equal(await page.locator('#entry-screen').isVisible(),false);
  await app.evaluate(()=>globalThis.entryAuthorized=false);await page.locator('[data-action="hub-refresh"]:visible').first().click();
  await page.locator('#entry-screen:visible').waitFor();assert.equal(await page.locator('.preview-shell').isVisible(),false);
  await app.evaluate(({session})=>{session.fromPartition('persist:moaon-harin-readonly').fetch=async()=>new Response('',{status:403});});
  await page.evaluate(()=>runHubAction('viewActive'));assert.equal(await page.locator('#entry-screen').isVisible(),true);
  await page.locator('#entry-reset').click();await page.getByText('로그아웃했습니다. 다시 로그인할 수 있습니다.',{exact:true}).waitFor();
  console.log(JSON.stringify({status:'PASS',scope:'login first, cancelled login stays gated, valid session opens workspace, expired session returns gate; synthetic auth, no credentials entered'}));
 }finally{await app.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
