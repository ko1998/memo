// Tauri 版 API 桥接：把 __TAURI__ 全局对象映射成 renderer.js 依赖的 window.api。
// 仅当 Electron 的 preload 未注入 window.api、且运行在 Tauri 中时才生效。
if (!window.api && window.__TAURI__) {
  const invoke = window.__TAURI__.core.invoke;
  const listen = window.__TAURI__.event.listen;

  window.api = {
    // 数据
    getMemos: () => invoke('get_memos'),
    updateMemos: (memos) => invoke('update_memos', { memos }),
    onMemosChanged: (cb) => listen('memos_changed', (e) => cb(e.payload)),
    // 悬浮窗控制
    minimize: () => invoke('hide_window'),
    togglePin: () => invoke('toggle_pin'),
    toggleBounce: () => invoke('toggle_bounce'),
    getState: () => invoke('get_state'),
    getSize: () => invoke('get_size'),
    setSize: (w, h) => invoke('set_size', { w, h }),
    onBounceState: (cb) => listen('bounce_state', (e) => cb(e.payload)),
  };
}
