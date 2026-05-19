const { app, BrowserWindow, Tray, Menu, globalShortcut, screen, ipcMain, desktopCapturer, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let passthrough = false;
let alwaysOnTop = true;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 500, height: 220,
    x: width - 520, y: height - 260,
    frame: false, transparent: true,
    alwaysOnTop: true, resizable: true,
    minWidth: 300, minHeight: 120,
    skipTaskbar: true, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile('renderer.html');
  mainWindow.setVisibleOnAllWorkspaces(true);
}

function refreshTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: (alwaysOnTop ? '✓ ' : '    ') + '窗口置顶',
      click: () => {
        alwaysOnTop = !alwaysOnTop;
        mainWindow.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
        mainWindow.webContents.send('ontop-changed', alwaysOnTop);
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    { label: (passthrough ? '✓ ' : '    ') + '鼠标穿透 (Ctrl+Shift+P)',
      click: () => {
        passthrough = !passthrough;
        mainWindow.setIgnoreMouseEvents(passthrough, { forward: true });
        mainWindow.webContents.send('passthrough-changed', passthrough);
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    { label: '显示/隐藏 (Ctrl+Shift+V)', click: () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }},
    { type: 'separator' },
    { label: '退出 (Ctrl+Shift+Q)', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('桌面音频可视化器');
  refreshTrayMenu();
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  globalShortcut.register('CmdOrCtrl+Shift+V', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  globalShortcut.register('CmdOrCtrl+Shift+Q', () => { app.quit(); });

  globalShortcut.register('CmdOrCtrl+Shift+T', () => {
    alwaysOnTop = !alwaysOnTop;
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
    mainWindow.webContents.send('ontop-changed', alwaysOnTop);
    refreshTrayMenu();
  });

  globalShortcut.register('CmdOrCtrl+Shift+P', () => {
    passthrough = !passthrough;
    mainWindow.setIgnoreMouseEvents(passthrough, { forward: true });
    mainWindow.webContents.send('passthrough-changed', passthrough);
    refreshTrayMenu();
  });

  ipcMain.handle('get-audio-source-id', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    for (const src of sources) {
      if (src.name === 'Entire Screen' || src.name.includes('Screen')) return src.id;
    }
    return sources.length > 0 ? sources[0].id : null;
  });

  ipcMain.on('toggle-passthrough', (_e, enable) => {
    passthrough = enable;
    mainWindow.setIgnoreMouseEvents(enable, { forward: true });
    refreshTrayMenu();
  });

  ipcMain.on('toggle-ontop', (_e, enable) => {
    alwaysOnTop = enable;
    mainWindow.setAlwaysOnTop(enable, 'screen-saver');
    refreshTrayMenu();
  });
});

app.on('window-all-closed', () => {});
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
