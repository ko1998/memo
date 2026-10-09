const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 数据
  getMemos: () => ipcRenderer.invoke('memos:get'),
  updateMemos: (memos) => ipcRenderer.invoke('memos:update', memos),
  onMemosChanged: (cb) => ipcRenderer.on('memos:changed', (_e, memos) => cb(memos)),
  // 悬浮窗控制
  minimize: () => ipcRenderer.send('win:minimize'),
  togglePin: () => ipcRenderer.invoke('win:toggle-pin'),
  toggleBounce: () => ipcRenderer.invoke('win:toggle-bounce'),
  getState: () => ipcRenderer.invoke('win:get-state'),
  getSize: () => ipcRenderer.invoke('win:get-size'),
  setSize: (w, h) => ipcRenderer.send('win:set-size', w, h),
  onBounceState: (cb) => ipcRenderer.on('bounce-state', (_e, v) => cb(v)),
});
