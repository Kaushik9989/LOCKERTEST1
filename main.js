// main.js — Kiosk Mode
const { app, BrowserWindow, powerSaveBlocker, shell, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const SERVER_URL = process.env.APP_URL || 'http://localhost:3000';
const SERVER_ENTRY = process.env.SERVER_ENTRY || path.join(__dirname, 'server.js');
const SERVER_START_TIMEOUT_MS = 60_000; // give the server up to 60s to boot
const SERVER_PING_INTERVAL_MS = 500;

let serverProcess = null;
let mainWindow = null;
let psbId = null;

/** Wait until the HTTP server responds before creating the window */
function waitForServer(url, timeoutMs, intervalMs) {
  const end = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryPing = () => {
      const req = http.get(url, (res) => {
        // any HTTP status means the server is responding; we don't need 200
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > end) {
          return reject(new Error(`Server did not start within ${timeoutMs} ms`));
        }
        setTimeout(tryPing, intervalMs);
      });
      req.setTimeout(2000, () => {
        req.destroy(new Error('Ping timeout'));
      });
    };
    tryPing();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,      // full screen
    kiosk: true,           // kiosk mode (locks to the app UI)
    frame: false,          // no OS chrome
    autoHideMenuBar: true, // hide menu bar on Windows/Linux
    alwaysOnTop: true,     // keep above other windows (useful in kiosks)
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // optional, if you need it
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false, // disable DevTools in production kiosk
      spellcheck: false
    }
  });

  // Extra safety: remove any menu (macOS/Windows/Linux)
  mainWindow.setMenu(null);

  // Disable zoom/pinch
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  mainWindow.webContents.setZoomFactor(1);

  // Open external links in the OS browser (prevents new Electron windows)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Block navigation away from the kiosk URL (e.g., dropped file, dev attempts)
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(SERVER_URL)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(SERVER_URL).catch(() => { /* handled by fail screen below */ });

  // (Optional) simple fail screen if server dies after load attempt
  mainWindow.webContents.on('did-fail-load', () => {
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <style>
        body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#fff;font-family:system-ui}
        .box{max-width:700px;text-align:center;padding:32px}
        h1{margin:0 0 10px}
        p{opacity:.8}
        button{margin-top:16px;padding:12px 18px;border:0;border-radius:10px;background:#ff7b00;color:#fff;font-weight:700;font-size:16px;cursor:pointer}
      </style>
      <div class="box">
        <h1>Starting…</h1>
        <p>We’re trying to connect to the service. If this takes too long, please check the network or restart.</p>
        <button onclick="location.reload()">Retry</button>
      </div>
    `));
  });
}

function registerShortcuts() {
  // Optional secret exit combo — remove if you want no keyboard escape.
  globalShortcut.register('Control+Alt+Q', () => {
    app.quit();
  });

  // Block common refresh/devtools keys
  const blocked = ['CommandOrControl+R', 'F5', 'CommandOrControl+Shift+R', 'CommandOrControl+Shift+I', 'F12'];
  blocked.forEach(accel => globalShortcut.register(accel, () => {}));
}

function startServer() {
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env },
    stdio: 'inherit',
    windowsHide: true
  });

  serverProcess.on('exit', (code, signal) => {
    console.error(`[server] exited code=${code} signal=${signal}`);
    // If the app is still running, try to relaunch the server once.
    if (!app.isQuitting) {
      setTimeout(() => startServer(), 2000);
    }
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    try { serverProcess.kill(); } catch (_) {}
  }
}

function setupPowerSave() {
  try {
    psbId = powerSaveBlocker.start('prevent-display-sleep');
  } catch (_) {}
}

function teardownPowerSave() {
  if (psbId && powerSaveBlocker.isStarted(psbId)) {
    powerSaveBlocker.stop(psbId);
  }
}

function enforceSingleInstance() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  return true;
}

app.on('ready', async () => {
  if (!enforceSingleInstance()) return;

  setupPowerSave();
  registerShortcuts();
  startServer();

  try {
    await waitForServer(SERVER_URL, SERVER_START_TIMEOUT_MS, SERVER_PING_INTERVAL_MS);
  } catch (err) {
    console.error(err.message);
    // continue; window will show the fail screen then allow retry
  }

  createWindow();
});

app.on('browser-window-created', (_, win) => {
  win.setMenu(null);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  // In kiosk scenarios we usually quit when the single window closes
  app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  teardownPowerSave();
  stopServer();
});

// Extra hardening
app.commandLine.appendSwitch('disable-pinch');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
