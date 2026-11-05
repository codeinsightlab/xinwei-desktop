//! Product-neutral application intents. No salary or dialogue transitions live here.
use crate::Desktop;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::atomic::Ordering,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowContext {
    pub ready: bool,
    pub dirty: bool,
    pub busy: bool,
    pub modal: bool,
}
pub struct LiveContext {
    pub value: WindowContext,
    pub heartbeat: Instant,
    pub resumable: bool,
}
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum QuitStage {
    Preparing,
    Review,
    Finishing,
}
pub struct QuitRequest {
    pub id: u64,
    pub stage: QuitStage,
    pub waiting: BTreeSet<String>,
    pub dirty: bool,
    pub started: Instant,
}
#[derive(Default)]
pub struct ApplicationBehavior {
    pub contexts: BTreeMap<String, LiveContext>,
    pub recent: Option<String>,
    pub quit: Option<QuitRequest>,
    sequence: u64,
    pub settings_page: Option<SettingsPage>,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SettingsPage { Today, Records }

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    pub status_item: bool,
    pub dock: bool,
    pub relaunch: bool,
    pub other_window: bool,
}
impl Recovery {
    pub fn available(&self) -> bool {
        self.status_item || self.dock || self.relaunch || self.other_window
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub os: &'static str,
    pub background_entry: &'static str,
    pub recovery: Recovery,
    pub can_hide: bool,
    pub background_launch: bool,
}
pub fn platform_info(app: &AppHandle, target: &str) -> PlatformInfo {
    let recovery = Recovery {
        status_item: app.state::<Desktop>().tray_ok.load(Ordering::Relaxed)
            && app.tray_by_id("xinwei").is_some(),
        dock: crate::window_platform::dock_available(app).unwrap_or_else(|e| {
            eprintln!("platform dock inspection failed: {e}");
            false
        }),
        // The single-instance plugin is installed before setup; only advertise an existing executable.
        relaunch: std::env::current_exe().is_ok_and(|path| path.is_file()),
        other_window: app.webview_windows().values().any(|w| {
            w.label() != target
                && w.is_visible().unwrap_or(false)
                && !w.is_minimized().unwrap_or(true)
        }),
    };
    PlatformInfo {
        os: if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(windows) {
            "windows"
        } else {
            "other"
        },
        background_entry: if cfg!(target_os = "macos") {
            "菜单栏"
        } else {
            "通知区域"
        },
        can_hide: recovery.available(),
        recovery,
        background_launch: std::env::args().any(|a| a == "--autostart"),
    }
}
pub fn refresh_capabilities(app: &AppHandle) {
    let _ = app.emit("platform-changed", ());
}
fn configured(app: &AppHandle) -> bool {
    app.state::<Desktop>()
        .store
        .try_lock()
        .map(|s| s.config.profile.is_some() && !s.recovery_required)
        .unwrap_or(false)
}
fn quit_active(app: &AppHandle) -> bool {
    app.state::<Desktop>()
        .behavior
        .lock()
        .map(|b| b.quit.is_some())
        .unwrap_or(true)
}
pub fn show_raw(app: &AppHandle, label: &str, focus: bool) -> Result<(), String> {
    #[cfg(debug_assertions)]
    eprintln!("[app-intent] show {label}, focus={focus}");
    crate::show(app, label, focus)?;
    refresh_capabilities(app);
    Ok(())
}
fn protect_quit(app: &AppHandle) -> Result<bool, String> {
    if quit_active(app) {
        show_raw(app, "settings", true)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
pub fn show_widget(app: &AppHandle) -> Result<(), String> {
    if protect_quit(app)? {
        return Ok(());
    }
    show_raw(app, "widget", true)
}
pub fn open_settings(app: &AppHandle) -> Result<(), String> {
    show_raw(app, "settings", true)
}
pub fn open_settings_page(app: &AppHandle, page: Option<SettingsPage>) -> Result<(), String> {
    if protect_quit(app)? { return Ok(()); }
    if let Some(page) = page {
        app.state::<Desktop>().behavior.lock().map_err(|_| "窗口服务不可用")?.settings_page = Some(page);
    }
    open_settings(app)?;
    if page.is_some() {
        // Keep the destination until Settings consumes it, including requests before its listener is ready.
        app.emit_to("settings", "settings-page-requested", ()).map_err(|e| format!("无法切换设置页面: {e}"))?;
    }
    Ok(())
}
pub fn close_window(app: &AppHandle, label: &str) -> Result<(), String> {
    if protect_quit(app)? {
        return Ok(());
    }
    app.emit_to(label, "request-close", ())
        .map_err(|e| format!("无法请求关闭{label}: {e}"))
}
pub fn hide_window(app: &AppHandle, label: &str) -> Result<(), String> {
    if !["widget", "settings"].contains(&label) {
        return Err("窗口不存在".into());
    }
    if quit_active(app) {
        return Err("正在处理退出，请先完成或取消退出。".into());
    }
    if !platform_info(app, label).can_hide {
        return Err("当前没有可用的找回入口，已保留窗口。可从这里明确退出薪慰。".into());
    }
    app.get_webview_window(label)
        .ok_or("窗口不存在")?
        .hide()
        .map_err(|_| "无法隐藏窗口")?;
    #[cfg(debug_assertions)]
    for w in app.webview_windows().values(){eprintln!("[app-intent] after hiding {label}: {} visible={:?}",w.label(),w.is_visible());}
    if let Ok(mut b) = app.state::<Desktop>().behavior.lock() {
        if let Some(c) = b.contexts.get_mut(label) {
            c.resumable = false;
        }
    }
    if label == "widget" {
        let _ = app.emit("widget-visibility-changed", false);
    }
    refresh_capabilities(app);
    Ok(())
}

#[derive(Clone)]
pub struct WindowCandidate {
    pub label: String,
    pub visible: bool,
    pub modal: bool,
    pub dirty: bool,
    pub resumable: bool,
}
pub fn activation_target(
    windows: &[WindowCandidate],
    recent: Option<&str>,
    has_config: bool,
    quitting: bool,
) -> String {
    if quitting {
        return "settings".into();
    }
    for predicate in [0, 1, 2, 3] {
        let eligible = |w: &&WindowCandidate| match predicate {
            0 => w.modal,
            1 => w.dirty,
            2 => w.visible,
            _ => w.resumable,
        };
        let choices: Vec<_> = windows.iter().filter(eligible).collect();
        if let Some(w) = choices
            .iter()
            .find(|w| Some(w.label.as_str()) == recent)
            .or_else(|| choices.first())
        {
            return w.label.clone();
        }
    }
    if has_config { "widget" } else { "settings" }.into()
}
pub fn activate(app: &AppHandle) -> Result<(), String> {
    let (contexts, recent, quitting) = {
        let state = app.state::<Desktop>();
        let b = state.behavior.lock().map_err(|_| "应用行为服务不可用")?;
        (
            b.contexts
                .iter()
                .map(|(k, c)| (k.clone(), (c.value.clone(), c.resumable)))
                .collect::<BTreeMap<_, _>>(),
            b.recent.clone(),
            b.quit.is_some(),
        )
    };
    let windows = app
        .webview_windows()
        .values()
        .map(|w| {
            let ctx = contexts.get(w.label());
            WindowCandidate {
                label: w.label().into(),
                visible: w.is_visible().unwrap_or(false),
                modal: ctx.is_some_and(|c| c.0.modal),
                dirty: ctx.is_some_and(|c| c.0.dirty),
                resumable: ctx.is_some_and(|c| c.1),
            }
        })
        .collect::<Vec<_>>();
    show_raw(
        app,
        &activation_target(&windows, recent.as_deref(), configured(app), quitting),
        true,
    )
}
pub fn background_launch(app: &AppHandle, already_running: bool) -> Result<(), String> {
    if already_running {
        return Ok(());
    }
    if !configured(app) {
        return show_raw(app, "settings", true);
    }
    let show = app
        .state::<Desktop>()
        .store
        .lock()
        .map(|s| s.config.preferences.show_widget_on_launch)
        .unwrap_or(true);
    match background_target(true, show, platform_info(app, "widget").can_hide) {
        Some(label) => show_raw(app, label, label == "settings"),
        None => Ok(()),
    }
}
pub fn background_target(configured: bool, show: bool, recoverable: bool) -> Option<&'static str> {
    if !configured {
        Some("settings")
    } else if show {
        Some("widget")
    } else if !recoverable {
        Some("settings")
    } else {
        None
    }
}
pub fn report_context(app: &AppHandle, label: &str, context: WindowContext) -> Result<(), String> {
    let state = app.state::<Desktop>();
    let mut b = state.behavior.lock().map_err(|_| "应用行为服务不可用")?;
    let resumable =
        b.contexts.get(label).is_some_and(|c| c.resumable) || context.dirty || context.modal;
    b.contexts.insert(
        label.into(),
        LiveContext {
            value: context,
            heartbeat: Instant::now(),
            resumable,
        },
    );
    Ok(())
}
pub fn focused(app: &AppHandle, label: &str) {
    if let Ok(mut b) = app.state::<Desktop>().behavior.lock() {
        b.recent = Some(label.into());
        if let Some(c) = b.contexts.get_mut(label) {
            c.resumable = true;
        }
    }
}

impl ApplicationBehavior {
    pub fn begin_quit(&mut self, labels: BTreeSet<String>) -> (u64, bool) {
        if let Some(q) = &self.quit {
            return (q.id, false);
        }
        self.sequence += 1;
        let id = self.sequence;
        self.quit = Some(QuitRequest {
            id,
            stage: QuitStage::Preparing,
            waiting: labels,
            dirty: false,
            started: Instant::now(),
        });
        (id, true)
    }
    pub fn ready(&mut self, id: u64, label: &str, dirty: bool) -> Option<bool> {
        let q = self.quit.as_mut()?;
        if q.id != id || q.stage != QuitStage::Preparing || !q.waiting.remove(label) {
            return None;
        }
        q.dirty |= label == "settings" && dirty;
        if !q.waiting.is_empty() {
            return None;
        }
        q.stage = if q.dirty {
            QuitStage::Review
        } else {
            QuitStage::Finishing
        };
        Some(q.dirty)
    }
    pub fn cancel(&mut self, id: u64) -> bool {
        if self.quit.as_ref().is_some_and(|q| q.id == id) {
            self.quit = None;
            true
        } else {
            false
        }
    }
    pub fn approve(&mut self, id: u64) -> bool {
        if let Some(q) = self.quit.as_mut() {
            if q.id == id && q.stage == QuitStage::Review {
                q.stage = QuitStage::Finishing;
                return true;
            }
        }
        false
    }
}
#[derive(Clone, Serialize)]
pub struct QuitEvent {
    pub id: u64,
    pub message: String,
}
pub fn cancel_quit(app: &AppHandle, id: u64, message: &str) {
    #[cfg(debug_assertions)]
    eprintln!("[app-intent] cancel quit {id}: {message}");
    let cancelled = app
        .state::<Desktop>()
        .behavior
        .lock()
        .map(|mut b| b.cancel(id))
        .unwrap_or(false);
    if cancelled {
        app.state::<Desktop>()
            .finalizing
            .store(false, Ordering::Relaxed);
        let _ = app.emit(
            "quit-cancelled",
            QuitEvent {
                id,
                message: message.into(),
            },
        );
        if !message.is_empty() {
            crate::error_notice(app, message);
            let _ = show_raw(app, "settings", true);
        }
    }
}
pub fn request_quit(app: &AppHandle) -> Result<(), String> {
    let labels = app.webview_windows().keys().cloned().collect();
    let (id, fresh) = {
        let state = app.state::<Desktop>();
        let mut b = state.behavior.lock().map_err(|_| "退出服务不可用")?;
        b.begin_quit(labels)
    };
    if !fresh {
        if app
            .state::<Desktop>()
            .behavior
            .lock()
            .map(|b| {
                b.quit
                    .as_ref()
                    .is_some_and(|q| q.stage == QuitStage::Review)
            })
            .unwrap_or(false)
        {
            let _ = show_raw(app, "settings", true);
        }
        return Ok(());
    }
    #[cfg(debug_assertions)]
    eprintln!("[app-intent] prepare quit {id}");
    if let Err(e) = app.emit(
        "prepare-quit",
        QuitEvent {
            id,
            message: String::new(),
        },
    ) {
        cancel_quit(app, id, "无法联系窗口，已取消退出。");
        return Err(e.to_string());
    }
    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let (timeout, review) = {
            let state = handle.state::<Desktop>();
            let Ok(b) = state.behavior.lock() else {
                return;
            };
            let Some(q) = &b.quit else {
                return;
            };
            if q.id != id {
                return;
            }
            (
                match q.stage {
                    QuitStage::Preparing => q.started.elapsed() > Duration::from_secs(10),
                    QuitStage::Review => b
                        .contexts
                        .get("settings")
                        .is_none_or(|c| c.heartbeat.elapsed() > Duration::from_secs(15)),
                    QuitStage::Finishing => false,
                },
                q.stage == QuitStage::Review,
            )
        };
        // Native hide/minimize may throttle JS timers. Preserve that context rather than treating it as a failed service.
        if timeout
            && review
            && (crate::window_platform::application_hidden(&handle).unwrap_or(false)
                || handle
                    .get_webview_window("settings")
                    .is_some_and(|w| w.is_minimized().unwrap_or(false)))
        {
            continue;
        }
        if timeout {
            cancel_quit(
                &handle,
                id,
                "窗口或保存服务没有响应，已取消退出。草稿仍保留，请稍后重试。",
            );
            return;
        }
    });
    Ok(())
}
pub fn quit_ready(app: &AppHandle, id: u64, label: &str, dirty: bool) -> Result<(), String> {
    #[cfg(debug_assertions)]
    eprintln!("[app-intent] ready quit {id}: {label}, dirty={dirty}");
    let action = app
        .state::<Desktop>()
        .behavior
        .lock()
        .map_err(|_| "退出服务不可用")?
        .ready(id, label, dirty);
    if let Some(needs_review) = action {
        if needs_review {
            #[cfg(debug_assertions)]
            eprintln!("[app-intent] review quit {id}");
            show_raw(app, "settings", true)?;
            app.emit_to(
                "settings",
                "review-quit",
                QuitEvent {
                    id,
                    message: String::new(),
                },
            )
            .map_err(|e| {
                cancel_quit(app, id, "无法显示退出确认，已取消退出。");
                e.to_string()
            })?;
        } else {
            finish_quit(app, id);
        }
    }
    Ok(())
}
pub fn resolve_quit(app: &AppHandle, id: u64, allow: bool) -> Result<(), String> {
    if !allow {
        cancel_quit(app, id, "");
        return Ok(());
    }
    if !app
        .state::<Desktop>()
        .behavior
        .lock()
        .map_err(|_| "退出服务不可用")?
        .approve(id)
    {
        return Err("退出请求已失效，请重新操作。".into());
    }
    finish_quit(app, id);
    Ok(())
}
fn finish_quit(app: &AppHandle, id: u64) {
    app.state::<Desktop>()
        .finalizing
        .store(true, Ordering::Relaxed);
    let app = app.clone();
    std::thread::spawn(move || {
        // Never force an exit after a delay: wait for the Store barrier, or cancel safely.
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let state = app.state::<Desktop>();
            if !state
                .behavior
                .lock()
                .map(|b| {
                    b.quit
                        .as_ref()
                        .is_some_and(|q| q.id == id && q.stage == QuitStage::Finishing)
                })
                .unwrap_or(false)
            {
                return;
            }
            if let Ok(guard) = state.store.try_lock() {
                drop(guard);
                break;
            }
            if Instant::now() >= deadline {
                cancel_quit(
                    &app,
                    id,
                    "保存服务没有响应，已取消退出，请等待保存完成后重试。",
                );
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        if let Err(e) = crate::save_position_checked(&app) {
            cancel_quit(&app, id, &format!("退出前保存失败：{e}"));
            return;
        }
        app.state::<Desktop>()
            .exiting
            .store(true, Ordering::Relaxed);
        #[cfg(debug_assertions)]
        eprintln!("[app-intent] persisted and finishing quit {id}");
        app.exit(0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn labels() -> BTreeSet<String> {
        ["widget".into(), "settings".into()].into_iter().collect()
    }
    #[test]
    fn quit_waits_for_all_windows_and_has_one_reentrant_transaction() {
        let mut b = ApplicationBehavior::default();
        let (id, fresh) = b.begin_quit(labels());
        assert!(fresh);
        assert_eq!(b.begin_quit(labels()), (id, false));
        assert_eq!(b.ready(id, "widget", false), None);
        assert_eq!(b.ready(id, "widget", false), None);
        assert_eq!(b.ready(id, "settings", true), Some(true));
        assert_eq!(b.quit.as_ref().unwrap().stage, QuitStage::Review);
        assert_eq!(b.begin_quit(labels()), (id, false));
        assert!(b.approve(id));
        assert!(!b.approve(id));
        assert_eq!(b.quit.as_ref().unwrap().stage, QuitStage::Finishing);
    }
    #[test]
    fn cancel_rearms_protection_and_stale_responses_cannot_exit() {
        let mut b = ApplicationBehavior::default();
        let (old, _) = b.begin_quit(labels());
        assert!(b.cancel(old));
        let (id, fresh) = b.begin_quit(labels());
        assert!(fresh);
        assert_ne!(id, old);
        assert!(!b.cancel(old));
        assert_eq!(b.ready(old, "settings", false), None);
        assert!(!b.approve(old));
        assert_eq!(b.ready(id, "settings", false), None);
        assert_eq!(b.ready(id, "widget", false), Some(false));
        assert_eq!(b.quit.as_ref().unwrap().stage, QuitStage::Finishing);
    }
    #[test]
    fn only_settings_is_a_draft_owner_and_unknown_participants_do_not_ack() {
        let mut b = ApplicationBehavior::default();
        let (id, _) = b.begin_quit(labels());
        assert_eq!(b.ready(id, "other", false), None);
        assert_eq!(b.ready(id, "widget", true), None);
        assert_eq!(b.ready(id, "settings", false), Some(false));
    }
    #[test]
    fn recovery_is_current_capabilities_not_os_or_tray_alone() {
        assert!(!Recovery::default().available());
        for r in [
            Recovery {
                status_item: true,
                ..Recovery::default()
            },
            Recovery {
                dock: true,
                ..Recovery::default()
            },
            Recovery {
                relaunch: true,
                ..Recovery::default()
            },
            Recovery {
                other_window: true,
                ..Recovery::default()
            },
        ] {
            assert!(r.available());
        }
    }
    fn candidate(
        label: &str,
        visible: bool,
        dirty: bool,
        modal: bool,
        resumable: bool,
    ) -> WindowCandidate {
        WindowCandidate {
            label: label.into(),
            visible,
            dirty,
            modal,
            resumable,
        }
    }
    #[test]
    fn activation_preserves_confirmations_drafts_and_visible_context() {
        let mut windows = vec![
            candidate("widget", true, false, false, true),
            candidate("settings", false, true, false, true),
        ];
        assert_eq!(
            activation_target(&windows, Some("widget"), true, false),
            "settings"
        );
        windows[1].dirty = false;
        windows[1].modal = true;
        assert_eq!(
            activation_target(&windows, Some("widget"), true, false),
            "settings"
        );
        windows[1].modal = false;
        windows[0].visible = false;
        windows[1].visible = true;
        assert_eq!(
            activation_target(&windows, Some("widget"), true, false),
            "settings"
        );
        assert_eq!(
            activation_target(&windows, Some("widget"), true, true),
            "settings"
        );
    }
    #[test]
    fn activation_does_not_resurrect_ended_editing_and_background_launch_is_distinct() {
        let windows = vec![candidate("settings", false, false, false, false)];
        assert_eq!(
            activation_target(&windows, Some("settings"), true, false),
            "widget"
        );
        assert_eq!(activation_target(&windows, None, false, false), "settings");
        assert_eq!(background_target(true, false, true), None);
        assert_eq!(background_target(true, false, false), Some("settings"));
        assert_eq!(background_target(false, false, true), Some("settings"));
        assert_eq!(background_target(true, true, true), Some("widget"));
    }
}
