'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, Menu, ipcMain, protocol, session, dialog } = require('electron');
const {
  APP_ENTRY_URL,
  isAllowedAppUrl,
  resolveAppResource,
} = require('./security.cjs');
const {
  createHubConnection,
  registerConnectionIpc,
} = require('./hub-connection.cjs');

const APP_NAME = '모아온 Preview';
const {createLabelPreview}=require('./label-preview.cjs');
const {createSelectedDocuments}=require('./selected-documents.cjs');
const {createPrinterInspection,registerPrinterInspection}=require('./printer-inspection.cjs');
const {isTrustedRenderer}=require('./connection-policy.cjs');
const {registerAppInfo}=require('./app-info.cjs');
const {isImageRequest}=require('./order-visual.cjs');
const UI_ROOT = path.join(__dirname, 'ui');
const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.ttf', 'font/ttf'],
]);
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https://*.pstatic.net https://*.coupangcdn.com https://*.cafe24img.com https://ecimg.cafe24.com",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'moaon',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: false,
      corsEnabled: false,
      allowServiceWorkers: false,
      bypassCSP: false,
    },
  },
]);

app.setName(APP_NAME);
// Keep the Korean window title, but HTTP headers must not contain that title.
app.userAgentFallback = app.userAgentFallback.replace(/[^\x20-\x7e]/g, '');
app.setPath(
  'userData',
  path.join(app.getPath('appData'), 'Moaon Preview', 'preview-user-data'),
);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  let mainWindow = null;
  let hubConnection = null;

  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.moaon.preview');
    Menu.setApplicationMenu(null);

    await protocol.handle('moaon', async (request) => {
      try {
        const resourcePath = resolveAppResource(request.url, UI_ROOT);
        const body = await fs.readFile(resourcePath);
        const contentType = CONTENT_TYPES.get(path.extname(resourcePath));

        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Security-Policy': CONTENT_SECURITY_POLICY,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });

    const appSession = session.defaultSession;

    appSession.setPermissionCheckHandler(() => false);
    appSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    appSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      callback({ cancel: !isAllowedAppUrl(details.url) && !isImageRequest(details) });
    });
    appSession.webRequest.onBeforeSendHeaders({urls:['https://*/*']},(details,callback)=>{
      const headers={...details.requestHeaders};
      for(const key of Object.keys(headers))if(['cookie','authorization','referer'].includes(key.toLowerCase()))delete headers[key];
      callback({requestHeaders:headers});
    });
    appSession.on('will-download', (event) => event.preventDefault());

    mainWindow = new BrowserWindow({
      title: APP_NAME,
      width: 1440,
      height: 960,
      minWidth: 1040,
      minHeight: 720,
      show: false,
      frame: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {color:'#00000000',symbolColor:'#8b819e',height:48},
      autoHideMenuBar: true,
      backgroundColor: '#f3f6fa',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        devTools: false,
        spellcheck: false,
      },
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    registerPrinterInspection({ipcMain,getMainWindow:()=>mainWindow,isTrustedRenderer,
      inspect:createPrinterInspection({getMainWindow:()=>mainWindow,dialog})});
    registerAppInfo({ipcMain,getMainWindow:()=>mainWindow,isTrustedRenderer,getVersion:()=>app.getVersion()});
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
      if (targetUrl !== APP_ENTRY_URL) event.preventDefault();
    });
    mainWindow.webContents.on('will-redirect', (event, targetUrl) => {
      if (targetUrl !== APP_ENTRY_URL) event.preventDefault();
    });
    const cleanupMarker = path.join(app.getPath('userData'), 'session-cleanup-pending');
    let initialCleanupPending = true;
    try { await fs.access(cleanupMarker); } catch (error) {
      if (error.code === 'ENOENT') initialCleanupPending = false;
    }
    hubConnection = createHubConnection({
      labelPreview: createLabelPreview({BrowserWindow,Menu,dialog,getParent:()=>mainWindow}),
      selectedDocuments: createSelectedDocuments({dialog,getParent:()=>mainWindow,writeFile:(...args)=>fs.writeFile(...args)}),
      shipmentDirectory: path.join(app.getPath('userData'),'shipments'),
      showShipmentReview: (parent, options) => dialog.showMessageBox(parent, options),
      BrowserWindow,
      session,
      getMainWindow: () => mainWindow,
      initialCleanupPending,
      markCleanupPending: () => fs.writeFile(cleanupMarker, 'pending', {mode:0o600}),
      finishCleanup: () => fs.rm(cleanupMarker, {force:true}),
    });
    if (initialCleanupPending) await hubConnection.disconnect();
    registerConnectionIpc({
      ipcMain,
      getMainWindow: () => mainWindow,
      connection: hubConnection,
    });
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => {
      hubConnection?.closeChildren();
      hubConnection = null;
      mainWindow = null;
    });

    try {
      await mainWindow.loadURL(APP_ENTRY_URL);
    } catch (error) {
      console.error('Failed to load the preview shell:', error);
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
}
