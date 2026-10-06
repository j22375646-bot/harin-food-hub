'use strict';
// Hidden, isolated profile verification. No user-session copy, credentials,
// native mouse/keyboard events, real shipment, or installed-user-app restart.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

async function main() {
  const installed = process.argv.includes('--installed-package');
  const runtimeRoot = installed
    ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Moaon Preview', 'resources', 'app.asar')
    : path.resolve(__dirname, '..');
  assert.ok(fs.existsSync(runtimeRoot), 'Runtime must exist');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'moaon-hidden-test-'));
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, 'isolated-bootstrap.cjs')],
    env: {...process.env, MOAON_TEST_RUNTIME_ROOT: runtimeRoot, MOAON_TEST_PROFILE: profile, MOAON_TEST_HIDDEN: '1'},
    timeout: 30000,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', () => errors.push('RENDERER_ERROR'));
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => {
      const status = document.querySelector('#entry-status')?.textContent;
      return status && !status.includes('확인하고 있습니다');
    }, {}, {timeout: 30000});
    assert.equal(page.url(), 'moaon://app/index.html');
    assert.equal(await page.locator('#entry-screen').isVisible(), true);
    assert.match(await page.locator('#entry-status').innerText(), /로그인/);
    assert.equal(await page.locator('.preview-shell').evaluate(el => el.inert), true);
    assert.equal(await page.evaluate(() => typeof require), 'undefined');
    const state = await app.evaluate(({app, BrowserWindow}) => ({
      profile: app.getPath('userData'),
      windows: BrowserWindow.getAllWindows().map(win => {
        const prefs = win.webContents.getLastWebPreferences();
        return {visible: win.isVisible(), focused: win.isFocused(), sandbox: prefs.sandbox, isolation: prefs.contextIsolation, node: prefs.nodeIntegration};
      }),
    }));
    assert.equal(path.resolve(state.profile), path.resolve(profile));
    assert.ok(state.windows.length > 0);
    for (const win of state.windows) assert.deepEqual(win, {visible:false, focused:false, sandbox:true, isolation:true, node:false});
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({status:'PASS', runtime:installed?'installed app.asar':'source', engine:'development Electron', scope:'hidden isolated login gate; not authenticated installed EXE acceptance', ...state}));
  } finally {
    await app.close();
  }
}
main().catch(() => { console.error('MOAON_BACKGROUND_VERIFICATION_FAILED'); process.exitCode = 1; });
