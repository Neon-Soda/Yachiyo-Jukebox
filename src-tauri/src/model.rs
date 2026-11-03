use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

pub type Result<T> = std::result::Result<T, String>;
pub const SECRET_KEYS: [&str; 7] = [
    "botToken",
    "clientSecret",
    "youtubeCookies",
    "bilibiliCookies",
    "neteaseCookies",
    "sshKey",
    "knownHosts",
];
pub type Secrets = BTreeMap<String, String>;
pub fn matches(pattern: &str, value: &str) -> bool {
    Regex::new(pattern)
        .expect("static regular expression")
        .is_match(value)
}
pub fn err<T>(message: &str) -> Result<T> {
    Err(message.to_owned())
}
pub fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub version: u32,
    pub guild_id: String,
    pub client_id: String,
    pub activity_enabled: bool,
    pub public_origin: String,
    pub port: u16,
    pub bind: String,
    pub connection_mode: String,
    pub ssh_host: String,
    pub ssh_user: String,
    pub ssh_port: u16,
    pub remote_port: u16,
    pub cache_mb: u32,
    pub idle_minutes: u32,
    pub auto_start: bool,
    pub launch_at_login: bool,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            guild_id: String::new(),
            client_id: String::new(),
            activity_enabled: true,
            public_origin: String::new(),
            port: 3178,
            bind: "127.0.0.1".into(),
            connection_mode: "direct".into(),
            ssh_host: String::new(),
            ssh_user: String::new(),
            ssh_port: 22,
            remote_port: 43178,
            cache_mb: 1024,
            idle_minutes: 5,
            auto_start: true,
            launch_at_login: false,
        }
    }
}
impl Config {
    pub fn parse(value: Value) -> Result<Self> {
        if !value.is_object() {
            return err("配置格式无效。");
        }
        let mut c: Self = serde_json::from_value(value).map_err(|_| "配置格式无效。".to_owned())?;
        for id in [&c.guild_id, &c.client_id] {
            if !id.is_empty() && !matches(r"^\d{17,20}$", id) {
                return err("Discord ID 应为 17～20 位数字。");
            }
        }
        if !["direct", "ssh", "external"].contains(&c.connection_mode.as_str()) {
            return err("连接方式无效。");
        }
        if !["127.0.0.1", "0.0.0.0"].contains(&c.bind.as_str()) {
            return err("监听地址无效。");
        }
        if c.port < 1024 {
            return err("本地端口须为 1024～65535 的整数。");
        }
        if c.remote_port < 1024 {
            return err("远端端口须为 1024～65535 的整数。");
        }
        if c.ssh_port == 0 {
            return err("SSH 端口须为 1～65535 的整数。");
        }
        if !(256..=10240).contains(&c.cache_mb) {
            return err("缓存容量须为 256～10240 的整数。");
        }
        if c.idle_minutes > 1440 {
            return err("指令闲置分钟数须为 0～1440 的整数。");
        }
        for (value, pattern) in [
            (&c.ssh_host, r"^[a-zA-Z0-9][a-zA-Z0-9.-]*$"),
            (&c.ssh_user, r"^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$"),
        ] {
            if value.len() > 253 || (!value.is_empty() && !matches(pattern, value)) {
                return err("SSH 主机或用户名格式无效。");
            }
        }
        if !c.public_origin.is_empty() {
            let url = reqwest::Url::parse(&c.public_origin).map_err(|_| {
                "公网地址须为 HTTPS 根地址，例如 https://music.example.com。".to_owned()
            })?;
            if url.scheme() != "https"
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
                || url.path() != "/"
                || url.host_str().is_none()
            {
                return err("公网地址须为 HTTPS 根地址，例如 https://music.example.com。");
            }
            c.public_origin = url.origin().ascii_serialization();
        }
        c.version = 1;
        Ok(c)
    }
    pub fn ready(&self, secrets: &Secrets) -> Result<()> {
        let has = |key: &str| secrets.get(key).is_some_and(|v| !v.is_empty());
        if self.guild_id.is_empty() || !has("botToken") {
            return err("请先填写服务器 ID 和 Bot Token。");
        }
        if self.activity_enabled && (self.client_id.is_empty() || !has("clientSecret")) {
            return err("使用点歌台还需要 Application ID 和 Client Secret。");
        }
        if self.activity_enabled
            && self.connection_mode == "ssh"
            && (self.ssh_host.is_empty()
                || self.ssh_user.is_empty()
                || !has("sshKey")
                || !has("knownHosts"))
        {
            return err("请补齐 SSH 主机、用户名、私钥和已验证的 known_hosts 文件。");
        }
        Ok(())
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Preferences {
    pub language: String,
    pub app_theme: String,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            language: "zh-CN".into(),
            app_theme: "forest".into(),
        }
    }
}
impl Preferences {
    pub fn update(&self, patch: Value) -> Result<Self> {
        let object = patch.as_object().ok_or("应用偏好格式无效。")?;
        if object
            .keys()
            .any(|k| !["language", "appTheme"].contains(&k.as_str()))
        {
            return err("应用偏好格式无效。");
        }
        let mut value = serde_json::to_value(self).unwrap();
        for (k, v) in object {
            value[k] = v.clone();
        }
        let result: Self =
            serde_json::from_value(value).map_err(|_| "应用偏好格式无效。".to_owned())?;
        if !["zh-CN", "en"].contains(&result.language.as_str()) {
            return err("请选择中文或英文。");
        }
        if !["forest", "midnight", "ocean", "daylight", "system"]
            .contains(&result.app_theme.as_str())
        {
            return err("请选择支持的应用主题。");
        }
        Ok(result)
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Theme {
    pub version: u32,
    pub name: String,
    pub colors: BTreeMap<String, String>,
    pub texts: BTreeMap<String, String>,
    pub images: BTreeMap<String, String>,
}
impl Default for Theme {
    fn default() -> Self {
        Self {
            version: 1,
            name: "月夜 · Yachiyo".into(),
            colors: BTreeMap::new(),
            texts: BTreeMap::new(),
            images: BTreeMap::new(),
        }
    }
}
fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}
fn placeholders(value: &str) -> BTreeSet<String> {
    Regex::new(r"\{[a-zA-Z][a-zA-Z0-9_]*\}")
        .unwrap()
        .find_iter(value)
        .map(|m| m.as_str().to_owned())
        .collect()
}
impl Theme {
    pub fn parse(value: Value, catalog: &Value) -> Result<Self> {
        if value.get("version").and_then(Value::as_u64) != Some(1) {
            return err("主题格式不受支持。");
        }
        let mut theme: Self =
            serde_json::from_value(value).map_err(|_| "主题格式不受支持。".to_owned())?;
        if theme.name.trim().is_empty() || utf16_len(&theme.name) > 80 {
            return err("主题名称须为 1～80 字。");
        }
        theme.name = theme.name.trim().to_owned();
        for (key, value) in &mut theme.colors {
            if !matches(r"^c[0-9a-f]{6}$", key)
                || !matches(r"^#[0-9a-fA-F]{6}$", value)
                || catalog["colors"].get(key).is_none()
            {
                return err("主题配色无效。");
            }
            *value = value.to_lowercase();
        }
        for (key, value) in &theme.texts {
            if !matches(r"^[a-z][a-z0-9_.-]{0,100}$", key)
                || utf16_len(value) > 1800
                || value
                    .chars()
                    .any(|c| (c as u32) < 32 && !['\t', '\n', '\r'].contains(&c))
            {
                return err("自定义文案格式无效。");
            }
            let item = catalog["texts"]
                .get(key)
                .ok_or("主题包含当前版本不支持的文案。")?;
            if placeholders(value) != placeholders(item["default"].as_str().unwrap_or("")) {
                return err("请保留文案中的全部变量，例如 {title}。");
            }
            if utf16_len(value) > item["max"].as_u64().unwrap_or(1800) as usize
                || (value.trim().is_empty() && item["required"].as_bool().unwrap_or(false))
            {
                return err("文案长度不符合要求。");
            }
        }
        for (key, value) in &theme.images {
            if !["logo", "defaultCover"].contains(&key.as_str())
                || value.len() > 2_800_000
                || !matches(
                    r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$",
                    value,
                )
            {
                return err("主题图片须为 2 MB 内的 PNG、JPEG 或 WebP。");
            }
        }
        if serde_json::to_vec(&theme).unwrap().len() > 6_000_000 {
            return err("主题文件过大。");
        }
        Ok(theme)
    }
}
pub fn public_settings(config: &Config, secrets: &Secrets) -> Value {
    json!({"config":config,"saved":SECRET_KEYS.iter().map(|k| (k.to_string(),secrets.get(*k).is_some_and(|v|!v.is_empty()))).collect::<BTreeMap<_,_>>()})
}
pub fn catalog() -> Value {
    serde_json::from_str(include_str!("../../bot/shared/catalog.json"))
        .expect("valid bundled catalog")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_network_and_ids_are_rejected() {
        let mut v = serde_json::to_value(Config::default()).unwrap();
        for origin in [
            "http://music.example.com",
            "https://user:pass@music.example.com",
            "https://music.example.com/path",
            "https://music.example.com/?key=secret",
        ] {
            v["publicOrigin"] = json!(origin);
            assert!(Config::parse(v.clone()).is_err());
        }
        v["publicOrigin"] = json!("https://music.example.com/");
        assert_eq!(
            Config::parse(v.clone()).unwrap().public_origin,
            "https://music.example.com"
        );
        v["sshUser"] = json!("-oProxyCommand=evil");
        assert!(Config::parse(v).is_err());
    }
    #[test]
    fn theme_rejects_executable_style_and_missing_placeholders() {
        let c = catalog();
        let mut v = serde_json::to_value(Theme::default()).unwrap();
        v["colors"]["c101018"] = json!("url(https://example.test)");
        assert!(Theme::parse(v, &c).is_err());
        let (key, _) = c["texts"]
            .as_object()
            .unwrap()
            .iter()
            .find(|(_, v)| v["default"].as_str().unwrap_or("").contains("{title}"))
            .unwrap();
        let mut v = serde_json::to_value(Theme::default()).unwrap();
        v["texts"][key] = json!("missing variable");
        assert!(Theme::parse(v, &c).is_err());
    }
    #[test]
    fn snapshots_never_return_credentials() {
        let mut s = Secrets::new();
        s.insert("botToken".into(), "EXAMPLE_ONLY_SECRET".into());
        let v = public_settings(&Config::default(), &s);
        assert_eq!(v["saved"]["botToken"], true);
        assert!(!v.to_string().contains("EXAMPLE_ONLY_SECRET"));
    }
}
