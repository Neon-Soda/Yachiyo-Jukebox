use crate::{
    model::{err, Result},
    profile::{atomic_json, limited_read},
    shell::Desktop,
};
use reqwest::{redirect::Policy, Client, StatusCode};
use semver::Version;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const CHECK_FAILED: &str = "暂时无法检查更新。";
const UNAVAILABLE: &str = "这个更新已不可用，请重新打开主界面检查。";

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}

pub(crate) struct Update {
    version: String,
    page: String,
}

fn stable_version(tag: &str) -> Option<Version> {
    let version = Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()?;
    (version.pre.is_empty() && version.build.is_empty()).then_some(version)
}

fn select_release(repository: &str, current: &str, release: &Release) -> Option<Update> {
    let version = stable_version(&release.tag_name)?;
    if release.draft || release.prerelease || version <= stable_version(current)? {
        return None;
    }
    Some(Update {
        version: version.to_string(),
        page: format!("{repository}/releases/tag/{}", release.tag_name),
    })
}

async fn discover(repository: &str) -> Result<Option<Update>> {
    let slug = repository
        .strip_prefix("https://github.com/")
        .ok_or(CHECK_FAILED)?;
    let client = Client::builder()
        .user_agent(concat!("Yachiyo-Jukebox/", env!("CARGO_PKG_VERSION")))
        .https_only(true)
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| CHECK_FAILED.to_owned())?;
    let mut response = client
        .get(format!(
            "https://api.github.com/repos/{slug}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| CHECK_FAILED.to_owned())?;
    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return err(CHECK_FAILED);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| CHECK_FAILED.to_owned())?
    {
        if body.len() + chunk.len() > 2 * 1024 * 1024 {
            return err(CHECK_FAILED);
        }
        body.extend_from_slice(&chunk);
    }
    let release: Release = serde_json::from_slice(&body).map_err(|_| CHECK_FAILED.to_owned())?;
    Ok(select_release(
        repository,
        env!("CARGO_PKG_VERSION"),
        &release,
    ))
}

pub(crate) async fn dispatch(
    app: &AppHandle,
    state: &Desktop,
    operation: &str,
    data: Value,
) -> Result<Value> {
    let mut pending = state.update.lock().await;
    let profile = state.profile.lock().unwrap().directory.clone();
    let ignored = profile.join("ignored-update.json");
    if operation == "checkForUpdate" {
        let repository = crate::rpc::project_link("source")?;
        *pending = None;
        if !state.isolated && !cfg!(debug_assertions) {
            *pending = discover(&repository).await?;
        }
        #[cfg(debug_assertions)]
        if state.isolated && state.qa_port.is_some() {
            if let Ok(bytes) = limited_read(&profile.join("qa-update.json"), 128) {
                if let Ok(tag_name) = serde_json::from_slice::<String>(&bytes) {
                    let release = Release {
                        tag_name,
                        draft: false,
                        prerelease: false,
                    };
                    *pending = select_release(&repository, env!("CARGO_PKG_VERSION"), &release);
                }
            }
        }
        if !data.as_bool().unwrap_or(false) {
            let skipped = limited_read(&ignored, 128)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<String>(&bytes).ok());
            if pending.as_ref().map(|update| &update.version) == skipped.as_ref() {
                *pending = None;
            }
        }
        return Ok(pending
            .as_ref()
            .map_or(Value::Null, |update| json!({ "version": update.version })));
    }
    let update = pending
        .as_ref()
        .filter(|update| data.as_str() == Some(update.version.as_str()))
        .ok_or(UNAVAILABLE)?;
    match operation {
        "skipUpdate" => {
            atomic_json(&ignored, &update.version)?;
            *pending = None;
        }
        "openUpdateRelease" => {
            app.opener()
                .open_url(&update.page, None::<&str>)
                .map_err(|_| "无法打开浏览器。".to_owned())?;
        }
        _ => return err("不允许此请求。"),
    }
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    const REPO: &str = "https://github.com/owner/repo";

    #[test]
    fn offers_a_stable_newer_release_with_only_an_exe() {
        let response = br#"{"tag_name":"v1.2.10","draft":false,"prerelease":false,
            "assets":[{"name":"Yachiyo-1.2.10-Windows-x64.exe"}]}"#;
        let release: Release = serde_json::from_slice(response).unwrap();
        let update = select_release(REPO, "1.2.9", &release).unwrap();
        assert_eq!(update.version, "1.2.10");
        assert_eq!(update.page, format!("{REPO}/releases/tag/v1.2.10"));
        assert!(select_release(REPO, "1.2.10", &release).is_none());
        assert!(select_release(REPO, "1.3.0", &release).is_none());
    }

    #[test]
    fn rejects_previews_drafts_and_invalid_tags() {
        for (tag, draft, prerelease) in [
            ("1.3.0", true, false),
            ("1.3.0", false, true),
            ("1.3.0-beta.1", false, false),
            ("../releases", false, false),
        ] {
            let release = Release {
                tag_name: tag.into(),
                draft,
                prerelease,
            };
            assert!(select_release(REPO, "1.2.0", &release).is_none());
        }
    }
}
