use crate::{
    model::*,
    preview::Preview,
    profile::Profile,
    supervisor::{Status, Supervisor},
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};

pub struct Desktop {
    pub profile: Arc<Mutex<Profile>>,
    pub supervisor: Supervisor,
    pub runtime: PathBuf,
    pub preview: tokio::sync::Mutex<Option<Preview>>,
    pub quitting: AtomicBool,
    pub isolated: bool,
    pub operations: tokio::sync::Mutex<()>,
    pub qa_port: Option<u16>,
    pub tray_key: Mutex<String>,
}
pub fn translate(language: &str, message: &str) -> String {
    if language != "en" {
        return message.into();
    }
    static DICTIONARY: std::sync::OnceLock<serde_json::Value> = std::sync::OnceLock::new();
    let dictionary = DICTIONARY
        .get_or_init(|| serde_json::from_str(include_str!("../../src/locale-en.json")).unwrap());
    if let Some(text) = dictionary[message].as_str() {
        return text.into();
    }
    if message.starts_with("Bot 已退出") {
        return "Bot exited; reconnecting automatically".into();
    }
    if message.starts_with("HTTP ") {
        return format!(
            "{} / Not an Activity response",
            message.split(" / ").next().unwrap_or("HTTP error")
        );
    }
    if message
        .chars()
        .any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
    {
        return "The operation could not be completed. Check your settings or file.".into();
    }
    message.into()
}
pub fn native_theme(name: &str) -> Option<tauri::Theme> {
    match name {
        "system" => None,
        "daylight" => Some(tauri::Theme::Light),
        _ => Some(tauri::Theme::Dark),
    }
}
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let Some(state) = app.try_state::<Desktop>() else {
        return;
    };
    let (directory, preferences) = {
        let p = state.profile.lock().unwrap();
        (p.directory.clone(), p.preferences.clone())
    };
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title(translate(&preferences.language, "Yachiyo · 控制中心"))
        .inner_size(1360.0, 900.0)
        .min_inner_size(1030.0, 700.0)
        .data_directory(directory.join("webview2"))
        .theme(native_theme(&preferences.app_theme));
    // Remote debugging is compiled out of distributed builds and only allowed
    // with a separate test profile. There is no production debugging port.
    if cfg!(debug_assertions) && state.isolated {
        if let Some(port) = state.qa_port {
            builder = builder.additional_browser_args(&format!("--remote-debugging-port={port}"));
        }
    }
    if builder.build().is_err() {
        rfd::MessageDialog::new()
            .set_title("Yachiyo")
            .set_description(translate(
                &preferences.language,
                "控制窗口无法打开，请检查 WebView2 Runtime 是否安装。后台服务仍在托盘中运行。",
            ))
            .set_level(rfd::MessageLevel::Error)
            .show();
    }
}
pub fn quit(app: &AppHandle) {
    let state = app.state::<Desktop>();
    if state.quitting.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    let supervisor = state.supervisor.clone();
    tauri::async_runtime::spawn(async move {
        let _ = supervisor.action("shutdown").await;
        app.exit(0);
    });
}
pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    TrayIconBuilder::with_id("yachiyo")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../../assets/tray-offline.png"
        ))?)
        .tooltip("Yachiyo")
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
                show(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| {
            let operation = event.id.as_ref();
            match operation {
                "open" => show(app),
                "quit" => quit(app),
                "start" | "stop" | "restart" | "check" => {
                    let app = app.clone();
                    let operation = operation.to_owned();
                    tauri::async_runtime::spawn(async move {
                        if app
                            .state::<Desktop>()
                            .supervisor
                            .action(&operation)
                            .await
                            .is_err()
                        {
                            let handle = app.clone();
                            let _ = app.run_on_main_thread(move || show(&handle));
                        }
                    });
                }
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}
pub fn update_tray(app: &AppHandle, profile: &Arc<Mutex<Profile>>, status: &Status) {
    let Some(state) = app.try_state::<Desktop>() else {
        return;
    };
    let (language, enabled) = {
        let p = profile.lock().unwrap();
        (p.preferences.language.clone(), p.config.activity_enabled)
    };
    let quality = if status.bot == "online" {
        if !enabled || status.public == "online" {
            "online"
        } else {
            "warning"
        }
    } else {
        "offline"
    };
    let key = format!(
        "{}:{}:{}:{}",
        quality, language, status.wanted, status.reason
    );
    {
        let mut previous = state.tray_key.lock().unwrap();
        if *previous == key {
            return;
        }
        *previous = key;
    }
    let reason = translate(&language, &status.reason);
    let wanted = status.wanted;
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(tray) = app2.tray_by_id("yachiyo") else {
            return;
        };
        let icon = match quality {
            "online" => include_bytes!("../../assets/tray-online.png").as_slice(),
            "warning" => include_bytes!("../../assets/tray-warning.png").as_slice(),
            _ => include_bytes!("../../assets/tray-offline.png").as_slice(),
        };
        if let Ok(image) = tauri::image::Image::from_bytes(icon) {
            let _ = tray.set_icon(Some(image));
        }
        let _ = tray.set_tooltip(Some(
            format!("Yachiyo · {reason}")
                .chars()
                .take(120)
                .collect::<String>(),
        ));
        let t = |s| translate(&language, s);
        let menu = (|| -> tauri::Result<_> {
            let heading = MenuItem::with_id(
                &app2,
                "heading",
                format!(
                    "Yachiyo · {}",
                    t(match quality {
                        "online" => "已连接",
                        "warning" => "Bot 在线，点歌台待检查",
                        _ => "未连接",
                    })
                ),
                false,
                None::<&str>,
            )?;
            let start = MenuItem::with_id(&app2, "start", t("启动"), !wanted, None::<&str>)?;
            let stop = MenuItem::with_id(&app2, "stop", t("停止"), wanted, None::<&str>)?;
            let restart = MenuItem::with_id(&app2, "restart", t("重启"), wanted, None::<&str>)?;
            MenuBuilder::new(&app2)
                .item(&heading)
                .text("open", t("打开控制中心"))
                .separator()
                .item(&start)
                .item(&restart)
                .item(&stop)
                .text("check", t("检查连接"))
                .separator()
                .text("quit", t("退出并停止服务"))
                .build()
        })();
        if let Ok(menu) = menu {
            let _ = tray.set_menu(Some(menu));
        }
    });
}
#[tauri::command]
pub async fn close_control_window(window: tauri::WebviewWindow) -> Result<()> {
    window.destroy().map_err(|_| "无法关闭控制窗口。".into())
}
