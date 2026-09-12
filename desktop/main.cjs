'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, WebContentsView, Menu, Tray, ipcMain, protocol, session, dialog, safeStorage, screen, Notification, shell } = require('electron');
const {rightDisplayBounds,readRightDisplayPreference,saveRightDisplayPreference,showRightWindow}=require('./window-placement.cjs');
const {createUpdateGate,guardWorkIpc}=require('./update-gate.cjs');
const {startAutomaticUpdates,createConfiguredUpdater,createAppUpdates,registerAppUpdates}=require('./app-updates.cjs');
const {createActionReview}=require('./action-review.cjs');
const updateGate=createUpdateGate();
const workIpc=guardWorkIpc(ipcMain,updateGate);
const {createDraftStore,registerApiDrafts}=require('./api-drafts.cjs');
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
// Windows presentation identity is separate from the signed installer/update ID.
// The old preview identity was shared with development Electron windows.
const WINDOWS_APP_ID = 'com.moaon.desktop.main';
const {createLabelPreview}=require('./label-preview.cjs');
const {createWorklistPreview}=require('./worklist-preview.cjs');
const {createSelectedDocuments,createOrderExportSaver}=require('./selected-documents.cjs');
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
  "img-src 'self' data: https://*.pstatic.net https://*.coupangcdn.com https://*.cafe24img.com https://ecimg.cafe24.com https://harinfood.com/web/product/",
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
  let trayLifecycle=null,backgroundMonitor=null,updates=null;
  let rightDisplayRequested=false;
  const displayPreferenceFile=path.join(app.getPath('userData'),'display-preference.json');

  app.on('second-instance', (_event,argv=[]) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if(rightDisplayRequested||argv.includes('--display-right')){
      rightDisplayRequested=true;
      try{saveRightDisplayPreference(displayPreferenceFile);}catch{console.error('DISPLAY_PREFERENCE_UNAVAILABLE');return;}
      if(!showRightWindow(mainWindow,screen.getAllDisplays(),screen.getPrimaryDisplay()))console.error('RIGHT_DISPLAY_UNAVAILABLE');
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId(WINDOWS_APP_ID);
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

    try{
      rightDisplayRequested=process.argv.includes('--display-right')||readRightDisplayPreference(displayPreferenceFile);
      if(rightDisplayRequested)saveRightDisplayPreference(displayPreferenceFile);
    }catch{console.error('DISPLAY_PREFERENCE_UNAVAILABLE');app.quit();return;}
    const rightBounds=rightDisplayRequested?rightDisplayBounds(screen.getAllDisplays(),screen.getPrimaryDisplay()):null;
    if(rightDisplayRequested&&!rightBounds){console.error('RIGHT_DISPLAY_UNAVAILABLE');app.quit();return;}
    mainWindow = new BrowserWindow({
      title: APP_NAME,
      icon: path.join(UI_ROOT,'brand','moaon.png'),
      width: 1440,
      height: 960,
      minWidth: rightBounds?Math.min(1040,rightBounds.width):1040,
      minHeight: rightBounds?Math.min(720,rightBounds.height):720,
      ...(rightBounds||{}),
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

    if(process.platform==='win32'){const taskbarIcon=path.join(app.getPath('userData'),'moaon-desktop-icon-v1.ico');await fs.writeFile(taskbarIcon,await fs.readFile(path.join(UI_ROOT,'brand','moaon.ico')));mainWindow.setIcon(taskbarIcon);mainWindow.setAppDetails({appId:WINDOWS_APP_ID});if(app.isPackaged&&path.basename(process.execPath).toLowerCase()==='moaonpreview.exe'){try{const menu=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs'),link=path.join(menu,'모아온.lnk');await fs.mkdir(menu,{recursive:true});let previous={};try{previous=shell.readShortcutLink(link);}catch{}shell.writeShortcutLink(link,'create',{...previous,target:process.execPath,cwd:path.dirname(process.execPath),icon:process.execPath,iconIndex:0,description:'모아온',appUserModelId:WINDOWS_APP_ID});}catch{console.error('MOAON_SHORTCUT_REFRESH_UNAVAILABLE');}}}
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.on('show',()=>mainWindow?.setSkipTaskbar(false));
    registerPrinterInspection({ipcMain:workIpc,getMainWindow:()=>mainWindow,isTrustedRenderer,
      inspect:createPrinterInspection({getMainWindow:()=>mainWindow,dialog})});
    registerAppInfo({ipcMain:workIpc,getMainWindow:()=>mainWindow,isTrustedRenderer,getVersion:()=>app.getVersion()});
    registerApiDrafts({ipcMain:workIpc,getMainWindow:()=>mainWindow,isTrustedRenderer,listBusinesses:()=>hubConnection.listBusinesses(),store:createDraftStore({directory:path.join(app.getPath('userData'),'api-drafts'),safeStorage,platform:process.platform})});
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
      if (targetUrl !== APP_ENTRY_URL) event.preventDefault();
    });
    mainWindow.webContents.on('will-redirect', (event, targetUrl) => {
      if (targetUrl !== APP_ENTRY_URL) event.preventDefault();
    });
    mainWindow.on('restore', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('moaon-hub:window-restored');
    });
    const cleanupMarker = path.join(app.getPath('userData'), 'session-cleanup-pending');
    let initialCleanupPending = true;
    try { await fs.access(cleanupMarker); } catch (error) {
      if (error.code === 'ENOENT') initialCleanupPending = false;
    }
    const teamNotifications=require('./team-notifications.cjs').createTeamNotifications({Notification,directory:path.join(app.getPath('userData'),'team-notifications'),getWindow:()=>mainWindow});
    workIpc.handle('moaon-hub:test-team-notification',async(event,...args)=>{if(!isTrustedRenderer(event,mainWindow)||args.length)throw Error('Untrusted notification test');return teamNotifications.test();});
    const LoginHost=require('./inline-login.cjs').createInlineLoginHost({WebContentsView});
    hubConnection = createHubConnection({
      onTeamSnapshot:value=>{teamNotifications.receive(value);backgroundMonitor?.identity(value);},
      labelPreview: createLabelPreview({BrowserWindow,Menu,dialog,getParent:()=>mainWindow}),
      stockReceiptPreview: require('./stock-receipt-preview.cjs').createStockReceiptPreview({BrowserWindow,Menu,getParent:()=>mainWindow}),
      worklistPreview: createWorklistPreview({BrowserWindow,Menu,dialog,getParent:()=>mainWindow}),
      selectedDocuments: createSelectedDocuments({dialog,getParent:()=>mainWindow,writeFile:(...args)=>fs.writeFile(...args)}),
      shipmentDirectory: path.join(app.getPath('userData'),'shipments'),
      showShipmentReview: createActionReview({ipcMain,getMainWindow:()=>mainWindow,isTrustedRenderer}),
      onShippingProgress: value => {if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('moaon-hub:shipping-progress',value);},
      BrowserWindow,
      LoginHost,
      session,
      getMainWindow: () => mainWindow,
      initialCleanupPending,
      markCleanupPending: () => fs.writeFile(cleanupMarker, 'pending', {mode:0o600}),
      finishCleanup: () => fs.rm(cleanupMarker, {force:true}),
      saveOrderExport:createOrderExportSaver({dialog,getParent:()=>mainWindow,writeFile:(...args)=>fs.writeFile(...args)}),
    });
    if (initialCleanupPending) await hubConnection.disconnect();
    registerConnectionIpc({
      ipcMain:workIpc,
      getMainWindow: () => mainWindow,
      connection: hubConnection,
    });
    trayLifecycle=require('./tray-lifecycle.cjs').createTrayLifecycle({app,Tray,Menu,window:mainWindow,icon:path.join(UI_ROOT,'brand','moaon.ico'),onStop:()=>backgroundMonitor?.stop(),allowClose:()=>updates?.read().status==='INSTALLING',canHide:()=>!BrowserWindow.getAllWindows().some(w=>w!==mainWindow&&w.isModal?.())});
    backgroundMonitor=require('./background-monitor.cjs').createBackgroundMonitor({connection:hubConnection,Notification,getWindow:()=>mainWindow,directory:path.join(app.getPath('userData'),'background-notifications'),onStatus:status=>trayLifecycle?.setStatus(status)});
    backgroundMonitor.start();
    mainWindow.on('closed',()=>{backgroundMonitor.stop();trayLifecycle.dispose();});
    updates=createAppUpdates({updater:createConfiguredUpdater({app,config:require('./update-channel.json')}),currentVersion:app.getVersion(),gate:updateGate,isBusy:()=>BrowserWindow.getAllWindows().length>1});
    registerAppUpdates({ipcMain,getMainWindow:()=>mainWindow,isTrustedRenderer,updates,onPromptVisibility:visible=>LoginHost.setObscured(visible)});
    // Background preparation never installs on ordinary quit or interrupts work.
    const stopAutomaticUpdates=startAutomaticUpdates({updates});
    mainWindow.once('closed',()=>{stopAutomaticUpdates();updates.dispose();});
    mainWindow.once('ready-to-show', () => rightDisplayRequested?mainWindow.showInactive():mainWindow.show());
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
