mod config;
use config::{Config, Store};
use serde::Serialize;
use std::{
    fs,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;

struct Desktop {
    store: Mutex<Store>,
    tray_ok: AtomicBool,
    exiting: AtomicBool,
    position_dirty: AtomicBool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadResult {
    config: Config,
    notice: Option<String>,
    recovery_required: bool,
    tray_available: bool,
}
fn error_notice(app: &AppHandle, message: &str) {
    let _ = app.emit("desktop-notice", message);
}
fn show(app: &AppHandle, label: &str, focus: bool) -> Result<(), String> {
    let w = app.get_webview_window(label).ok_or("窗口无法创建")?;
    if label == "widget" {
        clamp_position(&w);
    }
    w.show().map_err(|_| "窗口无法显示")?;
    if focus {
        w.unminimize().map_err(|_| "无法恢复窗口")?;
        w.set_focus().map_err(|_| "无法激活窗口")?;
    }
    let _ = w.emit("refresh-now", ());
    Ok(())
}
fn ready_label(app: &AppHandle) -> &'static str {
    let state = app.state::<Desktop>();
    if state
        .store
        .lock()
        .map(|s| s.config.profile.is_some() && !s.recovery_required)
        .unwrap_or(false)
    {
        "widget"
    } else {
        "settings"
    }
}
#[tauri::command]
fn get_config(app: AppHandle, state: State<Desktop>) -> Result<LoadResult, String> {
    let s = state.store.lock().map_err(|_| "配置服务不可用")?;
    Ok(LoadResult {
        config: s.config.clone(),
        notice: s.notice.clone(),
        recovery_required: s.recovery_required,
        tray_available: app.state::<Desktop>().tray_ok.load(Ordering::Relaxed),
    })
}
fn apply_preferences(app: &AppHandle, previous: &Config, next: &Config) -> Result<(), String> {
    let a = &previous.preferences;
    let b = &next.preferences;
    if a.launch_at_login != b.launch_at_login {
        let result = if b.launch_at_login {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        result.map_err(|_| "无法更改开机启动，设置保持原状")?;
    }
    if a.always_on_top != b.always_on_top {
        if let Some(w) = app.get_webview_window("widget") {
            w.set_always_on_top(b.always_on_top)
                .map_err(|_| "无法更改置顶状态")?;
        }
    }
    Ok(())
}
fn commit(app: &AppHandle, s: &mut Store, c: Config, expected: u64) -> Result<Config, String> {
    c.validate()?;
    if s.config.revision != expected {
        return Err("配置已更新，草稿已保留。请重新预览后保存。".into());
    }
    let previous = s.config.clone();
    if let Err(e) = apply_preferences(app, &previous, &c) {
        let _ = apply_preferences(app, &c, &previous);
        return Err(e);
    }
    match s.commit(c.clone(), expected) {
        Ok(saved) => {
            let _ = app.emit("config-changed", saved.revision);
            sync_tray(app, &saved);
            Ok(saved)
        }
        Err(e) => {
            if apply_preferences(app, &c, &previous).is_err() {
                return Err(format!("{e}；系统偏好回滚失败，请检查开机启动及置顶状态"));
            }
            Err(e)
        }
    }
}
#[tauri::command]
fn save_config(
    app: AppHandle,
    state: State<Desktop>,
    config: Config,
    expected_revision: u64,
) -> Result<Config, String> {
    let mut s = state.store.lock().map_err(|_| "配置服务不可用")?;
    commit(&app, &mut s, config, expected_revision)
}
#[tauri::command]
fn set_preference(
    app: AppHandle,
    state: State<Desktop>,
    key: String,
    value: bool,
) -> Result<Config, String> {
    let mut s = state.store.lock().map_err(|_| "配置服务不可用")?;
    let mut c = s.config.clone();
    let rev = c.revision;
    match key.as_str() {
        "privacyMode" => c.preferences.privacy_mode = value,
        "alwaysOnTop" => c.preferences.always_on_top = value,
        "showFunText" => c.preferences.show_fun_text = value,
        "funMode" => c.preferences.fun_mode = value,
        "launchAtLogin" => c.preferences.launch_at_login = value,
        "showWidgetOnLaunch" => c.preferences.show_widget_on_launch = value,
        "closeHintSeen" => c.preferences.close_hint_seen = value,
        _ => return Err("未知偏好".into()),
    }
    commit(&app, &mut s, c, rev)
}
#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    show(&app, "settings", true)
}
#[tauri::command]
fn show_widget(app: AppHandle) -> Result<(), String> {
    show(&app, ready_label(&app), true)
}
#[tauri::command]
fn hide_window(app: AppHandle, label: String) -> Result<(), String> {
    if !["settings", "widget"].contains(&label.as_str()) {
        return Err("窗口不存在".into());
    }
    if !app.state::<Desktop>().tray_ok.load(Ordering::Relaxed) {
        return Err("托盘不可用，请使用退出按钮结束程序".into());
    }
    app.get_webview_window(&label)
        .ok_or("窗口不存在")?
        .hide()
        .map_err(|_| "无法隐藏窗口".into())
}
#[tauri::command]
fn finish_setup(app: AppHandle) -> Result<(), String> {
    show(&app, "widget", false)?;
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.hide();
    }
    Ok(())
}
#[tauri::command]
fn show_demo(app: AppHandle) -> Result<(), String> {
    let _ = app.emit("demo-mode", ());
    show(&app, "widget", false)
}
#[tauri::command]
fn start_fresh(app: AppHandle, state: State<Desktop>) -> Result<(), String> {
    let mut s = state.store.lock().map_err(|_| "配置服务不可用")?;
    s.preserve_damaged()?;
    let mut c = Config::default();
    c.revision = s.config.revision;
    s.recovery_required = false;
    if let Err(e) = s.commit(c.clone(), c.revision) {
        s.recovery_required = true;
        return Err(e);
    }
    let _ = app.emit("config-changed", s.config.revision);
    Ok(())
}
#[tauri::command]
fn reset_data(app: AppHandle, state: State<Desktop>) -> Result<(), String> {
    app.autolaunch()
        .disable()
        .map_err(|_| "无法关闭开机启动，数据尚未清除")?;
    let mut s = state.store.lock().map_err(|_| "配置服务不可用")?;
    for item in fs::read_dir(&s.directory).map_err(|_| "无法读取数据目录")? {
        let item = item.map_err(|_| "无法读取数据文件")?;
        let name = item.file_name().to_string_lossy().to_string();
        if [
            "config.json",
            "config.backup.json",
            "config.json.tmp",
            "config.backup.json.tmp",
            "window.json",
            "window.json.tmp",
        ]
        .contains(&name.as_str())
            || name.starts_with("config.corrupt-")
        {
            fs::remove_file(item.path()).map_err(|_| "部分数据未能清除，请重试")?;
        }
    }
    s.config = Config::default();
    s.notice = None;
    s.recovery_required = false;
    drop(s);
    if let Some(w) = app.get_webview_window("widget") {
        let _ = w.hide();
        let _ = w.set_always_on_top(true);
    }
    let _ = app.emit("config-changed", 0u64);
    sync_tray(&app, &Config::default());
    show(&app, "settings", true)
}
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.state::<Desktop>()
        .exiting
        .store(true, Ordering::Relaxed);
    save_position(&app);
    app.exit(0);
}
fn sync_tray(app: &AppHandle, c: &Config) {
    if let Some(tray) = app.tray_by_id("xinwei") {
        if let Ok(menu) = tray_menu(app, c) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}
fn tray_menu(app: &AppHandle, c: &Config) -> tauri::Result<Menu<tauri::Wry>> {
    let visible = MenuItem::with_id(app, "show", "显示桌面小窗", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏桌面小窗", true, None::<&str>)?;
    let pin = CheckMenuItem::with_id(
        app,
        "pin",
        "小窗置顶",
        true,
        c.preferences.always_on_top,
        None::<&str>,
    )?;
    let privacy = CheckMenuItem::with_id(
        app,
        "privacy",
        "隐藏金额",
        true,
        c.preferences.privacy_mode,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出薪慰", true, None::<&str>)?;
    Menu::with_items(app, &[&visible, &hide, &pin, &privacy, &settings, &quit])
}
fn clamp_position(w: &tauri::WebviewWindow) {
    if let (Ok(pos), Ok(size), Ok(monitors)) =
        (w.outer_position(), w.outer_size(), w.available_monitors())
    {
        let visible = monitors.iter().any(|m| {
            let p = m.position();
            let s = m.size();
            pos.x >= p.x
                && pos.y >= p.y
                && pos.x as i64 + size.width as i64 <= p.x as i64 + s.width as i64
                && pos.y as i64 + size.height as i64 <= p.y as i64 + s.height as i64
        });
        if !visible {
            if let Ok(Some(m)) = w.primary_monitor() {
                let p = m.position();
                let s = m.size();
                let _ = w.set_position(tauri::PhysicalPosition::new(
                    p.x + s.width.saturating_sub(size.width + 24) as i32,
                    p.y + 40,
                ));
            }
        }
    }
}
fn save_position(app: &AppHandle) {
    let state = app.state::<Desktop>();
    if let Some(w) = app.get_webview_window("widget") {
        if let Ok(p) = w.outer_position() {
            if let Ok(s) = state.store.lock() {
                let _ = config::atomic_write(
                    &s.directory.join("window.json"),
                    serde_json::json!({"x":p.x,"y":p.y}).to_string().as_bytes(),
                );
            }
        }
    }
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = show(app, ready_label(app), true);
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Xinwei")
                .arg("--autostart")
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            set_preference,
            open_settings,
            show_widget,
            hide_window,
            finish_setup,
            show_demo,
            start_fresh,
            reset_data,
            quit_app
        ])
        .setup(|app| {
            let mut store =
                Store::open(app.path().app_data_dir()?).map_err(std::io::Error::other)?;
            if let Ok(actual) = app.autolaunch().is_enabled() {
                store.config.preferences.launch_at_login = actual;
            }
            let config = store.config.clone();
            let bad = store.recovery_required;
            let position = fs::read(store.directory.join("window.json"))
                .ok()
                .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok());
            app.manage(Desktop {
                store: Mutex::new(store),
                tray_ok: AtomicBool::new(false),
                exiting: AtomicBool::new(false),
                position_dirty: AtomicBool::new(false),
            });
            if let Some(w) = app.get_webview_window("widget") {
                let _ = w.set_always_on_top(config.preferences.always_on_top);
                if let Some(v) = position {
                    if let (Some(x), Some(y)) = (v["x"].as_i64(), v["y"].as_i64()) {
                        let _ = w.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                    }
                } else if let Ok(Some(m)) = w.primary_monitor() {
                    let size = w.outer_size()?;
                    let _ = w.set_position(tauri::PhysicalPosition::new(
                        m.position().x + m.size().width.saturating_sub(size.width + 24) as i32,
                        m.position().y + 40,
                    ));
                }
            }
            let icon = app
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| tauri::image::Image::new_owned(vec![66; 32 * 32 * 4], 32, 32));
            let tray = TrayIconBuilder::with_id("xinwei")
                .icon(icon)
                .tooltip("薪慰 · 每一秒，都算数")
                .menu(&tray_menu(app.handle(), &config)?)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                    ) {
                        let _ = show(tray.app_handle(), ready_label(tray.app_handle()), true);
                    }
                })
                .on_menu_event(|app, event| {
                    let result = match event.id.as_ref() {
                        "show" => show(app, ready_label(app), true),
                        "settings" => show(app, "settings", true),
                        "hide" => hide_window(app.clone(), "widget".into()),
                        "quit" => {
                            quit_app(app.clone());
                            Ok(())
                        }
                        "pin" | "privacy" => {
                            let state = app.state::<Desktop>();
                            let value = state
                                .store
                                .lock()
                                .map(|s| {
                                    if event.id.as_ref() == "pin" {
                                        !s.config.preferences.always_on_top
                                    } else {
                                        !s.config.preferences.privacy_mode
                                    }
                                })
                                .unwrap_or(false);
                            set_preference(
                                app.clone(),
                                state,
                                if event.id.as_ref() == "pin" {
                                    "alwaysOnTop".into()
                                } else {
                                    "privacyMode".into()
                                },
                                value,
                            )
                            .map(|_| ())
                        }
                        _ => Ok(()),
                    };
                    if let Err(e) = result {
                        error_notice(app, &e);
                        let _ = show(app, "settings", true);
                    }
                })
                .build(app);
            let tray_ok = tray.is_ok();
            app.state::<Desktop>()
                .tray_ok
                .store(tray_ok, Ordering::Relaxed);
            if bad || config.profile.is_none() || !tray_ok {
                show(app.handle(), "settings", true).map_err(std::io::Error::other)?;
            } else if !std::env::args().any(|a| a == "--autostart")
                || config.preferences.show_widget_on_launch
            {
                show(app.handle(), "widget", false).map_err(std::io::Error::other)?;
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last = SystemTime::now();
                let mut instant = Instant::now();
                loop {
                    std::thread::sleep(Duration::from_secs(2));
                    let state = handle.state::<Desktop>();
                    if state.exiting.load(Ordering::Relaxed) {
                        break;
                    }
                    if state.position_dirty.swap(false, Ordering::Relaxed) {
                        save_position(&handle);
                    }
                    if let Some(w) = handle.get_webview_window("widget") {
                        if w.is_visible().unwrap_or(false) {
                            clamp_position(&w);
                        }
                    }
                    let now = SystemTime::now();
                    let elapsed = instant.elapsed().as_secs_f64();
                    let wall = now
                        .duration_since(last)
                        .map(|d| d.as_secs_f64())
                        .unwrap_or(-1.0);
                    if wall > 5.0 || (wall - elapsed).abs() > 2.0 {
                        let _ = handle.emit("refresh-now", ());
                    }
                    last = now;
                    instant = Instant::now();
                }
            });
            Ok(())
        })
        .on_window_event(|w, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = w.emit("request-close", ());
            }
            WindowEvent::Moved(_) => {
                if w.label() == "widget" {
                    w.state::<Desktop>()
                        .position_dirty
                        .store(true, Ordering::Relaxed);
                }
            }
            WindowEvent::Focused(true) => {
                let _ = w.emit("refresh-now", ());
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("无法启动薪慰");
}
