use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition, PhysicalSize,
};

#[derive(Serialize, Deserialize, Clone)]
struct Memo {
    id: String,
    text: String,
    done: bool,
    #[serde(rename = "createdAt", default)]
    created_at: i64,
    #[serde(rename = "completedAt", default)]
    completed_at: Option<i64>,
}

struct AppState {
    memos: Vec<Memo>,
    bounce: bool,
}

/// 托盘图标需要被持有，否则会被释放导致图标消失
#[allow(dead_code)]
struct TrayState(tauri::tray::TrayIcon);

/// 数据文件路径：与 Electron 版保持一致（Windows 下 %APPDATA%\memo\memos.json）
fn data_file(app: &tauri::AppHandle) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(roaming) = std::env::var("APPDATA") {
            return PathBuf::from(roaming).join("memo").join("memos.json");
        }
    }
    app.path()
        .app_data_dir()
        .unwrap_or_default()
        .join("memo")
        .join("memos.json")
}

fn load_memos(app: &tauri::AppHandle) -> Vec<Memo> {
    match std::fs::read_to_string(data_file(app)) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn persist(app: &tauri::AppHandle, memos: &[Memo]) {
    let f = data_file(app);
    if let Some(dir) = f.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(s) = serde_json::to_string_pretty(memos) {
        let _ = std::fs::write(f, s);
    }
}

// ---------- IPC ----------
#[tauri::command]
fn get_memos(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Vec<Memo> {
    state.lock().unwrap().memos.clone()
}

#[tauri::command]
fn update_memos(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    memos: Vec<Memo>,
) {
    {
        let mut s = state.lock().unwrap();
        s.memos = memos.clone();
    }
    persist(&app, &memos);
    let _ = app.emit("memos_changed", memos);
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn toggle_pin(app: tauri::AppHandle) -> bool {
    if let Some(w) = app.get_webview_window("main") {
        let cur = w.is_always_on_top().unwrap_or(false);
        let next = !cur;
        let _ = w.set_always_on_top(next);
        return next;
    }
    false
}

#[tauri::command]
fn toggle_bounce(app: tauri::AppHandle, state: tauri::State<'_, Arc<Mutex<AppState>>>) -> bool {
    let next = {
        let mut s = state.lock().unwrap();
        s.bounce = !s.bounce;
        s.bounce
    };
    if next {
        start_bounce(app.clone(), state.inner().clone());
    }
    let _ = app.emit("bounce_state", next);
    next
}

#[tauri::command]
fn get_state(app: tauri::AppHandle, state: tauri::State<'_, Arc<Mutex<AppState>>>) -> serde_json::Value {
    let pin = app
        .get_webview_window("main")
        .and_then(|w| w.is_always_on_top().ok())
        .unwrap_or(false);
    let bounce = state.lock().unwrap().bounce;
    json!({ "pin": pin, "bounce": bounce })
}

#[tauri::command]
fn get_size(app: tauri::AppHandle) -> serde_json::Value {
    let Some(w) = app.get_webview_window("main") else {
        return json!({ "width": 300, "height": 420, "scale": 1 });
    };
    let phys = w.inner_size().unwrap_or(PhysicalSize::new(300, 420));
    let scale = w.scale_factor().unwrap_or(1.0);
    let width = phys.width as f64 / scale;
    let height = phys.height as f64 / scale;
    json!({ "width": width, "height": height, "scale": 1 })
}

#[tauri::command]
fn set_size(app: tauri::AppHandle, w: f64, h: f64) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_size(tauri::LogicalSize::new(w, h));
    }
}

// ---------- 对角移动 ----------
fn start_bounce(app: tauri::AppHandle, state: Arc<Mutex<AppState>>) {
    thread::spawn(move || {
        let mut vx: f64 = 3.0;
        let mut vy: f64 = 3.0;
        loop {
            if !state.lock().unwrap().bounce {
                break;
            }
            let Some(w) = app.get_webview_window("main") else {
                break;
            };
            let Ok(Some(monitor)) = w.current_monitor() else {
                thread::sleep(Duration::from_millis(30));
                continue;
            };
            let wa = monitor.work_area();
            let pos = w.outer_position().unwrap_or(PhysicalPosition::new(0, 0));
            let size = w.outer_size().unwrap_or(PhysicalSize::new(300, 420));

            let wa_x = wa.position.x as f64;
            let wa_y = wa.position.y as f64;
            let wa_w = wa.size.width as f64;
            let wa_h = wa.size.height as f64;
            let ww = size.width as f64;
            let wh = size.height as f64;

            let mut nx = pos.x as f64 + vx;
            let mut ny = pos.y as f64 + vy;
            if nx <= wa_x {
                nx = wa_x;
                vx = vx.abs();
            } else if nx + ww >= wa_x + wa_w {
                nx = wa_x + wa_w - ww;
                vx = -vx.abs();
            }
            if ny <= wa_y {
                ny = wa_y;
                vy = vy.abs();
            } else if ny + wh >= wa_y + wa_h {
                ny = wa_y + wa_h - wh;
                vy = -vy.abs();
            }

            let _ = w.set_position(PhysicalPosition::new(nx.round() as i32, ny.round() as i32));
            thread::sleep(Duration::from_millis(30));
        }
    });
}

// ---------- 托盘 ----------
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<tauri::tray::TrayIcon> {
    let show = MenuItem::with_id(app, "show", "显示备忘录", true, None::<&str>)?;
    let bounce = MenuItem::with_id(app, "bounce", "开始/停止移动", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &bounce, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?)
        .tooltip("备忘录")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "bounce" => {
                let state = app.state::<Arc<Mutex<AppState>>>();
                let next = {
                    let mut s = state.lock().unwrap();
                    s.bounce = !s.bounce;
                    s.bounce
                };
                if next {
                    start_bounce(app.clone(), state.inner().clone());
                }
                let _ = app.emit("bounce_state", next);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = Arc::new(Mutex::new(AppState {
                memos: load_memos(app.handle()),
                bounce: false,
            }));
            app.manage(state);

            // 悬浮窗定位到主屏右上角
            if let Some(w) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = w.current_monitor() {
                    let wa = monitor.work_area();
                    let size = w.outer_size().unwrap_or(PhysicalSize::new(300, 420));
                    let x = wa.position.x as i32 + wa.size.width as i32 - size.width as i32 - 24;
                    let y = wa.position.y as i32 + 24;
                    let _ = w.set_position(PhysicalPosition::new(x, y));
                }
            }

            let tray = build_tray(app.handle())?;
            app.manage(TrayState(tray));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_memos,
            update_memos,
            hide_window,
            toggle_pin,
            toggle_bounce,
            get_state,
            get_size,
            set_size
        ])
        .run(tauri::generate_context!())
        .expect("运行备忘录失败");
}
