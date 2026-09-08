'use strict';
// Native Electron form navigation; empty test POST cancelled before network send.
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchDesktop } = require('./launch.cjs');
const root = path.resolve(__dirname, '..');
const override = process.argv.indexOf('--executable');
const packaged = process.argv.includes('--packaged');
const executablePath = override >= 0 ? process.argv[override + 1] : require('electron');
async function main() {
  const app = await launchDesktop({ root, executablePath, packaged, override });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await app.evaluate(({ session, BrowserWindow }) => {
      const ses = session.fromPartition('moaon-harin-readonly', { cache: false });
      globalThis.testLoginPosts = 0;
      globalThis.testPostDecisions = [];
      globalThis.testLoadFailures = [];
      const loadURL = BrowserWindow.prototype.loadURL;
      BrowserWindow.prototype.loadURL = function (...args) {
        return loadURL.apply(this, args).catch(error => {
          globalThis.testLoadFailures.push({code:error.code,errno:error.errno});
          throw error;
        });
      };
      const register = ses.webRequest.onBeforeRequest.bind(ses.webRequest);
      ses.webRequest.onBeforeRequest = (filter, handler) => register(filter, (details, callback) => {
        handler(details, decision => {
          if (details.method === 'POST' && details.url === 'https://harin-cafe24-sync.vercel.app/api/dashboard/login') {
            globalThis.testPostDecisions.push({cancel:decision.cancel, sender:details.webContentsId, children:BrowserWindow.getAllWindows().filter(w=>w.getParentWindow()).map(w=>w.webContents.id)});
            if (decision.cancel === false) globalThis.testLoginPosts += 1;
            callback({ cancel: true }); // Never send the test form to the server.
          } else callback(decision);
        });
      });
    });
    const opened = app.waitForEvent('window');
    await page.evaluate(() => { globalThis.loginResult = window.moaonHub.connect(); });
    const login = await opened;
    await login.getByLabel('사장님 비밀번호', { exact: true }).waitFor();
    const submitted = await login.evaluate(() => {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '/api/dashboard/login';
      document.body.append(form);
      form.requestSubmit(); // No password controls or values.
      globalThis.emptyTestForm = form;
      return {state:document.readyState,connected:form.isConnected};
    });
    for (let i = 0; i < 50; i += 1) {
      if (await app.evaluate(() => globalThis.testLoginPosts === 1)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const count = await app.evaluate(() => globalThis.testLoginPosts);
    if (count !== 1) console.log(JSON.stringify({submitted,decisions:await app.evaluate(()=>globalThis.testPostDecisions),failures:await app.evaluate(()=>globalThis.testLoadFailures),dom:await login.evaluate(()=>({state:document.readyState,connected:globalThis.emptyTestForm?.isConnected})).catch(()=>({closed:true}))}));
    assert.equal(count, 1);
    console.log(JSON.stringify({ status: 'PASS', scope: 'native form POST reaches production network allow decision; cancelled by test before sending, no credentials' }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
