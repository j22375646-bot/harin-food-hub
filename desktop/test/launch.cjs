'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

async function launchDesktop({ root, executablePath, packaged, override }) {
  if (!process.argv.includes('--isolated')) {
    return _electron.launch({ executablePath, args: packaged || override >= 0 ? [] : [root], timeout: 30000 });
  }
  if (override >= 0) throw new Error('Do not combine --isolated with --executable; isolated runs use the development binary');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'moaon-electron-test-'));
  const runtimeRoot = packaged ? path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar') : root;
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, 'isolated-bootstrap.cjs')],
    env: { ...process.env, MOAON_TEST_RUNTIME_ROOT: runtimeRoot, MOAON_TEST_PROFILE: profile },
    timeout: 30000,
  });
  console.log(JSON.stringify({ testMode: 'isolated profile; real runtime with development Electron binary', profile }));
  return app;
}
module.exports = { launchDesktop };
