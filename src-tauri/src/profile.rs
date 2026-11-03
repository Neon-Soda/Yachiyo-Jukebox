use crate::{model::*, platform};
use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

const MAGIC: &[u8] = b"YACHIYO_DPAPI_V1\n";
pub fn migrate_legacy_location(directory: &Path) -> Result<()> {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return Ok(());
    };
    let source = PathBuf::from(appdata).join("Yachiyo");
    let marker = directory.join(".profile-migration-pending");
    if source == directory || !source.join("settings.json").is_file() {
        return Ok(());
    }
    if !marker.exists()
        && (directory.join("settings.json").exists()
            || directory.join("credentials.bin").exists()
            || directory.join("credentials.dpapi").exists())
    {
        return Ok(());
    }
    Config::parse(read_json(&source.join("settings.json"))?)?;
    fs::create_dir_all(directory).map_err(|_| "无法写入本机数据。".to_owned())?;
    platform::secure_directory(directory)?;
    atomic_bytes(&marker, b"legacy-profile-v1\n")?;
    fn copy(source: &Path, target: &Path) -> Result<()> {
        let Ok(info) = fs::symlink_metadata(source) else {
            return Ok(());
        };
        if info.file_type().is_symlink() {
            return Ok(());
        }
        if info.is_dir() {
            fs::create_dir_all(target).map_err(|_| "无法写入本机数据。".to_owned())?;
            for entry in fs::read_dir(source)
                .map_err(|_| "文件无法读取。".to_owned())?
                .flatten()
            {
                copy(&entry.path(), &target.join(entry.file_name()))?;
            }
        } else if info.is_file() {
            fs::create_dir_all(target.parent().ok_or("运行目录校验失败。")?)
                .map_err(|_| "无法写入本机数据。".to_owned())?;
            fs::copy(source, target).map_err(|_| "无法写入本机数据。".to_owned())?;
        }
        Ok(())
    }
    for relative in [
        "chromium/Local State",
        "Local State",
        "credentials.bin",
        "preferences.json",
        "customization.json",
        "themes",
        "data/audio-cache",
        "settings.json",
    ] {
        copy(&source.join(relative), &directory.join(relative))?;
    }
    fs::remove_file(marker).map_err(|_| "无法写入本机数据。".to_owned())?;
    Ok(())
}
pub fn limited_read(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let size = fs::metadata(path)
        .map_err(|_| "文件无法读取。".to_owned())?
        .len();
    if size > limit {
        return err("文件超过允许的大小。");
    }
    fs::read(path).map_err(|_| "文件无法读取。".to_owned())
}
pub fn read_json(path: &Path) -> Result<Value> {
    serde_json::from_slice(&limited_read(path, 6_000_000)?).map_err(|_| "文件格式无效。".to_owned())
}
pub fn atomic_bytes(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("运行目录校验失败。")?;
    fs::create_dir_all(parent).map_err(|_| "无法写入本机数据。".to_owned())?;
    let temporary = parent.join(format!(".{}.next", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|_| "无法写入本机数据。".to_owned())?;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|_| "无法写入本机数据。".to_owned())?;
        drop(file);
        platform::replace_file(&temporary, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
pub fn atomic_json(path: &Path, value: &impl serde::Serialize) -> Result<()> {
    atomic_bytes(
        path,
        &serde_json::to_vec_pretty(value).map_err(|_| "数据格式无效。".to_owned())?,
    )
}

pub struct Profile {
    pub directory: PathBuf,
    pub config: Config,
    pub secrets: Secrets,
    pub preferences: Preferences,
    pub theme: Theme,
    pub catalog: Value,
    pub draft: Option<Value>,
    #[allow(dead_code)]
    pub migrated: bool,
}
impl Profile {
    pub fn load(directory: PathBuf) -> Result<Self> {
        fs::create_dir_all(&directory)
            .map_err(|_| "无法写入安装目录，请将应用安装到当前用户可写入的文件夹。".to_owned())?;
        platform::secure_directory(&directory)?;
        fs::create_dir_all(directory.join("themes"))
            .map_err(|_| "无法写入本机数据。".to_owned())?;
        let config = if directory.join("settings.json").exists() {
            Config::parse(read_json(&directory.join("settings.json"))?).map_err(|_| {
                "设置文件无法读取。请从数据文件夹恢复 settings.json 的备份。".to_owned()
            })?
        } else {
            Config::default()
        };
        let preferences = read_json(&directory.join("preferences.json"))
            .ok()
            .and_then(|v| Preferences::default().update(v).ok())
            .unwrap_or_default();
        let catalog = catalog();
        let theme = read_json(&directory.join("customization.json"))
            .ok()
            .and_then(|v| Theme::parse(v, &catalog).ok())
            .unwrap_or_default();
        let current = directory.join("credentials.dpapi");
        let legacy = directory.join("credentials.bin");
        let (secrets, migrated) = if current.exists() {
            let bytes = limited_read(&current, 20_000_000)?;
            if !bytes.starts_with(MAGIC) {
                return err("本机凭据无法解密。更换电脑后请重新填写凭据。");
            }
            (
                decode_secrets(&platform::unprotect(&bytes[MAGIC.len()..])?)?,
                false,
            )
        } else if legacy.exists() {
            (
                decode_secrets(&decrypt_electron(
                    &directory,
                    &limited_read(&legacy, 20_000_000)?,
                )?)?,
                true,
            )
        } else {
            (Secrets::new(), false)
        };
        let result = Self {
            directory,
            config,
            secrets,
            preferences,
            theme,
            catalog,
            draft: None,
            migrated,
        };
        if migrated {
            result.write_secrets(&result.secrets)?;
        }
        Ok(result)
    }
    fn write_secrets(&self, secrets: &Secrets) -> Result<()> {
        let plain = serde_json::to_vec(secrets).map_err(|_| "凭据格式无效。".to_owned())?;
        let mut bytes = MAGIC.to_vec();
        bytes.extend(platform::protect(&plain)?);
        atomic_bytes(&self.directory.join("credentials.dpapi"), &bytes)
    }
    pub fn save(&mut self, config: Option<Config>, updates: &Value) -> Result<Value> {
        let updates = updates.as_object().ok_or("凭据格式无效。")?;
        let mut next = self.secrets.clone();
        for (key, value) in updates {
            let value = value.as_str().ok_or("凭据格式无效。")?;
            if !SECRET_KEYS.contains(&key.as_str()) || value.len() > 2_000_000 {
                return err("凭据格式无效。");
            }
            if ["botToken", "clientSecret"].contains(&key.as_str())
                && (value.len() > 512 || value.chars().any(|c| c.is_whitespace() || c == '\0'))
            {
                return err("凭据不能包含空格或换行。");
            }
            if value.is_empty() {
                next.remove(key);
            } else {
                next.insert(key.clone(), value.to_owned());
            }
        }
        // Credential changes are durable before they can affect a running process.
        if !updates.is_empty() {
            self.write_secrets(&next)?;
        }
        if let Some(c) = config {
            atomic_json(&self.directory.join("settings.json"), &c)?;
            self.config = c;
        }
        self.secrets = next;
        if let Some(draft) = self.draft.as_mut() {
            if let Some(inputs) = draft.get_mut("secrets").and_then(Value::as_object_mut) {
                for key in updates.keys() {
                    inputs.insert(key.clone(), json!(""));
                }
            }
        }
        Ok(public_settings(&self.config, &self.secrets))
    }
    pub fn save_preferences(&mut self, patch: Value) -> Result<Preferences> {
        let value = self.preferences.update(patch)?;
        atomic_json(&self.directory.join("preferences.json"), &value)?;
        self.preferences = value.clone();
        Ok(value)
    }
    pub fn cache_info(&self) -> Value {
        let mut count = 0;
        let mut bytes = 0u64;
        if let Ok(entries) = fs::read_dir(self.directory.join("data/audio-cache")) {
            for entry in entries.flatten() {
                if matches(r"^[a-f0-9]{64}\.mp3$", &entry.file_name().to_string_lossy()) {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_file() {
                            count += 1;
                            bytes += meta.len();
                        }
                    }
                }
            }
        }
        json!({"count":count,"bytes":bytes,"limitMb":self.config.cache_mb})
    }
}
fn decode_secrets(bytes: &[u8]) -> Result<Secrets> {
    let value: Secrets = serde_json::from_slice(bytes)
        .map_err(|_| "本机凭据无法解密。更换电脑后请重新填写凭据。".to_owned())?;
    Ok(value
        .into_iter()
        .filter(|(key, _)| SECRET_KEYS.contains(&key.as_str()))
        .collect())
}
fn decrypt_electron(directory: &Path, bytes: &[u8]) -> Result<Vec<u8>> {
    const ERROR: &str = "本机凭据无法解密。更换电脑后请重新填写凭据。";
    if bytes.starts_with(b"v20") {
        return err(ERROR);
    }
    if !bytes.starts_with(b"v10") && !bytes.starts_with(b"v11") {
        return platform::unprotect(bytes);
    }
    if bytes.len() < 31 {
        return err(ERROR);
    }
    let file = [
        directory.join("chromium/Local State"),
        directory.join("Local State"),
    ]
    .into_iter()
    .find(|p| p.is_file())
    .ok_or(ERROR)?;
    let state = read_json(&file).map_err(|_| ERROR.to_owned())?;
    let encoded = state["os_crypt"]["encrypted_key"].as_str().ok_or(ERROR)?;
    let wrapped = STANDARD.decode(encoded).map_err(|_| ERROR.to_owned())?;
    if !wrapped.starts_with(b"DPAPI") {
        return err(ERROR);
    }
    let key = platform::unprotect(&wrapped[5..])?;
    Aes256Gcm::new_from_slice(&key)
        .map_err(|_| ERROR.to_owned())?
        .decrypt(Nonce::from_slice(&bytes[3..15]), &bytes[15..])
        .map_err(|_| ERROR.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dpapi_roundtrip_and_tamper_detection() {
        let source = b"EXAMPLE_ONLY_NOT_A_REAL_CREDENTIAL";
        let mut bytes = platform::protect(source).unwrap();
        assert!(!bytes.windows(source.len()).any(|w| w == source));
        assert_eq!(platform::unprotect(&bytes).unwrap(), source);
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        assert!(platform::unprotect(&bytes).is_err());
    }
    #[test]
    fn legacy_credentials_migrate_without_touching_legacy_bytes() {
        let root = std::env::temp_dir().join(format!("yachiyo-migrate-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("chromium")).unwrap();
        let key = [47u8; 32];
        let mut wrapped = b"DPAPI".to_vec();
        wrapped.extend(platform::protect(&key).unwrap());
        atomic_json(
            &root.join("chromium/Local State"),
            &json!({"os_crypt":{"encrypted_key":STANDARD.encode(wrapped)}}),
        )
        .unwrap();
        let nonce = [12u8; 12];
        let mut legacy = b"v10".to_vec();
        legacy.extend(nonce);
        legacy.extend(
            Aes256Gcm::new_from_slice(&key)
                .unwrap()
                .encrypt(
                    Nonce::from_slice(&nonce),
                    b"{\"botToken\":\"EXAMPLE_ONLY_TEST\"}".as_slice(),
                )
                .unwrap(),
        );
        fs::write(root.join("credentials.bin"), &legacy).unwrap();
        let p = Profile::load(root.clone()).unwrap();
        assert!(p.migrated);
        assert_eq!(p.secrets["botToken"], "EXAMPLE_ONLY_TEST");
        assert_eq!(fs::read(root.join("credentials.bin")).unwrap(), legacy);
        drop(p);
        let p = Profile::load(root.clone()).unwrap();
        assert!(!p.migrated);
        assert_eq!(p.secrets["botToken"], "EXAMPLE_ONLY_TEST");
        drop(p);
        assert!(root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("yachiyo-migrate-"));
        fs::remove_dir_all(root).unwrap();
    }
}
