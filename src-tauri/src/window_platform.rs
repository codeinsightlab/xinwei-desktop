//! Shared window roles live in tauri.conf.json; native differences stay here.

pub fn create_windows(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::Manager;
    for config in &app.config().app.windows {
        if app.get_webview_window(&config.label).is_some() {
            continue;
        }
        let builder = tauri::WebviewWindowBuilder::from_config(app, config)?;
        #[cfg(target_os = "macos")]
        let builder = builder.accept_first_mouse(config.label == "widget");
        #[cfg(windows)]
        let builder = builder.skip_taskbar(config.label == "widget");
        builder.build()?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn application_state(app: &tauri::AppHandle) -> Result<(bool, bool), String> {
    fn inspect(mtm: objc2_foundation::MainThreadMarker) -> (bool, bool) {
        use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
        let application = NSApplication::sharedApplication(mtm);
        (
            application.activationPolicy() == NSApplicationActivationPolicy::Regular,
            application.isHidden(),
        )
    }
    if let Some(mtm) = objc2_foundation::MainThreadMarker::new() {
        return Ok(inspect(mtm));
    }
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.send(
            objc2_foundation::MainThreadMarker::new()
                .map(inspect)
                .unwrap_or((false, false)),
        );
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(2))
        .map_err(|_| "无法确认当前Dock激活策略".into())
}
#[cfg(target_os = "macos")]
pub fn dock_available(app: &tauri::AppHandle) -> Result<bool, String> {
    application_state(app).map(|s| s.0)
}
#[cfg(target_os = "macos")]
pub fn application_hidden(app: &tauri::AppHandle) -> Result<bool, String> {
    application_state(app).map(|s| s.1)
}
#[cfg(not(target_os = "macos"))]
pub fn dock_available(_app: &tauri::AppHandle) -> Result<bool, String> {
    Ok(false)
}
#[cfg(not(target_os = "macos"))]
pub fn application_hidden(_app: &tauri::AppHandle) -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "macos")]
pub fn configure_close_shortcut(app: &tauri::AppHandle) -> tauri::Result<()> {
    install_termination_guard(app)?;
    use tauri::{
        menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
        Manager,
    };

    // AppKit's predefined Close invokes performClose:, which can be disabled
    // for a borderless widget. Keep Cmd+W in the native menu, but route it to
    // the focused window's same hide/draft-confirmation flow as its close button.
    fn replace_close(
        submenu: &Submenu<tauri::Wry>,
        title: &str,
        close: &MenuItem<tauri::Wry>,
    ) -> tauri::Result<usize> {
        let mut replaced = 0;
        for (index, item) in submenu.items()?.iter().enumerate() {
            if let Some(child) = item.as_submenu() {
                replaced += replace_close(child, title, close)?;
            } else if let Some(predefined) = item.as_predefined_menuitem() {
                if predefined.text()?.replace('&', "") == title {
                    #[cfg(debug_assertions)]
                    eprintln!(
                        "[window-close] replacing predefined close in {}",
                        submenu.text()?
                    );
                    submenu.remove_at(index)?;
                    submenu.insert(close, index)?;
                    replaced += 1;
                }
            }
        }
        Ok(replaced)
    }
    let menu = Menu::default(app)?;
    // An unattached predefined item reports its mnemonic (C&lose Window),
    // while an inserted native item reports the visible text (Close Window).
    let title = PredefinedMenuItem::close_window(app, None)?
        .text()?
        .replace('&', "");
    let close = MenuItem::with_id(app, "close-focused-window", &title, true, Some("Cmd+W"))?;
    let mut replaced = 0;
    for item in menu.items()? {
        if let Some(submenu) = item.as_submenu() {
            replaced += replace_close(submenu, &title, &close)?;
        }
    }
    if replaced == 0 {
        return Err(std::io::Error::other("未找到原生关闭菜单，无法配置⌘W").into());
    }
    app.set_menu(menu)?;
    // Settings is an application command, not a global system shortcut.
    if let Some(menu) = app.menu() {
        if let Some(first) = menu.items()?.first().and_then(|item| item.as_submenu()) {
            first.insert(
                &MenuItem::with_id(app, "open-settings", "设置…", true, Some("Cmd+,"))?,
                2,
            )?;
        }
    }
    app.on_menu_event(|app, event| {
        #[cfg(debug_assertions)]
        eprintln!("[window-close] menu event {}", event.id().as_ref());
        if event.id().as_ref() == "open-settings" {
            if let Err(e) = crate::app_behavior::open_settings(app) {
                crate::error_notice(app, &e);
            }
            return;
        }
        if event.id().as_ref() != "close-focused-window" {
            return;
        }
        for window in app.webview_windows().into_values() {
            #[cfg(debug_assertions)]
            eprintln!(
                "[window-close] {} visible={:?} focused={:?}",
                window.label(),
                window.is_visible(),
                window.is_focused()
            );
            match (window.is_visible(), window.is_focused()) {
                (Ok(true), Ok(true)) => {
                    if let Err(error) = crate::app_behavior::close_window(app, window.label()) {
                        eprintln!(
                            "macOS close-focused-window emit failed ({}): {error}",
                            window.label()
                        );
                    }
                    break;
                }
                (Err(error), _) | (_, Err(error)) => {
                    eprintln!(
                        "macOS close-focused-window inspect failed ({}): {error}",
                        window.label()
                    );
                }
                _ => {}
            }
        }
    });
    Ok(())
}

