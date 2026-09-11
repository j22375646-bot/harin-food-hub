'use strict';
// Test-only bootstrap, excluded from packaged files. Never show an Electron
// error dialog over the user's work when a test fails during startup.
process.on('uncaughtException', (error) => {
  if(String(error?.message).includes('Requested secondary display unavailable'))process.stderr.write('RIGHT_DISPLAY_UNAVAILABLE\n');
  process.stderr.write('MOAON_TEST_BOOTSTRAP_FAILED\n');
  process.exit(1);
});
process.on('unhandledRejection', error => {
 if(String(error?.message).includes('Requested secondary display unavailable'))process.stderr.write('RIGHT_DISPLAY_UNAVAILABLE\n');
 process.stderr.write(String(error?.stack||error)+'\n');
  process.stderr.write('MOAON_TEST_BOOTSTRAP_FAILED\n');
  process.exit(1);
});
const path = require('node:path');
const { app, BrowserWindow, screen } = require('electron');
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
if (process.env.MOAON_TEST_HIDDEN !== '1' && process.env.MOAON_TEST_DISPLAY === 'right') {
  // User-requested visible verification must stay off the primary workspace.
  // showInactive reveals this test window without activating it; no input APIs.
  const showInactive = BrowserWindow.prototype.showInactive;
  BrowserWindow.prototype.show = function () { showInactive.call(this); };
  BrowserWindow.prototype.focus = function () {};
  app.on('browser-window-created', (_event, win) => {
    // Visible automation does not accept native input or activation. DOM focus
    // remains testable, while OS activation cannot interrupt the user's work.
    win.setFocusable(false);
    const primary = screen.getPrimaryDisplay();
    const display = screen.getAllDisplays().filter(d => d.id !== primary.id && d.workArea.x >= primary.workArea.x + primary.workArea.width).sort((a,b) => a.workArea.x-b.workArea.x)[0];
    if (!display) throw new Error('Requested secondary display unavailable');
    const area = display.workArea;
    const width = Math.min(1060, area.width-20), height = Math.min(1100, area.height-60);
    win.setMinimumSize(Math.min(1040,width), Math.min(720,height));
    win.setBounds({x:area.x+10,y:area.y+30,width,height});
  });
}
require(path.join(runtimeRoot, 'main.cjs'));
