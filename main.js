const { app, BrowserWindow, Tray, Menu, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createTrayIcon } = require('./icon');

// 固定应用名，保证开发版与打包后的数据目录一致（%APPDATA%\memo）
app.setName('memo');

let contentWin = null; // 悬浮窗：置顶 / 对角移动，内含编辑面板
let tray = null;
let isQuitting = false;

// ---------- 数据（内存 + 磁盘） ----------
const dataFile = () => path.join(app.getPath('userData'), 'memos.json');

function loadMemosFromFile() {
  try {
    if (fs.existsSync(dataFile())) {
      const data = JSON.parse(fs.readFileSync(dataFile(), 'utf-8'));
      return Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.error('读取备忘录失败：', e);
  }
  return [];
}

let memos = loadMemosFromFile();

function persist() {
  try {
    fs.writeFileSync(dataFile(), JSON.stringify(memos, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存备忘录失败：', e);
  }
}

function broadcast(channel, payload) {
  if (contentWin && !contentWin.isDestroyed()) contentWin.webContents.send(channel, payload);
}

function setMemos(next) {
  memos = Array.isArray(next) ? next : [];
  persist();
  broadcast('memos:changed', memos);
}

// ---------- 对角移动（只作用于悬浮内容窗） ----------
let bounce = false;
let vx = 0;
let vy = 0;
let bounceTimer = null;
const SPEED = 3;

function stepBounce() {
  if (!contentWin || contentWin.isDestroyed()) return;
  const [x, y] = contentWin.getPosition();
  const [w, h] = contentWin.getSize();
  const wa = screen.getDisplayNearestPoint({ x, y }).workArea;

  let nx = x + vx;
  let ny = y + vy;
  if (nx <= wa.x) { nx = wa.x; vx = Math.abs(vx); }
  else if (nx + w >= wa.x + wa.width) { nx = wa.x + wa.width - w; vx = -Math.abs(vx); }
  if (ny <= wa.y) { ny = wa.y; vy = Math.abs(vy); }
  else if (ny + h >= wa.y + wa.height) { ny = wa.y + wa.height - h; vy = -Math.abs(vy); }

  contentWin.setPosition(Math.round(nx), Math.round(ny), false);
}

function startBounce() {
  if (bounceTimer) return;
  bounce = true;
  vx = SPEED * (Math.random() < 0.5 ? -1 : 1);
  vy = SPEED;
  bounceTimer = setInterval(stepBounce, 30);
  if (contentWin) contentWin.webContents.send('bounce-state', true);
}

function stopBounce() {
  bounce = false;
  if (bounceTimer) { clearInterval(bounceTimer); bounceTimer = null; }
  if (contentWin && !contentWin.isDestroyed()) contentWin.webContents.send('bounce-state', false);
}

// ---------- 窗口 ----------
function createContentWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const w = 300;
  const h = 420;

  contentWin = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 240,
    minHeight: 300,
    x: workArea.x + workArea.width - w - 24,
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  contentWin.loadFile(path.join(__dirname, 'content', 'index.html'));
  contentWin.setAlwaysOnTop(true, 'floating');
  contentWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  contentWin.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      contentWin.hide();
    }
  });
}

function createTray() {
  let icon = createTrayIcon();
  // macOS 菜单栏图标更小，缩小到合适尺寸
  if (process.platform === 'darwin') icon = icon.resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('备忘录');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示备忘录', click: () => { contentWin.show(); contentWin.focus(); } },
    { label: '开始/停止移动', click: () => { bounce ? stopBounce() : startBounce(); } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => {
    if (contentWin.isVisible()) contentWin.hide();
    else { contentWin.show(); contentWin.focus(); }
  });
}

// ---------- IPC ----------
ipcMain.handle('memos:get', () => memos);
ipcMain.handle('memos:update', (_e, next) => { setMemos(next); return true; });

ipcMain.on('win:minimize', () => { if (contentWin) contentWin.hide(); });

ipcMain.handle('win:toggle-pin', () => {
  const cur = contentWin.isAlwaysOnTop();
  contentWin.setAlwaysOnTop(!cur, 'floating');
  return !cur;
});
ipcMain.handle('win:toggle-bounce', () => {
  if (bounce) stopBounce();
  else startBounce();
  return bounce;
});
ipcMain.handle('win:get-state', () => ({
  pin: contentWin.isAlwaysOnTop(),
  bounce,
}));

ipcMain.handle('win:get-size', () => {
  const [width, height] = contentWin.getSize();
  const scale = screen.getDisplayMatching(contentWin.getBounds()).scaleFactor || 1;
  return { width, height, scale };
});
ipcMain.on('win:set-size', (_e, w, h) => {
  if (!contentWin) return;
  contentWin.setSize(Math.round(w), Math.round(h));
});

// ---------- 启动 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (contentWin) { contentWin.show(); contentWin.focus(); }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.local.memo');
    createContentWindow();
    createTray();
  });

  // macOS：点击 Dock 图标时重新显示悬浮窗
  app.on('activate', () => {
    if (contentWin) contentWin.show();
  });
}