#[cfg(target_os="macos")]
fn install_termination_guard(app:&tauri::AppHandle)->tauri::Result<()> {
    use objc2::{runtime::{AnyObject,AnyClass,Sel,Imp},sel,Encode};
    use objc2_app_kit::{NSApplication,NSApplicationTerminateReply};
    use std::sync::OnceLock;
    static APPLICATION:OnceLock<tauri::AppHandle>=OnceLock::new();
    unsafe extern "C-unwind" fn should_terminate(_object:&AnyObject,_selector:Sel,_sender:&NSApplication)->NSApplicationTerminateReply {
        use std::sync::atomic::Ordering;
        use tauri::Manager;
        if let Some(app)=APPLICATION.get(){
            if app.state::<crate::Desktop>().exiting.load(Ordering::Relaxed){return NSApplicationTerminateReply::TerminateNow;}
            if let Err(e)=crate::app_behavior::request_quit(app){crate::error_notice(app,&e);}
        }
        NSApplicationTerminateReply::TerminateCancel
    }
    if APPLICATION.get().is_some(){return Ok(());}
    let mtm=objc2::MainThreadMarker::new().ok_or_else(||std::io::Error::other("退出保护必须在主线程安装"))?;
    let delegate=NSApplication::sharedApplication(mtm).delegate().ok_or_else(||std::io::Error::other("无法读取应用终止代理"))?;
    let object:&AnyObject=(&*delegate).as_ref();
    let class=object.class();
    let selector=sel!(applicationShouldTerminate:);
    // Locked Tao 0.37.2 delegate has no should-terminate method. Add only this
    // optional protocol method, preserving all existing delegate methods/ivars.
    // Fail explicitly if an upgraded runtime already owns the method; never swizzle it.
    if class.instance_method(selector).is_some(){return Err(std::io::Error::other("应用终止代理已有实现，请核对退出保护兼容性").into());}
    let _=APPLICATION.set(app.clone());
    let types=std::ffi::CString::new(format!("{}@:@",NSApplicationTerminateReply::ENCODING)).unwrap();
    // SAFETY: Objective-C method ABI is (id, SEL, NSApplication*) -> NSUInteger;
    // the encoding comes from the bound return type. Installation is main-thread
    // only, on the existing application delegate class, without changing layout.
    let imp:Imp=unsafe{std::mem::transmute(should_terminate as unsafe extern "C-unwind" fn(&AnyObject,Sel,&NSApplication)->NSApplicationTerminateReply)};
    let added=unsafe{objc2::ffi::class_addMethod(class as *const AnyClass as *mut AnyClass,selector,imp,types.as_ptr())};
    if !added.as_bool(){return Err(std::io::Error::other("无法安装原生退出保护").into());}
    // Refresh optional-delegate-method discovery, retaining and reusing the exact
    // same Tao delegate rather than replacing its other system integrations.
    let application=NSApplication::sharedApplication(mtm);
    application.setDelegate(None);
    application.setDelegate(Some(&delegate));
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn configure_close_shortcut(_app: &tauri::AppHandle) -> tauri::Result<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn configure(app: &tauri::AppHandle) -> tauri::Result<()> {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior, NSWindowTabbingMode};
    use tauri::Manager;

    // Called from setup on the main thread. Both webview windows belong to the
    // same application, but must never be merged into a native tab group.
    for label in ["widget", "settings"] {
        if let Some(window) = app.get_webview_window(label) {
            let native = unsafe { &*window.ns_window()?.cast::<NSWindow>() };
            native.setTabbingMode(NSWindowTabbingMode::Disallowed);
            if label == "widget" {
                native.setMovable(true);
                window.set_visible_on_all_workspaces(true)?;
                native.setCollectionBehavior(
                    native.collectionBehavior() | NSWindowCollectionBehavior::FullScreenAuxiliary,
                );
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn start_dragging(window: &tauri::WebviewWindow) -> Result<(), String> {
    use objc2_app_kit::{NSEvent, NSEventType, NSWindow};
    use objc2_foundation::NSProcessInfo;

    // Called on the AppKit main thread. Do not use NSApp.currentEvent(): the
    // original DOM mouse-down has crossed IPC and may no longer be current.
    // Only begin while the physical primary button remains held; a late IPC
    // request after mouse-up must not start a new drag.
    if NSEvent::pressedMouseButtons() & 1 == 0 {
        return Ok(());
    }
    let native = unsafe {
        &*window
            .ns_window()
            .map_err(|_| "无法读取小窗")?
            .cast::<NSWindow>()
    };
    let location = native.convertPointFromScreen(NSEvent::mouseLocation());
    let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
        NSEventType::LeftMouseDown,
        location,
        NSEvent::modifierFlags_class(),
        NSProcessInfo::processInfo().systemUptime(),
        native.windowNumber(),
        None,
        0,
        1,
        1.0,
    ).ok_or("无法开始拖动小窗")?;
    native.performWindowDragWithEvent(&event);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn start_dragging(window: &tauri::WebviewWindow) -> Result<(), String> {
    window
        .start_dragging()
        .map_err(|_| "无法开始拖动小窗".into())
}

#[cfg(not(target_os = "macos"))]
pub fn configure(_app: &tauri::AppHandle) -> tauri::Result<()> {
    Ok(())
}
