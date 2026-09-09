'use strict';
// Test-only bootstrap, excluded from packaged files. Never show an Electron
// error dialog over the user's work when a test fails during startup.
process.on('uncaughtException', () => {
  process.stderr.write('MOAON_TEST_BOOTSTRAP_FAILED\n');
  process.exit(1);
});
process.on('unhandledRejection', () => {
  process.stderr.write('MOAON_TEST_BOOTSTRAP_FAILED\n');
  process.exit(1);
});
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const runtimeRoot = process.env.MOAON_TEST_RUNTIME_ROOT;
const profile = process.env.MOAON_TEST_PROFILE;
if (!runtimeRoot || !profile || !path.isAbsolute(runtimeRoot) || !path.isAbsolute(profile)) {
  throw new Error('Absolute test runtime and profile are required');
}
const originalSetPath = app.setPath.bind(app);
app.setPath = (name, value) => originalSetPath(name, name === 'userData' ? profile : value);
if (process.env.MOAON_TEST_HIDDEN === '1') {
  // The real app constructs windows with show:false. Suppress its later reveal
  // and focus calls; renderer, sandbox, IPC and session code remain unchanged.
  BrowserWindow.prototype.show = function () {};
  BrowserWindow.prototype.showInactive = function () {};
  BrowserWindow.prototype.focus = function () {};
}
require(path.join(runtimeRoot, 'main.cjs'));
