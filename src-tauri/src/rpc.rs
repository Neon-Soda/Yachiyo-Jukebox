use crate::{
    model::*,
    platform,
    preview::Preview,
    profile::{atomic_json, limited_read, read_json},
    shell::{self, Desktop},
    supervisor::child_environment,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    io::Cursor,
    path::{Path, PathBuf},
    process::Stdio,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::{
    io::AsyncWriteExt,
    process::Command,
    time::{timeout, Duration},
};

#[tauri::command]
pub async fn rpc(app: AppHandle, operation: String, data: Option<Value>) -> Value {
    let state = app.state::<Desktop>();
    let result = dispatch(&app, &state, &operation, data.unwrap_or(Value::Null)).await;
    match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(error) => {
            let language = state.profile.lock().unwrap().preferences.language.clone();
            json!({"ok":false,"error":shell::translate(&language,&error)})
        }
    }
}
async fn normalize_ssh(state: &Desktop, updates: &Value) -> Result<Value> {
    let ssh: serde_json::Map<String, Value> = updates
        .as_object()
        .ok_or("凭据格式无效。")?
        .iter()
        .filter(|(k, v)| {
            ["sshKey", "knownHosts"].contains(&k.as_str())
                && v.as_str().is_some_and(|s| !s.is_empty())
        })
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    if ssh.is_empty() {
        return Ok(updates.clone());
    }
    let normalized = helper(state, json!({"operation":"ssh","input":ssh})).await?;
    let mut updates = updates.clone();
    for (k, v) in normalized.as_object().ok_or("SSH 凭据格式无效。")? {
        updates[k] = v.clone();
    }
    Ok(updates)
}
async fn helper(state: &Desktop, input: Value) -> Result<Value> {
    let (directory, config) = {
        let p = state.profile.lock().unwrap();
        (p.directory.clone(), p.config.clone())
    };
    let mut child = Command::new(state.runtime.join("tools/node.exe"))
        .arg(state.runtime.join("src/desktop-validate.mjs"))
        .env_clear()
        .envs(child_environment(
            &config,
            &Secrets::new(),
            &state.runtime,
            &directory,
        ))
        .creation_flags(platform::NO_WINDOW)
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "运行组件不完整，请重新安装桌面应用。".to_owned())?;
    let mut stdin = child.stdin.take().ok_or("SSH 凭据格式无效。")?;
    let operation = async move {
        stdin
            .write_all(&serde_json::to_vec(&input).map_err(|_| "凭据格式无效。".to_owned())?)
            .await
            .map_err(|_| "SSH 凭据格式无效。".to_owned())?;
        drop(stdin);
        let output = child
            .wait_with_output()
            .await
            .map_err(|_| "SSH 凭据格式无效。".to_owned())?;
        let value: Value =
            serde_json::from_slice(&output.stdout).map_err(|_| "SSH 凭据格式无效。".to_owned())?;
        if value["ok"] != true {
            return err(value["error"].as_str().unwrap_or("SSH 凭据格式无效。"));
        }
        Ok(value["value"].clone())
    };
    timeout(Duration::from_secs(15), operation)
        .await
        .map_err(|_| "文件无法读取。".to_owned())?
}
async fn choose(
    _state: &Desktop,
    title: String,
    extensions: Vec<&'static str>,
    folder: bool,
    save: Option<&'static str>,
) -> Option<PathBuf> {
    // Deterministic native-dialog results for isolated development tests only.
    // This branch is absent from release executables; fixture paths cannot
    // escape the throwaway profile.
    #[cfg(debug_assertions)]
    if _state.isolated && _state.qa_port.is_some() {
        let directory = _state.profile.lock().unwrap().directory.clone();
        let fixture = directory.join("qa-dialog.json");
        if fixture.exists() {
            let selection = read_json(&fixture).ok();
            let _ = std::fs::remove_file(&fixture);
            return selection
                .and_then(|v| v["path"].as_str().map(PathBuf::from))
                .filter(|p| {
                    p.is_absolute()
                        && p.starts_with(&directory)
                        && !p
                            .components()
                            .any(|c| matches!(c, std::path::Component::ParentDir))
                });
        }
    }
    let save = save.map(String::from);
    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new().set_title(title);
        if !extensions.is_empty() {
            dialog = dialog.add_filter("Yachiyo", &extensions);
        }
        if folder {
            dialog.pick_folder()
        } else if let Some(name) = save {
            dialog.set_file_name(name).save_file()
        } else {
            dialog.pick_file()
        }
    })
    .await
    .ok()
    .flatten()
}
fn theme_id(value: &Value) -> Result<&str> {
    let id = value.as_str().ok_or("主题编号无效。")?;
    if uuid::Uuid::parse_str(id).is_err() || !matches(r"^[a-f0-9-]{36}$", id) {
        return err("主题编号无效。");
    }
    Ok(id)
}
async fn dispatch(app: &AppHandle, state: &Desktop, operation: &str, data: Value) -> Result<Value> {
    if matches!(operation, "start" | "stop" | "restart" | "check") {
        return state.supervisor.action(operation).await;
    }
    // Serialize filesystem updates, including native dialogs. Heartbeat and
    // tray control use a different actor and are never paused by a dialog.
    let _operation = state.operations.lock().await;
    let (language, directory) = {
        let p = state.profile.lock().unwrap();
        (p.preferences.language.clone(), p.directory.clone())
    };
    let t = |s: &str| shell::translate(&language, s);
    match operation {
        "snapshot" => {
            let p = state.profile.lock().unwrap();
            let mut value = public_settings(&p.config, &p.secrets);
            value["preferences"] = json!(p.preferences);
            value["status"] = state.supervisor.snapshot();
            value["theme"] = json!(p.theme);
            value["catalog"] = p.catalog.clone();
            value["draft"] = p.draft.clone().unwrap_or(Value::Null);
            value["version"] = json!(env!("CARGO_PKG_VERSION"));
            Ok(value)
        }
        "status" => Ok(state.supervisor.snapshot()),
        "quit" => {
            shell::quit(app);
            Ok(json!(true))
        }
        "setDraft" => {
            if serde_json::to_vec(&data)
                .map_err(|_| "数据格式无效。".to_owned())?
                .len()
                > 12_000_000
            {
                return err("数据格式无效。");
            }
            state.profile.lock().unwrap().draft = Some(data);
            Ok(json!(true))
        }
        "saveSettings" => {
            let config = Config::parse(data["config"].clone())?;
            let updates =
                normalize_ssh(state, &data.get("secrets").cloned().unwrap_or(json!({}))).await?;
            if !state.isolated && !cfg!(debug_assertions) {
                platform::login_startup(
                    config.launch_at_login,
                    &std::env::current_exe()
                        .map_err(|_| "无法更新 Windows 登录启动项。".to_owned())?,
                )?;
            }
            state.profile.lock().unwrap().save(Some(config), &updates)
        }
        "saveSshCredentials" => {
            if !data.is_object()
                || data
                    .as_object()
                    .unwrap()
                    .keys()
                    .any(|k| !["sshKey", "knownHosts"].contains(&k.as_str()))
            {
                return err("SSH 凭据格式无效。");
            }
            let updates = helper(state, json!({"operation":"ssh","input":data})).await?;
            state.profile.lock().unwrap().save(None, &updates)
        }
        "savePreferences" => {
            let preferences = state.profile.lock().unwrap().save_preferences(data)?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(shell::native_theme(&preferences.app_theme));
                let _ = window.set_title(&shell::translate(
                    &preferences.language,
                    "Yachiyo · 控制中心",
                ));
            }
            shell::update_tray(
                app,
                &state.profile,
                &state.supervisor.status.lock().unwrap(),
            );
            Ok(json!(preferences))
        }
        "removeSecret" => {
            let key = data.as_str().ok_or("凭据类型无效。")?;
            if !SECRET_KEYS.contains(&key) {
                return err("凭据类型无效。");
            }
            state.profile.lock().unwrap().save(None, &json!({key:""}))
        }
        "importSecret" => {
            let key = data.as_str().ok_or("请选择支持的凭据类型。")?;
            if !SECRET_KEYS.contains(&key) || ["botToken", "clientSecret"].contains(&key) {
                return err("请选择支持的凭据类型。");
            }
            let Some(path) = choose(state, t("支持的文件"), vec![], false, None).await else {
                return Ok(Value::Null);
            };
            let value = String::from_utf8(limited_read(&path, 2_000_000)?)
                .map_err(|_| "文件格式无效。".to_owned())?;
            if key.ends_with("Cookies") && !matches(r"(?im)^#.*(Netscape|HTTP Cookie)", &value) {
                return err("请选择 Netscape 格式的 Cookie 文件。");
            }
            let updates = normalize_ssh(state, &json!({key:value})).await?;
            state.profile.lock().unwrap().save(None, &updates)
        }
        "importProject" => {
            if state.supervisor.status.lock().unwrap().wanted {
                return err("请先停止 Bot 再导入旧项目。");
            }
            let Some(path) = choose(
                state,
                t("选择包含 .env 的旧版 Bot 项目文件夹"),
                vec![],
                true,
                None,
            )
            .await
            else {
                return Ok(Value::Null);
            };
            let result = helper(state, json!({"operation":"project","path":path})).await?;
            let config = Config::parse(result["config"].clone())?;
            let updates = normalize_ssh(state, &result["secrets"]).await?;
            state.profile.lock().unwrap().save(Some(config), &updates)
        }
        "cacheInfo" => Ok(state.profile.lock().unwrap().cache_info()),
        "clearCache" => {
            if state.supervisor.status.lock().unwrap().wanted {
                return err("请先停止 Bot，再清理缓存。");
            }
            let cache = directory.join("data/audio-cache");
            if let Ok(entries) = std::fs::read_dir(&cache) {
                for entry in entries.flatten() {
                    if matches(r"^[a-f0-9]{64}\.mp3$", &entry.file_name().to_string_lossy())
                        && entry.file_type().is_ok_and(|t| t.is_file())
                    {
                        std::fs::remove_file(entry.path())
                            .map_err(|_| "无法清理音频缓存。".to_owned())?;
                    }
                }
            }
            Ok(state.profile.lock().unwrap().cache_info())
        }
        "loadThemes" => {
            let catalog = state.profile.lock().unwrap().catalog.clone();
            let mut result = Vec::new();
            for entry in std::fs::read_dir(directory.join("themes"))
                .map_err(|_| "文件无法读取。".to_owned())?
                .flatten()
            {
                let name = entry.file_name().to_string_lossy().into_owned();
                if matches(r"^[a-f0-9-]{36}\.json$", &name) {
                    if let Ok(theme) =
                        read_json(&entry.path()).and_then(|v| Theme::parse(v, &catalog))
                    {
                        result.push(json!({"id":name.trim_end_matches(".json"),"theme":theme}));
                    }
                }
            }
            Ok(json!(result))
        }
        "saveTheme" => {
            let theme = Theme::parse(
                data["theme"].clone(),
                &state.profile.lock().unwrap().catalog,
            )?;
            let id = theme_id(&data["id"])
                .map(String::from)
                .unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
            atomic_json(&directory.join("themes").join(format!("{id}.json")), &theme)?;
            Ok(json!({"id":id,"theme":theme}))
        }
        "deleteTheme" => {
            let id = theme_id(&data)?;
            std::fs::remove_file(directory.join("themes").join(format!("{id}.json")))
                .map_err(|_| "文件无法读取。".to_owned())?;
            Ok(json!(true))
        }
        "importTheme" => {
            let Some(path) = choose(state, t("主题文件"), vec!["json"], false, None).await
            else {
                return Ok(Value::Null);
            };
            Ok(json!(Theme::parse(
                read_json(&path)?,
                &state.profile.lock().unwrap().catalog
            )?))
        }
        "exportTheme" => {
            let theme = Theme::parse(data, &state.profile.lock().unwrap().catalog)?;
            let Some(path) = choose(
                state,
                t("主题文件"),
                vec!["json"],
                false,
                Some("Yachiyo-theme.json"),
            )
            .await
            else {
                return Ok(json!(false));
            };
            atomic_json(&path, &theme)?;
            Ok(json!(true))
        }
        "applyTheme" => {
            let mut p = state.profile.lock().unwrap();
            let theme = Theme::parse(data, &p.catalog)?;
            atomic_json(&p.directory.join("customization.json"), &theme)?;
            p.theme = theme.clone();
            Ok(json!(theme))
        }
        "previewTheme" => {
            let theme = Theme::parse(data, &state.profile.lock().unwrap().catalog)?;
            let mut preview = state.preview.lock().await;
            if let Some(p) = preview.as_mut() {
                *p.theme.lock().unwrap() = theme;
            } else {
                *preview = Some(Preview::start(state.runtime.clone(), theme).await?);
            }
            Ok(json!(preview.as_ref().unwrap().url))
        }
        "pickImage" => {
            let Some(path) = choose(
                state,
                t("选择图片"),
                vec!["png", "jpg", "jpeg", "webp"],
                false,
                None,
            )
            .await
            else {
                return Ok(Value::Null);
            };
            Ok(json!(normalize_image(&path)?))
        }
        "openData" => {
            app.opener()
                .open_path(directory.to_string_lossy().into_owned(), None::<&str>)
                .map_err(|_| "文件无法读取。".to_owned())?;
            Ok(Value::Null)
        }
        "openPortal" => {
            app.opener()
                .open_url("https://discord.com/developers/applications", None::<&str>)
                .map_err(|_| "无法打开浏览器。".to_owned())?;
            Ok(Value::Null)
        }
        "openInvite" => {
            let config = state.profile.lock().unwrap().config.clone();
            if config.client_id.is_empty() {
                return err("请先保存 Application ID。");
            }
            let mut url = reqwest::Url::parse("https://discord.com/oauth2/authorize").unwrap();
            url.query_pairs_mut()
                .append_pair("client_id", &config.client_id)
                .append_pair("permissions", "3148800")
                .append_pair("scope", "bot applications.commands");
            if !config.guild_id.is_empty() {
                url.query_pairs_mut()
                    .append_pair("guild_id", &config.guild_id);
            }
            app.opener()
                .open_url(url.as_str(), None::<&str>)
                .map_err(|_| "无法打开浏览器。".to_owned())?;
            Ok(Value::Null)
        }
        "exportDiagnostics" => {
            let Some(path) = choose(
                state,
                t("脱敏诊断"),
                vec!["json"],
                false,
                Some("Yachiyo-diagnostics.json"),
            )
            .await
            else {
                return Ok(json!(false));
            };
            let p = state.profile.lock().unwrap();
            let report = json!({"version":env!("CARGO_PKG_VERSION"),"at":now(),"platform":"win32","runtime":"Tauri + Rust / Node Bot","status":state.supervisor.snapshot(),"configuration":{"activityEnabled":p.config.activity_enabled,"connectionMode":p.config.connection_mode,"port":p.config.port,"bind":p.config.bind},"credentialsConfigured":public_settings(&p.config,&p.secrets)["saved"],"cache":p.cache_info()});
            atomic_json(&path, &report)?;
            Ok(json!(true))
        }
        _ => err("不允许此请求。"),
    }
}
pub fn normalize_image(path: &Path) -> Result<String> {
    let bytes = limited_read(path, 2_000_000)?;
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "图片无法读取，请选择 PNG、JPEG 或 WebP。".to_owned())?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(6000);
    limits.max_image_height = Some(6000);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "图片无法读取，请选择 PNG、JPEG 或 WebP。".to_owned())?;
    let image = if image.width() > 1024 || image.height() > 1024 {
        image.thumbnail(1024, 1024)
    } else {
        image
    };
    let mut png = Cursor::new(Vec::new());
    image
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|_| "图片无法读取，请选择 PNG、JPEG 或 WebP。".to_owned())?;
    if png.get_ref().len() > 2_000_000 {
        return err("图片转换后超过 2 MB，请缩小图片。");
    }
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(png.into_inner())
    ))
}
