use crate::{
    model::*,
    platform,
    profile::{atomic_json, read_json},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, UNIX_EPOCH},
};
use tokio::{io::AsyncReadExt, process::Command, time::timeout};

pub const IDS: [&str; 3] = ["ffmpeg", "ffprobe", "yt-dlp"];
static OPERATIONS: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
const MISSING: &str = "请先在工具库中配置并检查 FFmpeg、FFprobe 和 yt-dlp。";
const CHANGED: &str = "工具文件已改变，请在工具库重新检查。";

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Record {
    path: String,
    version: String,
    sha256: String,
    bytes: u64,
    modified: u64,
    checked_at: u64,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Store {
    tools: BTreeMap<String, Record>,
    audio_fingerprint: String,
}
fn load(directory: &Path) -> Store {
    read_json(&directory.join("media-tools.json"))
        .ok()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}
fn metadata(path: &Path) -> Result<(u64, u64)> {
    let m = fs::metadata(path).map_err(|_| "工具文件不存在，请重新选择。".to_owned())?;
    if !m.is_file() {
        return err("请选择已解压的工具 EXE 文件。");
    }
    Ok((
        m.len(),
        m.modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|t| t.as_nanos().min(u64::MAX as u128) as u64)
            .unwrap_or(0),
    ))
}
fn unchanged(record: &Record) -> bool {
    !record.sha256.is_empty()
        && Path::new(&record.path).is_absolute()
        && metadata(Path::new(&record.path)).is_ok_and(|m| m == (record.bytes, record.modified))
}
fn fingerprint(store: &Store) -> String {
    match (store.tools.get("ffmpeg"), store.tools.get("ffprobe")) {
        (Some(a), Some(b)) => format!("{}:{}", a.sha256, b.sha256),
        _ => String::new(),
    }
}
pub fn status(directory: &Path) -> Value {
    let store = load(directory);
    let mut ready = true;
    let items: Vec<Value> = IDS
        .iter()
        .map(|id| {
            let record = store.tools.get(*id);
            let valid = record.is_some_and(unchanged);
            ready &= valid;
            json!({"id":id,"path":record.map(|r|r.path.as_str()).unwrap_or(""),
            "version":record.map(|r|r.version.as_str()).unwrap_or(""),
            "sha256":record.map(|r|r.sha256.as_str()).unwrap_or(""),
            "checkedAt":record.map(|r|r.checked_at),
            "state":if valid{"ready"}else if record.is_some(){"changed"}else{"missing"}})
        })
        .collect();
    ready &= !store.audio_fingerprint.is_empty() && store.audio_fingerprint == fingerprint(&store);
    json!({"ready":ready,"items":items})
}
pub fn download_url(id: &str) -> Result<&'static str> {
    match id {
        "ffmpeg" | "ffprobe" => Ok("https://www.gyan.dev/ffmpeg/builds/#release-builds"),
        "yt-dlp" => Ok("https://github.com/yt-dlp/yt-dlp/releases/latest"),
        _ => err("工具类型无效。"),
    }
}
fn identity(path: &Path) -> Result<(String, u64, u64)> {
    let (size, modified) = metadata(path)?;
    if !(1024..=1_000_000_000).contains(&size) {
        return err("工具文件大小无效。");
    }
    let mut file = fs::File::open(path).map_err(|_| "工具文件无法读取。".to_owned())?;
    let mut header = [0u8; 64];
    file.read_exact(&mut header)
        .map_err(|_| "请选择 Windows x64 工具。".to_owned())?;
    let offset = u32::from_le_bytes(header[60..64].try_into().unwrap()) as u64;
    if &header[..2] != b"MZ" || offset > size.saturating_sub(6) || offset > 1_000_000 {
        return err("请选择 Windows x64 工具。");
    }
    file.seek(SeekFrom::Start(offset))
        .map_err(|_| "工具文件无法读取。".to_owned())?;
    let mut pe = [0u8; 6];
    file.read_exact(&mut pe)
        .map_err(|_| "请选择 Windows x64 工具。".to_owned())?;
    if &pe[..4] != b"PE\0\0" || u16::from_le_bytes([pe[4], pe[5]]) != 0x8664 {
        return err("请选择 Windows x64 工具。");
    }
    file.rewind().map_err(|_| "工具文件无法读取。".to_owned())?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|_| "工具文件无法读取。".to_owned())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    Ok((format!("{:x}", hash.finalize()), size, modified))
}
fn version(id: &str, text: &str) -> Result<String> {
    if id == "yt-dlp" {
        let re = regex::Regex::new(r"(?m)^(20\d{2})\.(\d{2})\.(\d{2})(?:\.[\w.-]+)?\s*$").unwrap();
        let c = re
            .captures(text)
            .ok_or("所选文件不是支持的 yt-dlp 正式版本。")?;
        if c[1].parse::<u32>().unwrap_or(0) < 2025 {
            return err("yt-dlp 版本过旧，请下载最新正式版本。");
        }
        return Ok(format!("{}.{}.{}", &c[1], &c[2], &c[3]));
    }
    let re = regex::Regex::new(&format!(
        r"(?m)^{} version n?(\d+)\.(\d+)(?:\.(\d+))?(?:[\s-]|$)",
        regex::escape(id)
    ))
    .unwrap();
    let c = re
        .captures(text)
        .ok_or("请选择 FFmpeg 6.0 或更新的正式版本，FFprobe 须来自同一构建。");
    let c = c?;
    if c[1].parse::<u32>().unwrap_or(0) < 6 {
        return err("请选择 FFmpeg 6.0 或更新的正式版本，FFprobe 须来自同一构建。");
    }
    Ok(format!(
        "{}.{}.{}",
        &c[1],
        &c[2],
        c.get(3).map(|m| m.as_str()).unwrap_or("0")
    ))
}
async fn bounded<R: tokio::io::AsyncRead + Unpin>(stream: R) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    stream
        .take(1_048_577)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| "工具检查失败。".to_owned())?;
    if bytes.len() > 1_048_576 {
        return err("工具输出异常，请重新选择可信来源的文件。");
    }
    Ok(bytes)
}
async fn capture(path: &Path, args: &[&str], directory: &Path) -> Result<Vec<u8>> {
    let mut cmd = Command::new(path);
    cmd.args(args)
        .current_dir(directory)
        .env_clear()
        .creation_flags(platform::NO_WINDOW)
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for name in ["SystemRoot", "WINDIR", "TEMP", "TMP"] {
        if let Some(value) = std::env::var_os(name) {
            cmd.env(name, value);
        }
    }
    let windows = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\Windows"));
    cmd.env("PATH", windows.join("System32"));
    let mut child = cmd
        .spawn()
        .map_err(|_| "工具无法运行，请确认已完整解压且依赖 DLL 齐全。".to_owned())?;
    let _job = platform::ProcessJob::attach(child.id().ok_or("工具无法运行。")?)?;
    let stdout = child.stdout.take().ok_or("工具检查失败。")?;
    let stderr = child.stderr.take().ok_or("工具检查失败。")?;
    let operation = async {
        let (out, error, exit) = tokio::try_join!(bounded(stdout), bounded(stderr), async {
            child.wait().await.map_err(|_| "工具检查失败。".to_owned())
        })?;
        if !exit.success() {
            return err("工具检查失败，请确认版本和依赖完整。");
        }
        Ok(if out.is_empty() { error } else { out })
    };
    let result = timeout(Duration::from_secs(15), operation)
        .await
        .map_err(|_| "工具检查超时，请重新选择工具。".to_owned())
        .and_then(|v| v);
    if result.is_err() {
        let _ = child.kill().await;
    }
    result
}
async fn inspect(id: &str, path: &Path, directory: &Path) -> Result<Record> {
    if !IDS.contains(&id) {
        return err("工具类型无效。");
    }
    if !path.is_absolute()
        || !path.file_name().is_some_and(|n| {
            n.to_string_lossy()
                .eq_ignore_ascii_case(&format!("{id}.exe"))
        })
    {
        return err("请选择对应名称的 EXE 文件：ffmpeg.exe、ffprobe.exe 或 yt-dlp.exe。");
    }
    let path = platform::external_path(
        &path
            .canonicalize()
            .map_err(|_| "工具文件不存在，请重新选择。".to_owned())?,
    );
    let to_hash = path.clone();
    let (sha256, bytes, modified) = tokio::task::spawn_blocking(move || identity(&to_hash))
        .await
        .map_err(|_| "工具文件无法读取。".to_owned())??;
    let args: &[&str] = if id == "yt-dlp" {
        &["--ignore-config", "--version"]
    } else {
        &["-version"]
    };
    let output = capture(&path, args, directory).await?;
    let version = version(id, &String::from_utf8_lossy(&output))?;
    if id == "yt-dlp" {
        let help = capture(&path, &["--ignore-config", "--help"], directory).await?;
        if !String::from_utf8_lossy(&help).contains("--js-runtimes") {
            return err("yt-dlp 缺少 JavaScript 运行支持，请下载最新正式版本。");
        }
    }
    let result = Record {
        path: path.to_string_lossy().into_owned(),
        version,
        sha256,
        bytes,
        modified,
        checked_at: now(),
    };
    if !unchanged(&result) {
        return err(CHANGED);
    }
    Ok(result)
}
struct Scratch(PathBuf);
impl Scratch {
    fn new(directory: &Path) -> Result<Self> {
        let path = directory
            .join("tool-checks")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&path).map_err(|_| "无法写入本机数据。".to_owned())?;
        Ok(Self(path))
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn wav() -> Vec<u8> {
    // A short silent PCM fixture exercises local conversion without network access.
    let samples = 4000u32;
    let data = samples * 2;
    let mut bytes = Vec::new();
    bytes.extend(b"RIFF");
    bytes.extend((36 + data).to_le_bytes());
    bytes.extend(b"WAVEfmt ");
    bytes.extend(16u32.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(1u16.to_le_bytes());
    bytes.extend(16000u32.to_le_bytes());
    bytes.extend(32000u32.to_le_bytes());
    bytes.extend(2u16.to_le_bytes());
    bytes.extend(16u16.to_le_bytes());
    bytes.extend(b"data");
    bytes.extend(data.to_le_bytes());
    bytes.resize(44 + data as usize, 0);
    bytes
}
async fn audio_test(store: &mut Store, directory: &Path) -> Result<()> {
    let (Some(ffmpeg), Some(ffprobe)) = (store.tools.get("ffmpeg"), store.tools.get("ffprobe"))
    else {
        store.audio_fingerprint.clear();
        return Ok(());
    };
    if ffmpeg.version != ffprobe.version {
        return err("FFmpeg 与 FFprobe 版本不同，请选择同一个下载包中的两个文件。");
    }
    if !unchanged(ffmpeg) || !unchanged(ffprobe) {
        return err(CHANGED);
    }
    let scratch = Scratch::new(directory)?;
    let source = scratch.0.join("input.wav");
    let encoded = scratch.0.join("output.mp3");
    fs::write(&source, wav()).map_err(|_| "无法写入本机数据。".to_owned())?;
    let input = source.to_string_lossy();
    let output = encoded.to_string_lossy();
    let exe = Path::new(&ffmpeg.path);
    let probe = Path::new(&ffprobe.path);
    let decoders = capture(exe, &["-hide_banner", "-decoders"], &scratch.0).await?;
    let decoders = String::from_utf8_lossy(&decoders);
    for codec in ["aac", "opus", "mp3(?:float)?"] {
        if !matches(&format!(r"(?m)^\s*A[.A-Z]{{5}}\s+{}\s", codec), &decoders) {
            return err("此 FFmpeg 构建缺少 AAC、Opus 或 MP3 音频解码器。");
        }
    }
    capture(
        exe,
        &[
            "-nostdin",
            "-hide_banner",
            "-v",
            "error",
            "-i",
            &input,
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-y",
            &output,
        ],
        &scratch.0,
    )
    .await
    .map_err(|_| "MP3 转码检查未通过，请选择包含 libmp3lame 的 FFmpeg 构建。".to_owned())?;
    let probe_output = capture(
        probe,
        &[
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            &output,
        ],
        &scratch.0,
    )
    .await?;
    let info: Value = serde_json::from_slice(&probe_output)
        .map_err(|_| "FFprobe 时长读取检查未通过。".to_owned())?;
    let duration = info["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    if !(0.1..2.0).contains(&duration) {
        return err("FFprobe 时长读取检查未通过。");
    }
    let pcm = capture(
        exe,
        &[
            "-nostdin", "-v", "error", "-ss", "0.1", "-i", &output, "-vn", "-ac", "2", "-ar",
            "48000", "-f", "s16le", "pipe:1",
        ],
        &scratch.0,
    )
    .await?;
    if pcm.len() < 10000 {
        return err("FFmpeg 解码或进度定位检查未通过。");
    }
    store.audio_fingerprint = fingerprint(store);
    Ok(())
}
pub async fn configure(directory: &Path, id: &str, path: &Path) -> Result<Value> {
    let _operation = OPERATIONS.lock().await;
    let mut store = load(directory);
    let record = inspect(id, path, directory).await?;
    let sibling = match id {
        "ffmpeg" => Some("ffprobe"),
        "ffprobe" => Some("ffmpeg"),
        _ => None,
    };
    if let Some(sibling) = sibling {
        let candidate = Path::new(&record.path)
            .parent()
            .unwrap()
            .join(format!("{sibling}.exe"));
        if candidate.is_file() {
            store.tools.insert(
                sibling.into(),
                inspect(sibling, &candidate, directory).await?,
            );
        }
    }
    store.tools.insert(id.into(), record);
    audio_test(&mut store, directory).await?;
    atomic_json(&directory.join("media-tools.json"), &store)?;
    Ok(status(directory))
}
pub async fn check_all(directory: &Path) -> Result<BTreeMap<String, String>> {
    let _operation = OPERATIONS.lock().await;
    let mut store = load(directory);
    for id in IDS {
        let record = store.tools.get(id).ok_or(MISSING)?;
        let checked = inspect(id, Path::new(&record.path), directory).await?;
        store.tools.insert(id.into(), checked);
    }
    audio_test(&mut store, directory).await?;
    let paths = store
        .tools
        .iter()
        .map(|(id, r)| (id.clone(), r.path.clone()))
        .collect();
    atomic_json(&directory.join("media-tools.json"), &store)?;
    Ok(paths)
}
pub async fn remove(directory: &Path, id: &str) -> Result<Value> {
    if !IDS.contains(&id) {
        return err("工具类型无效。");
    }
    let _operation = OPERATIONS.lock().await;
    let mut store = load(directory);
    store.tools.remove(id);
    if id != "yt-dlp" {
        store.audio_fingerprint.clear();
    }
    atomic_json(&directory.join("media-tools.json"), &store)?;
    Ok(status(directory))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions_reject_wrong_identity_old_and_unversioned_builds() {
        assert_eq!(
            version(
                "ffmpeg",
                "ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright\n"
            )
            .unwrap(),
            "9.0.2"
        );
        assert_eq!(
            version("ffprobe", "ffprobe version n6.1 Copyright").unwrap(),
            "6.1.0"
        );
        assert!(version("ffmpeg", "ffprobe version 9.0.2 Copyright").is_err());
        assert!(version("ffmpeg", "ffmpeg version 5.1 Copyright").is_err());
        assert!(version("ffmpeg", "ffmpeg version N-1234-gabcdef Copyright").is_err());
        assert_eq!(version("yt-dlp", "2026.08.19\r\n").unwrap(), "2026.08.19");
        assert!(version("yt-dlp", "2024.12.31").is_err());
        assert!(version("yt-dlp", "arbitrary program 2026.08.19").is_err());
    }
    #[test]
    fn missing_or_changed_files_cannot_report_ready() {
        let scratch = Scratch::new(&std::env::temp_dir()).unwrap();
        assert_eq!(status(&scratch.0)["ready"], false);
        let file = scratch.0.join("not-an-executable.exe");
        fs::write(&file, b"text").unwrap();
        assert!(identity(&file).is_err());
        let record = Record {
            path: file.to_string_lossy().into_owned(),
            bytes: 100,
            sha256: "test".into(),
            ..Default::default()
        };
        assert!(!unchanged(&record));
        assert!(download_url("https://example.test").is_err());
    }
    #[tokio::test]
    #[ignore = "requires YACHIYO_TOOL_TEST_DIR pointing to separately downloaded tools"]
    async fn real_tools_pair_automatically_and_failed_selection_keeps_configuration() {
        let binaries = PathBuf::from(
            std::env::var_os("YACHIYO_TOOL_TEST_DIR").expect("set YACHIYO_TOOL_TEST_DIR"),
        );
        let profile = Scratch::new(&std::env::temp_dir()).unwrap();
        let partial = configure(&profile.0, "ffmpeg", &binaries.join("ffmpeg.exe"))
            .await
            .unwrap();
        assert_eq!(partial["ready"], false);
        assert_eq!(partial["items"][1]["state"], "ready");
        assert!(check_all(&profile.0).await.is_err());
        let complete = configure(&profile.0, "yt-dlp", &binaries.join("yt-dlp.exe"))
            .await
            .unwrap();
        assert_eq!(complete["ready"], true);
        let saved = fs::read(profile.0.join("media-tools.json")).unwrap();
        let wrong = profile.0.join("ffmpeg.exe");
        fs::write(&wrong, b"not a Windows executable").unwrap();
        assert!(configure(&profile.0, "ffmpeg", &wrong).await.is_err());
        assert_eq!(saved, fs::read(profile.0.join("media-tools.json")).unwrap());
        let paths = check_all(&profile.0).await.unwrap();
        assert_eq!(paths.len(), 3);
        let mut mismatch = load(&profile.0);
        mismatch.tools.get_mut("ffprobe").unwrap().version = "6.0.0".into();
        assert!(audio_test(&mut mismatch, &profile.0).await.is_err());
        let cleared = remove(&profile.0, "ffprobe").await.unwrap();
        assert_eq!(cleared["ready"], false);
        assert!(binaries.join("ffprobe.exe").is_file());
    }
}
