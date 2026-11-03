#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod model;
mod platform;
mod preview;
mod profile;
mod rpc;
mod shell;
mod supervisor;
mod tools;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::Manager;
fn main() {
    let args: Vec<String> = std::env::args().collect();
    let override_dir = args
        .iter()
        .find_map(|s| s.strip_prefix("--data-dir="))
        .map(PathBuf::from);
    let isolated = override_dir.is_some();
    let background = args.iter().any(|s| s == "--background");
    let no_start = args.iter().any(|s| s == "--no-start");
    let qa_port = if isolated && cfg!(debug_assertions) {
        args.iter()
            .find_map(|s| s.strip_prefix("--qa-port="))
            .and_then(|s| s.parse().ok())
    } else {
        None
    };
    let directory = override_dir.unwrap_or_else(|| {
        if cfg!(debug_assertions) {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("user-data")
        } else {
            std::env::current_exe()
                .unwrap()
                .parent()
                .unwrap()
                .join("user-data")
        }
    });
    if !directory.is_absolute() {
        return;
    }
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|s| s == "--background") {
                shell::show(app);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            rpc::rpc,
            shell::close_control_window
        ])
        .setup(move |app| {
            let result = (|| {
                if !isolated && !cfg!(debug_assertions) {
                    profile::migrate_legacy_location(&directory)?;
                }
                profile::Profile::load(directory.clone())
            })();
            let loaded = match result {
                Ok(p) => p,
                Err(message) => {
                    rfd::MessageDialog::new()
                        .set_title("Yachiyo")
                        .set_description(&message)
                        .set_level(rfd::MessageLevel::Error)
                        .show();
                    return Err(std::io::Error::other(message).into());
                }
            };
            let auto_start = loaded.config.auto_start && !no_start;
            let ready = loaded.config.ready(&loaded.secrets).is_ok()
                && tools::status(&directory)["ready"] == true;
            if !isolated && !cfg!(debug_assertions) {
                platform::login_startup(loaded.config.launch_at_login, &std::env::current_exe()?)
                    .map_err(std::io::Error::other)?;
            }
            let profile = Arc::new(Mutex::new(loaded));
            let runtime = if cfg!(debug_assertions) {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .unwrap()
                    .join("stage")
            } else {
                platform::external_path(&app.path().resource_dir()?).join("runtime")
            };
            let supervisor =
                supervisor::Supervisor::new(app.handle().clone(), profile.clone(), runtime.clone());
            app.manage(shell::Desktop {
                profile: profile.clone(),
                supervisor: supervisor.clone(),
                runtime,
                preview: tokio::sync::Mutex::new(None),
                quitting: AtomicBool::new(false),
                isolated,
                operations: tokio::sync::Mutex::new(()),
                qa_port,
                tray_key: Mutex::new(String::new()),
            });
            shell::create_tray(app.handle())?;
            shell::update_tray(app.handle(), &profile, &supervisor.status.lock().unwrap());
            if !background || !ready {
                shell::show(app.handle());
            }
            if auto_start && ready {
                tauri::async_runtime::spawn(async move {
                    let _ = supervisor.action("start").await;
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    app.state::<shell::Desktop>().preview.lock().await.take();
                });
            }
        });
    let app = builder
        .build(tauri::generate_context!())
        .expect("Yachiyo application initialization failed");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
            if !app
                .state::<shell::Desktop>()
                .quitting
                .load(Ordering::SeqCst)
            {
                api.prevent_exit();
                if code.is_some() {
                    shell::quit(app);
                }
            }
        }
    });
}
