'use strict';

// Invoke with Node and an installed app.asar path. Electron runs this same file
// as the isolated child, without a debugger or a Playwright connection. It can
// run alongside the normal app because it holds a separate profile lock.
const bootTime = Date.now();
const { performance } = require('node:perf_hooks');
const boot = performance.now();
const fs = require('node:fs');
const path = require('node:path');
const prefix = 'MOAON_STARTUP ';

if (process.versions.electron) {
  runElectron();
} else {
  launch().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

async function launch() {
  const [archive, ...flags] = process.argv.slice(2);
  const measureUi = flags.includes('--ui');
  const iconDelays = flags.filter(flag => flag.startsWith('--delay-icon-write-ms='));
  const iconDelay = iconDelays[0]?.slice('--delay-icon-write-ms='.length);
  if (!archive || new Set(flags).size !== flags.length || iconDelays.length > 1 ||
    flags.length !== Number(measureUi) + iconDelays.length ||
    (iconDelay !== undefined && (!/^\d{1,5}$/.test(iconDelay) || Number(iconDelay) < 1 || Number(iconDelay) > 10_000))) {
    throw Error('Usage: node desktop/test/order-startup-measure.cjs D:/GPT/Apps/Moaon/releases/<version>/resources/app.asar [--ui] [--delay-icon-write-ms=1..10000]');
  }
  const runtime = fs.realpathSync(archive);
  if (!/^D:\\GPT\\/i.test(runtime) || path.basename(runtime) !== 'app.asar' || !fs.statSync(runtime).isFile()) {
    throw Error('An installed app.asar file under D:\\GPT is required');
  }

  const { spawn } = require('node:child_process');
  fs.mkdirSync('D:/GPT/Temp', { recursive: true });
  const profile = fs.mkdtempSync('D:/GPT/Temp/moaon-order-startup-');
  const env = {
    ...process.env,
    MOAON_TEST_RUNTIME_ROOT: runtime,
    MOAON_TEST_PROFILE: profile,
    MOAON_TEST_HIDDEN: '1',
    MOAON_TEST_DISPLAY: '',
    MOAON_STARTUP_MEASURE_UI: measureUi ? '1' : '0',
    MOAON_STARTUP_ICON_DELAY_MS: iconDelay || '0',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = require('electron');
  const launchTime = Date.now();
  const child = spawn(executable, [__filename, `--user-data-dir=${profile}`], {
    cwd: path.resolve(__dirname, '..'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const { createInterface } = require('node:readline');
  const lines = createInterface({ input: child.stdout });
  const phases = {};
  let report;
  let failure;
  let timedOut = false;
  lines.on('line', line => {
    if (!line.startsWith(prefix)) return;
    const message = JSON.parse(line.slice(prefix.length));
    if (message.phase) phases[message.phase] = message.ms;
    if (message.bootTime) phases.launchToBootstrapMs = message.bootTime - launchTime;
    if (message.report) report = { ...report, ...message.report };
    if (message.failure) failure = message.failure;
  });
  child.stderr.resume();
  // Kill only the child launched with this fresh test profile.
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 180_000);
  try {
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    const status = timedOut ? 'TIMEOUT' : exitCode === 0 && report ? 'PASS' : 'FAIL';
    console.log(JSON.stringify({
      status,
      scope: 'Hidden, isolated app.asar run with automatic updates and background polling stopped; mock login and sample orders',
      phases,
      ...report,
      failure,
      exitCode,
    }));
    if (status !== 'PASS') process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    lines.close();
  }
}

function runElectron() {
  const { app, BrowserWindow, session } = require('electron');
  const emit = value => new Promise(resolve => {
    process.stdout.write(prefix + JSON.stringify(value) + '\n', resolve);
  });
  const elapsed = () => performance.now() - boot;
  const phases = {};
  const mark = phase => {
    phases[phase] = elapsed();
    return emit({ phase, ms: Math.round(phases[phase]) });
  };
  const fail = name => emit({ failure: name }).then(() => app.exit(1));
  void emit({ bootTime });
  process.on('unhandledRejection', () => void fail('UNHANDLED_REJECTION'));
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
  globalThis.fetch = async () => { throw Error('Benchmark blocks outbound fetch'); };
  Object.defineProperty(app, 'isPackaged', { value: true });

  const startupIo = { protocolReadCount: 0, protocolReadTotalMs: 0, protocolReadMaxMs: 0 };
  const iconDelay = Number(process.env.MOAON_STARTUP_ICON_DELAY_MS);
  let notifyIconApplied;
  const iconApplied = new Promise(resolve => { notifyIconApplied = resolve; });
  const ioReport = () => Object.fromEntries(Object.entries(startupIo).map(([key, value]) => [key, Math.round(value)]));
  const files = require('node:fs/promises');
  const uiRoot = path.join(process.env.MOAON_TEST_RUNTIME_ROOT, 'ui') + path.sep;
  const iconPath = path.join(uiRoot, 'brand', 'moaon.ico');
  const iconCopy = path.join(process.env.MOAON_TEST_PROFILE, 'moaon-desktop-icon-v1.ico');
  const readFile = files.readFile;
  files.readFile = async function (file, ...options) {
    const started = performance.now();
    try {
      return await readFile.call(this, file, ...options);
    } finally {
      const ms = performance.now() - started;
      if (file === iconPath) startupIo.iconReadMs = ms;
      else if (typeof file === 'string' && file.startsWith(uiRoot)) {
        startupIo.protocolReadCount += 1;
        startupIo.protocolReadTotalMs += ms;
        startupIo.protocolReadMaxMs = Math.max(startupIo.protocolReadMaxMs, ms);
      }
    }
  };
  const writeFile = files.writeFile;
  files.writeFile = async function (file, ...options) {
    if (file !== iconCopy) return writeFile.call(this, file, ...options);
    startupIo.iconWriteRequestedMs = elapsed();
    if (iconDelay) await new Promise(resolve => setTimeout(resolve, iconDelay));
    startupIo.iconWriteStartedMs = elapsed();
    const started = performance.now();
    try {
      const result = await writeFile.call(this, file, ...options);
      startupIo.iconWriteFinishedMs = elapsed();
      return result;
    } finally {
      startupIo.iconWriteMs = performance.now() - started;
    }
  };
  const setIcon = BrowserWindow.prototype.setIcon;
  BrowserWindow.prototype.setIcon = function (...options) {
    const started = performance.now();
    try {
      const result = setIcon.apply(this, options);
      if (options[0] === iconCopy) {
        startupIo.iconAppliedMs = elapsed();
        notifyIconApplied();
      }
      return result;
    } finally {
      startupIo.setIconMs = performance.now() - started;
    }
  };

  const Module = require('node:module');
  const load = Module._load;
  Module._load = function (id, ...args) {
    const value = load.call(this, id, ...args);
    if (id === './app-updates.cjs') return { ...value, startAutomaticUpdates: () => () => {} };
    if (id === './background-monitor.cjs') {
      return {
        ...value,
        createBackgroundMonitor(...options) {
          return { ...value.createBackgroundMonitor(...options), start() {} };
        },
      };
    }
    return value;
  };

  let mockReads = 0;
  let blockedWrites = 0;
  app.once('ready', () => {
    void mark('appReadyMs');
    session.fromPartition('persist:moaon-harin-readonly', { cache: false }).fetch = async (_url, options = {}) => {
      if ((options.method || 'GET') !== 'GET') {
        blockedWrites += 1;
        throw Error('Benchmark allows mock reads only');
      }
      mockReads += 1;
      return new Response('', { status: 401 });
    };
    void mark('mockTransportReadyMs');
  });

  app.once('browser-window-created', (_event, window) => {
    void mark('windowCreatedMs');
    const contents = window.webContents;
    contents.setBackgroundThrottling(false);
    contents.once('did-start-loading', () => void mark('navigationStartedMs'));
    contents.once('dom-ready', () => void mark('domReadyMs'));
    const loaded = new Promise(resolve => {
      contents.once('did-finish-load', () => resolve(mark('loadFinishedMs')));
    });
    const ready = new Promise(resolve => {
      window.once('ready-to-show', () => resolve(mark('readyToShowMs')));
    });
    void Promise.all([loaded, ready]).then(async () => {
      await emit({ report: { io: ioReport() } });
      if (iconDelay) {
        const { setTimeout: sleep } = require('node:timers/promises');
        const cancelWait = new AbortController();
        try {
          await Promise.race([
            iconApplied,
            sleep(30_000 + iconDelay, undefined, { signal: cancelWait.signal }),
          ]);
        } finally {
          cancelWait.abort();
        }
        const iconCheck = {
          delayMs: iconDelay,
          heldMs: Math.round(startupIo.iconWriteStartedMs - startupIo.iconWriteRequestedMs),
          navigationBeforeWrite: phases.navigationStartedMs < startupIo.iconWriteRequestedMs,
          windowReadyBeforeWrite: phases.readyToShowMs < startupIo.iconWriteRequestedMs,
          appliedAfterWrite: startupIo.iconWriteFinishedMs <= startupIo.iconAppliedMs,
        };
        await emit({ report: { io: ioReport(), iconCheck } });
        if (!iconCheck.navigationBeforeWrite || !iconCheck.windowReadyBeforeWrite || !iconCheck.appliedAfterWrite) {
          return fail('DEFERRED_ICON_CHECK_FAILED');
        }
      }
      const renderer = await contents.executeJavaScript(`(${measureRenderer})(${process.env.MOAON_STARTUP_MEASURE_UI === '1'})`);
      if (renderer.failure) {
        await emit({ report: { renderer, mockReads, blockedWrites, hidden: !window.isVisible() } });
        return fail(renderer.failure);
      }
      if (mockReads < 1 || blockedWrites > 0 || window.isVisible()) {
        return fail('ISOLATION_CHECK_FAILED');
      }
      await emit({ report: { renderer, mockReads, blockedWrites, hidden: true } });
      app.exit(0);
    }).catch(() => fail('RENDERER_SCRIPT_FAILED'));
  });
  void mark('beforeMainMs');
  require('./isolated-bootstrap.cjs');
  void mark('afterMainRequireMs');
}

async function measureRenderer(measureUi) {
  const navigation = performance.getEntriesByType('navigation')[0];
  const round = Math.round;
  const report = {
    domContentLoadedMs: round(navigation.domContentLoadedEventEnd),
    navigationLoadMs: round(navigation.loadEventEnd),
  };
  const started = performance.now();
  try {
    const probe = await window.moaonHub.viewActive();
    report.mockLoginProbeMs = round(performance.now() - started);
    report.mockLoginStatus = probe.status;
  } catch {
    report.failure = 'MOCK_LOGIN_PROBE_FAILED';
  }
  if (report.mockLoginStatus !== 'LOGIN_REQUIRED') report.failure ||= 'UNEXPECTED_MOCK_LOGIN_STATUS';
  if (report.failure) return report;
  if (!measureUi) return report;

  // Chromium throttles animation frames in a hidden window. Measure through
  // synchronous layout here, with no dependency on frame presentation.
  const layout = () => orderList.getBoundingClientRect();
  displayMode = 'sample';
  selectedChannel = 'ALL';
  const shell = document.querySelector('.preview-shell');
  shell.hidden = false;
  shell.inert = false;
  document.querySelector('#entry-screen').hidden = true;
  showRoute('today');
  layout();

  const firstList = performance.now();
  displayedOrders = Array.from({ length: 20 }, (_, index) => ({
    ...sampleOrders[index % sampleOrders.length],
    id: `PERF-${index}`,
  }));
  renderOrders();
  showRoute('orders');
  const bounds = layout();
  report.firstFixtureListMs = round(performance.now() - firstList);
  if (orderList.querySelectorAll('.order-row').length !== 20 || !bounds.height) {
    report.failure = 'ORDER_FIXTURE_DID_NOT_RENDER';
    return report;
  }

  report.orderMenuReturnMs = [];
  report.orderSearchMs = [];
  for (let index = 0; index < 5; index += 1) {
    showRoute('today');
    layout();
    const tab = performance.now();
    showRoute('orders');
    layout();
    report.orderMenuReturnMs.push(round(performance.now() - tab));

    const search = performance.now();
    orderSearch.value = 'PERF-19';
    renderOrders();
    layout();
    report.orderSearchMs.push(round(performance.now() - search));
    const rows = orderList.querySelectorAll('.order-row');
    if (rows.length !== 1 || rows[0].dataset.orderId !== 'PERF-19') {
      report.orderSearchMatches = rows.length;
      report.failure = 'ORDER_SEARCH_DID_NOT_FILTER';
      return report;
    }
    orderSearch.value = '';
    renderOrders();
    layout();
  }
  return report;
}
