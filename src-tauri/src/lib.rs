mod config;
mod engagement;
mod window_platform;
mod app_behavior;
#[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
compile_error!("薪慰 macOS 版本仅支持 Apple Silicon，请使用 aarch64-apple-darwin 目标。");
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
#[cfg(not(target_os = "macos"))]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt;

struct Desktop {
    store: Mutex<Store>,
    tray_ok: AtomicBool,
    exiting: AtomicBool,
    position_dirty: AtomicBool,
    finalizing: AtomicBool,
    behavior: Mutex<app_behavior::ApplicationBehavior>,
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
    if label == "widget" {
        let _ = w.emit("widget-visibility-changed", true);
    }
    if focus {
        w.unminimize().map_err(|_| "无法恢复窗口")?;
        w.set_focus().map_err(|_| "无法激活窗口")?;
    }
    let _ = w.emit("refresh-now", ());
    Ok(())
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
    if app.state::<Desktop>().finalizing.load(Ordering::Relaxed) { return Err("正在完成退出，未提交新的修改。".into()); }
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
    today_update: Option<config::TodaySettingsUpdate>,
) -> Result<Config, String> {
    let mut s = state.store.lock().map_err(|_| "配置服务不可用")?;
    let mut config = config;
    config.engagement = s.config.engagement.clone();
    if s.config.revision != expected_revision {
        return Err("配置已更新，草稿已保留。请重新预览后保存。".into());
    }
    if let Some(update) = today_update {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "系统时间无法读取")?.as_secs() as i64;
        config::apply_today_update(&s.config, &mut config, update, now)?;
    }
    commit(&app, &mut s, config, expected_revision)
}
#[tauri::command]
fn save_engagement(
    app: AppHandle,
    state: State<Desktop>,
    engagement: serde_json::Value,
    expected_revision: u64,
) -> Result<Config, String> {
    let mut s = state.store.lock().map_err(|_| "配置服务不可用")?;
    if engagement.get("version").and_then(|v| v.as_u64()) != Some(1)
        || !engagement
            .get("days")
            .map(|v| v.is_object())
            .unwrap_or(false)
    {
        return Err("互动记录无法读取".into());
    }
    let mut c = s.config.clone();
    c.engagement = Some(engagement);
    commit(&app, &mut s, c, expected_revision)
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
        "rollingAmount" => c.preferences.rolling_amount = value,
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
fn open_settings(app: AppHandle, section: Option<app_behavior::SettingsPage>) -> Result<(), String> {
    app_behavior::open_settings_page(&app, section)
}
#[tauri::command]
fn take_settings_page(app: AppHandle, window: tauri::WebviewWindow) -> Result<Option<app_behavior::SettingsPage>, String> {
    if window.label() != "settings" { return Err("只能在设置中读取目标页面".into()); }
    Ok(app.state::<Desktop>().behavior.lock().map_err(|_| "窗口服务不可用")?.settings_page.take())
}
#[tauri::command]
fn show_widget(app: AppHandle) -> Result<(), String> {
    app_behavior::show_widget(&app)
}
#[tauri::command]
fn start_widget_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "widget" {
        return Err("此操作仅适用于悬浮窗".into());
    }
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            if let Err(message) = window_platform::start_dragging(&target) {
                error_notice(target.app_handle(), &message);
            }
        })
        .map_err(|_| "无法开始拖动小窗".into())
}
#[tauri::command]
fn is_widget_visible(app: AppHandle) -> Result<bool, String> {
    let w = app.get_webview_window("widget").ok_or("小窗不存在")?;
    Ok(w.is_visible().map_err(|_| "无法读取小窗可见状态")?
        && !w.is_minimized().map_err(|_| "无法读取小窗最小化状态")?)
}
#[tauri::command]
fn hide_window(app: AppHandle, window:tauri::WebviewWindow, label: String) -> Result<(), String> {
    if label!=window.label() {return Err("不能隐藏其他窗口。".into());}
    app_behavior::hide_window(&app,&label)
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
fn quit_app(app: AppHandle) -> Result<(),String> {
    app_behavior::request_quit(&app)
}
#[tauri::command]
fn platform_info(app:AppHandle,window:tauri::WebviewWindow)->app_behavior::PlatformInfo {
    let info=app_behavior::platform_info(&app,window.label());
    #[cfg(debug_assertions)]
    eprintln!("[platform] {} os={} statusItem={} dock={} relaunch={} otherWindow={} canHide={}",window.label(),info.os,info.recovery.status_item,info.recovery.dock,info.recovery.relaunch,info.recovery.other_window,info.can_hide);
    info
}
#[tauri::command]
fn report_window_context(app:AppHandle,window:tauri::WebviewWindow,context:app_behavior::WindowContext)->Result<(),String>{app_behavior::report_context(&app,window.label(),context)}
#[tauri::command]
fn quit_ready(app:AppHandle,window:tauri::WebviewWindow,id:u64,dirty:bool)->Result<(),String>{app_behavior::quit_ready(&app,id,window.label(),dirty)}
#[tauri::command]
fn resolve_quit(app:AppHandle,window:tauri::WebviewWindow,id:u64,allow:bool)->Result<(),String>{if window.label()!="settings"{return Err("退出选择仅由设置确认。".into());}app_behavior::resolve_quit(&app,id,allow)}
#[tauri::command]
fn cancel_quit(app:AppHandle,id:u64,message:Option<String>){app_behavior::cancel_quit(&app,id,message.as_deref().unwrap_or(""));}
// A monochrome template lets macOS choose a readable menu-bar color in both themes.
#[cfg(target_os = "macos")]
fn menubar_icon() -> tauri::image::Image<'static> {
    let mut rgba = vec![0; 44 * 44 * 4];
    for y in 0..44 {
        for x in 0..44 {
            let dx = x as f64 - 21.5;
            let dy = y as f64 - 21.5;
            let radius = (dx * dx + dy * dy).sqrt();
            if (15.0..=18.0).contains(&radius)
                || ((20..=23).contains(&x) && (10..=23).contains(&y))
                || ((21..=31).contains(&x) && (20..=23).contains(&y))
            {
                rgba[(y * 44 + x) * 4 + 3] = 255;
            }
        }
    }
    tauri::image::Image::new_owned(rgba, 44, 44)
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
            let area = m.work_area();
            let p = &area.position;
            let s = &area.size;
            pos.x >= p.x
                && pos.y >= p.y
                && pos.x as i64 + size.width as i64 <= p.x as i64 + s.width as i64
                && pos.y as i64 + size.height as i64 <= p.y as i64 + s.height as i64
        });
        if !visible {
            if let Ok(Some(m)) = w.primary_monitor() {
                let area = m.work_area();
                let p = &area.position;
                let s = &area.size;
                let _ = w.set_position(tauri::PhysicalPosition::new(
                    p.x + s.width.saturating_sub(size.width + 24) as i32,
                    p.y + 40,
                ));
            }
        }
    }
}
fn save_position(app: &AppHandle) {
    if let Err(e)=save_position_checked(app){eprintln!("save-window-position failed: {e}");}
}
fn save_position_checked(app:&AppHandle)->Result<(),String> {
    let state = app.state::<Desktop>();
    if let Some(w) = app.get_webview_window("widget") {
        let p=w.outer_position().map_err(|_|"无法读取小窗位置")?;
        let s=state.store.try_lock().map_err(|_|"配置保存仍在进行，请稍后重试")?;
        config::atomic_write(
                    &s.directory.join("window.json"),
                    serde_json::json!({"x":p.x,"y":p.y}).to_string().as_bytes(),
                )?;
    }
    Ok(())
}
pub fn run() {
    let autostart = tauri_plugin_autostart::Builder::new()
        .app_name("Xinwei")
        .arg("--autostart");
    #[cfg(target_os = "macos")]
    let autostart = autostart.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            let result=if args.iter().any(|a|a=="--autostart"){app_behavior::background_launch(app,true)}else{app_behavior::activate(app)};
            if let Err(e)=result{error_notice(app,&e);}
        }))
        .plugin(autostart.build())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            save_engagement,
            set_preference,
            open_settings,
            take_settings_page,
            show_widget,
            hide_window,
            is_widget_visible,
            start_widget_drag,
            finish_setup,
            show_demo,
            start_fresh,
            reset_data,
            quit_app,platform_info,report_window_context,quit_ready,resolve_quit,cancel_quit
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
                finalizing: AtomicBool::new(false),
                behavior: Mutex::new(app_behavior::ApplicationBehavior::default()),
            });
            window_platform::create_windows(app.handle())?;
            window_platform::configure(app.handle())?;
            window_platform::configure_close_shortcut(app.handle())?;
            if let Some(w) = app.get_webview_window("widget") {
                let _ = w.set_always_on_top(config.preferences.always_on_top);
                if let Some(v) = position {
                    if let (Some(x), Some(y)) = (v["x"].as_i64(), v["y"].as_i64()) {
                        let _ = w.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                    }
                } else if let Ok(Some(m)) = w.primary_monitor() {
                    let size = w.outer_size()?;
                    let area = m.work_area();
                    let _ = w.set_position(tauri::PhysicalPosition::new(
                        area.position.x + area.size.width.saturating_sub(size.width + 24) as i32,
                        area.position.y + 16,
                    ));
                }
            }
            #[cfg(not(target_os = "macos"))]
            let icon = app
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| tauri::image::Image::new_owned(vec![66; 32 * 32 * 4], 32, 32));
            #[cfg(target_os = "macos")]
            let icon = menubar_icon();
            let tray = TrayIconBuilder::with_id("xinwei")
                .icon(icon)
                .icon_as_template(cfg!(target_os = "macos"))
                .tooltip(format!("{} · 每一秒，都算数",app.config().product_name.as_deref().unwrap_or("薪慰")))
                .menu(&tray_menu(app.handle(), &config)?)
                .show_menu_on_left_click(cfg!(target_os = "macos"));
            #[cfg(not(target_os = "macos"))]
            let tray = tray.on_tray_icon_event(|tray, event| {
                if matches!(
                    event,
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                ) {
                    if let Err(e)=app_behavior::show_widget(tray.app_handle()){error_notice(tray.app_handle(),&e);}
                }
            });
            let tray = tray
                .on_menu_event(|app, event| {
                    let result = match event.id.as_ref() {
                        "show" => app_behavior::show_widget(app),
                        "settings" => app_behavior::open_settings(app),
                        "hide" => app_behavior::hide_window(app, "widget"),
                        "quit" => {
                            quit_app(app.clone())
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
            if bad || config.profile.is_none() {
                show(app.handle(), "settings", true).map_err(std::io::Error::other)?;
            } else if std::env::args().any(|a|a=="--autostart") {
                app_behavior::background_launch(app.handle(),false).map_err(std::io::Error::other)?;
            } else {
                app_behavior::activate(app.handle()).map_err(std::io::Error::other)?;
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last = SystemTime::now();
                let mut instant = Instant::now();
                #[cfg(debug_assertions)]
                let mut previous_window_state=String::new();
                loop {
                    std::thread::sleep(Duration::from_secs(2));
                    let state = handle.state::<Desktop>();
                    if state.exiting.load(Ordering::Relaxed) {
                        break;
                    }
                    #[cfg(debug_assertions)]
                    {
                        let mut windows=handle.webview_windows().values().map(|w|format!("{}:visible={:?},minimized={:?}",w.label(),w.is_visible(),w.is_minimized())).collect::<Vec<_>>();windows.sort();
                        let status=format!("hidden={:?}; {}",window_platform::application_hidden(&handle),windows.join("; "));
                        if status!=previous_window_state{eprintln!("[platform-window-state] {status}");previous_window_state=status;}
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
                if !w.state::<Desktop>().exiting.load(Ordering::Relaxed) {
                    api.prevent_close();
                    // Emitter::emit broadcasts even when called on a Window.
                    if let Err(e)=app_behavior::close_window(w.app_handle(),w.label()){error_notice(w.app_handle(),&e);}
                }
            }
            WindowEvent::Moved(_) => {
                if w.label() == "widget" {
                    w.state::<Desktop>()
                        .position_dirty
                        .store(true, Ordering::Relaxed);
                }
            }
            WindowEvent::Focused(true) => {
                app_behavior::focused(w.app_handle(),w.label());
                let _ = w.emit("refresh-now", ());
            }
            WindowEvent::Focused(false) if w.label() == "widget" => {
                let _ = w.emit("widget-blur", ());
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("无法启动薪慰")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !app.state::<Desktop>().exiting.load(Ordering::Relaxed){api.prevent_exit();if let Err(e)=app_behavior::request_quit(app){error_notice(app,&e);}}
            },
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if let Err(e) = app_behavior::activate(app) {
                    error_notice(app, &e);
                }
            }
            _ => {}
        });
}
