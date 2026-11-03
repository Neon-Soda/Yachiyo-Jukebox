use crate::{
    model::*,
    platform::{self, ProcessJob},
    profile::{atomic_json, Profile},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{
        windows::named_pipe::{NamedPipeServer, ServerOptions},
        TcpStream,
    },
    process::{Child, Command},
    sync::{mpsc, oneshot},
    time::{timeout, Instant},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub bot: String,
    pub local: String,
    pub tunnel: String,
    pub public: String,
    pub reason: String,
    pub public_reason: String,
    pub rooms: u64,
    pub ping: Option<f64>,
    pub pid: Option<u32>,
    pub tunnel_pid: Option<u32>,
    pub wanted: bool,
    pub events: Vec<Value>,
    pub updated_at: u64,
}
impl Default for Status {
    fn default() -> Self {
        Self {
            bot: "stopped".into(),
            local: "stopped".into(),
            tunnel: "off".into(),
            public: "unchecked".into(),
            reason: "尚未启动".into(),
            public_reason: String::new(),
            rooms: 0,
            ping: None,
            pid: None,
            tunnel_pid: None,
            wanted: false,
            events: Vec::new(),
            updated_at: now(),
        }
    }
}
struct Request {
    operation: String,
    result: oneshot::Sender<Result<Value>>,
}
enum Feedback {
    Status(u32, Value),
    Event(String),
}
struct OwnedChild {
    child: Child,
    _job: ProcessJob,
    control: Option<mpsc::Sender<()>>,
    reader: Option<tokio::task::JoinHandle<()>>,
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        if let Some(task) = self.reader.take() {
            task.abort();
        }
    }
}
#[derive(Clone)]
pub struct Supervisor {
    tx: mpsc::Sender<Request>,
    pub status: Arc<Mutex<Status>>,
}
impl Supervisor {
    pub fn new(app: AppHandle, profile: Arc<Mutex<Profile>>, runtime: PathBuf) -> Self {
        let (tx, rx) = mpsc::channel(32);
        let status = Arc::new(Mutex::new(Status::default()));
        let (feedback, feedback_rx) = mpsc::channel(64);
        let actor = Actor {
            app,
            profile,
            runtime,
            status: status.clone(),
            commands: rx,
            feedback,
            feedback_rx,
            bot: None,
            tunnel: None,
            active: None,
            wanted: false,
            attempts: 0,
            retry: Instant::now(),
            tunnel_retry: Instant::now(),
            started: Instant::now(),
            heartbeat: Instant::now(),
            checked: Instant::now() - Duration::from_secs(60),
            tunnel_started: Instant::now(),
        };
        tauri::async_runtime::spawn(actor.run());
        Self { tx, status }
    }
    pub async fn action(&self, operation: &str) -> Result<Value> {
        let (tx, rx) = oneshot::channel();
        self.tx
            .send(Request {
                operation: operation.into(),
                result: tx,
            })
            .await
            .map_err(|_| "后台管理未就绪。".to_owned())?;
        rx.await.map_err(|_| "后台管理未就绪。".to_owned())?
    }
    pub fn snapshot(&self) -> Value {
        serde_json::to_value(self.status.lock().unwrap().clone()).unwrap()
    }
}
struct Actor {
    app: AppHandle,
    profile: Arc<Mutex<Profile>>,
    runtime: PathBuf,
    status: Arc<Mutex<Status>>,
    commands: mpsc::Receiver<Request>,
    feedback: mpsc::Sender<Feedback>,
    feedback_rx: mpsc::Receiver<Feedback>,
    bot: Option<OwnedChild>,
    tunnel: Option<OwnedChild>,
    active: Option<(Config, Secrets)>,
    wanted: bool,
    attempts: u32,
    retry: Instant,
    tunnel_retry: Instant,
    started: Instant,
    heartbeat: Instant,
    checked: Instant,
    tunnel_started: Instant,
}
impl Actor {
    fn directory(&self) -> PathBuf {
        self.profile.lock().unwrap().directory.clone()
    }
    fn event(&self, message: &str) {
        let mut s = self.status.lock().unwrap();
        s.events.insert(0, json!({"at":now(),"message":message}));
        s.events.truncate(20);
    }
    fn publish(&self) {
        let snapshot = {
            let mut s = self.status.lock().unwrap();
            s.wanted = self.wanted;
            s.pid = self.bot.as_ref().and_then(|p| p.child.id());
            s.tunnel_pid = self.tunnel.as_ref().and_then(|p| p.child.id());
            s.updated_at = now();
            s.clone()
        };
        let _ = atomic_json(&self.directory().join("desktop-status.json"), &snapshot);
        let _ = self.app.emit("service-status", &snapshot);
        crate::shell::update_tray(&self.app, &self.profile, &snapshot);
    }
    async fn run(mut self) {
        let mut interval = tokio::time::interval(Duration::from_secs(2));
        self.publish();
        loop {
            tokio::select! {
                Some(request)=self.commands.recv()=>{
                    let result=match request.operation.as_str(){
                        "start"=>self.start().await,
                        "stop"=>self.stop().await,
                        "restart"=>{let stopped=self.stop().await;if stopped.is_ok(){self.start().await}else{stopped}},
                        "check"=>{self.check().await;Ok(())},
                        "shutdown"=>{let result=self.stop().await;self.publish();let _=request.result.send(result.map(|_|json!(true)));break},
                        _=>err("不允许此请求。"),
                    };
                    if let Err(ref e)=result{self.event(e);}self.publish();let _=request.result.send(result.map(|_|serde_json::to_value(self.status.lock().unwrap().clone()).unwrap()));
                }
                Some(message)=self.feedback_rx.recv()=>{
                    match message{
                        Feedback::Status(pid,v) if self.bot.as_ref().and_then(|b|b.child.id())==Some(pid)=>{
                            self.heartbeat=Instant::now();let ready=v["ready"].as_bool().unwrap_or(false);if ready{self.attempts=0;}
                            let config=self.active.as_ref().map(|a|a.0.clone()).unwrap_or_default();
                            let mut s=self.status.lock().unwrap();s.bot=if ready{"online"}else{"connecting"}.into();s.local=if !config.activity_enabled{"disabled"}else if v["localReady"].as_bool().unwrap_or(false){"online"}else{"starting"}.into();s.reason=if ready{"已连接 Discord"}else{"正在连接 Discord"}.into();s.rooms=v["rooms"].as_u64().unwrap_or(0).min(10000);s.ping=v["ping"].as_f64().filter(|n|n.is_finite()&&*n>=0.0&&*n<600000.0);
                        }
                        Feedback::Event(e)=>self.event(&e),_=>{}
                    }self.publish();
                }
                _=interval.tick()=>{self.tick().await;}
                else=>{let _=self.stop().await;break;}
            }
        }
    }
    async fn start(&mut self) -> Result<()> {
        if self.bot.is_some() {
            return Ok(());
        }
        let (config, secrets) = {
            let p = self.profile.lock().unwrap();
            (p.config.clone(), p.secrets.clone())
        };
        config.ready(&secrets)?;
        if config.activity_enabled
            && timeout(
                Duration::from_secs(1),
                TcpStream::connect(("127.0.0.1", config.port)),
            )
            .await
            .is_ok_and(|r| r.is_ok())
        {
            return err("本地端口已被占用，可能旧版 Bot 仍在运行。请先停止旧实例，避免重复登录。");
        }
        let private = self.directory().join("private-runtime");
        std::fs::create_dir_all(&private).map_err(|_| "无法写入本机数据。".to_owned())?;
        platform::secure_directory(&private)?;
        for platform in ["youtube", "bilibili", "netease"] {
            if let Some(value) = secrets.get(&format!("{platform}Cookies")) {
                std::fs::write(private.join(format!("{platform}.txt")), value)
                    .map_err(|_| "无法写入本机数据。".to_owned())?;
            }
        }
        let pipe_name = format!(r"\\.\pipe\yachiyo-control-{}", uuid::Uuid::new_v4());
        let server = ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&pipe_name)
            .map_err(|_| "无法安全启动后台进程。".to_owned())?;
        let nonce = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let mut env = child_environment(&config, &secrets, &self.runtime, &self.directory());
        env.insert("YACHIYO_CONTROL_PIPE".into(), pipe_name);
        env.insert("YACHIYO_CONTROL_NONCE".into(), nonce.clone());
        let mut child = Command::new(self.runtime.join("tools/node.exe"))
            .arg(self.runtime.join(if config.activity_enabled {
                "src/activity-bot.mjs"
            } else {
                "src/bot.mjs"
            }))
            .current_dir(self.directory())
            .env_clear()
            .envs(env)
            .creation_flags(platform::NO_WINDOW)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| "Bot 运行环境启动失败，请重新安装应用。".to_owned())?;
        let pid = child.id().ok_or("无法安全启动后台进程。")?;
        let job = ProcessJob::attach(pid)?;
        if let Some(stream) = child.stdout.take() {
            tauri::async_runtime::spawn(classify_output(stream, self.feedback.clone()));
        }
        if let Some(stream) = child.stderr.take() {
            tauri::async_runtime::spawn(classify_output(stream, self.feedback.clone()));
        }
        let (control, commands) = mpsc::channel(2);
        let reader = tokio::spawn(control_pipe(
            server,
            nonce,
            pid,
            commands,
            self.feedback.clone(),
        ));
        self.bot = Some(OwnedChild {
            child,
            _job: job,
            control: Some(control),
            reader: Some(reader),
        });
        self.active = Some((config.clone(), secrets));
        self.wanted = true;
        self.started = Instant::now();
        self.heartbeat = Instant::now();
        self.checked = Instant::now() - Duration::from_secs(60);
        {
            let mut s = self.status.lock().unwrap();
            s.bot = "connecting".into();
            s.local = if config.activity_enabled {
                "starting"
            } else {
                "disabled"
            }
            .into();
            s.reason = "正在登录 Discord".into();
            s.rooms = 0;
        }
        if config.activity_enabled && config.connection_mode == "ssh" {
            if let Err(e) = self.start_tunnel() {
                self.event(&e);
                self.tunnel_retry = Instant::now() + Duration::from_secs(15);
            }
        } else {
            self.status.lock().unwrap().tunnel = if config.connection_mode == "external" {
                "external"
            } else {
                "off"
            }
            .into();
        }
        self.event("启动 Bot。");
        Ok(())
    }
    fn start_tunnel(&mut self) -> Result<()> {
        if self.tunnel.is_some() || !self.wanted {
            return Ok(());
        }
        let (config, secrets) = self.active.as_ref().ok_or("后台管理未就绪。")?;
        let private = self.directory().join("private-runtime");
        for (key, file) in [("sshKey", "ssh_key"), ("knownHosts", "known_hosts")] {
            std::fs::write(
                private.join(file),
                secrets.get(key).map(String::as_str).unwrap_or(""),
            )
            .map_err(|_| "无法写入本机数据。".to_owned())?;
        }
        let windows = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
        let ssh = PathBuf::from(windows).join("System32/OpenSSH/ssh.exe");
        let args = vec![
            "-F".into(),
            "NUL".into(),
            "-N".into(),
            "-T".into(),
            "-o".into(),
            "BatchMode=yes".into(),
            "-o".into(),
            "PasswordAuthentication=no".into(),
            "-o".into(),
            "KbdInteractiveAuthentication=no".into(),
            "-o".into(),
            "IdentitiesOnly=yes".into(),
            "-o".into(),
            "IdentityAgent=none".into(),
            "-o".into(),
            "StrictHostKeyChecking=yes".into(),
            "-o".into(),
            format!(
                "UserKnownHostsFile={}",
                private.join("known_hosts").display()
            ),
            "-o".into(),
            "ExitOnForwardFailure=yes".into(),
            "-o".into(),
            "ConnectTimeout=15".into(),
            "-o".into(),
            "ServerAliveInterval=30".into(),
            "-o".into(),
            "ServerAliveCountMax=3".into(),
            "-o".into(),
            "LogLevel=ERROR".into(),
            "-i".into(),
            private.join("ssh_key").to_string_lossy().into_owned(),
            "-p".into(),
            config.ssh_port.to_string(),
            "-R".into(),
            format!("127.0.0.1:{}:127.0.0.1:{}", config.remote_port, config.port),
            format!("{}@{}", config.ssh_user, config.ssh_host),
        ];
        let child = Command::new(ssh)
            .args(args)
            .env_clear()
            .envs(child_environment(
                config,
                &Secrets::new(),
                &self.runtime,
                &self.directory(),
            ))
            .creation_flags(platform::NO_WINDOW)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "SSH 未能启动，请检查 Windows OpenSSH 客户端。".to_owned())?;
        let job = ProcessJob::attach(child.id().ok_or("无法安全启动后台进程。")?)?;
        self.tunnel = Some(OwnedChild {
            child,
            _job: job,
            control: None,
            reader: None,
        });
        self.tunnel_started = Instant::now();
        self.status.lock().unwrap().tunnel = "connecting".into();
        Ok(())
    }
    async fn stop(&mut self) -> Result<()> {
        self.wanted = false;
        if let Some(mut bot) = self.bot.take() {
            if let Some(tx) = &bot.control {
                let _ = tx.send(()).await;
            }
            if timeout(Duration::from_secs(8), bot.child.wait())
                .await
                .is_err()
            {
                let _ = bot.child.kill().await;
            }
            drop(bot);
        }
        if let Some(mut tunnel) = self.tunnel.take() {
            let _ = tunnel.child.kill().await;
            drop(tunnel);
        }
        self.active = None;
        let private = self.directory().join("private-runtime");
        if private.is_dir() && private.parent() == Some(self.directory().as_path()) {
            std::fs::remove_dir_all(private).map_err(|_| "无法清理临时运行文件。".to_owned())?;
        }
        {
            let mut s = self.status.lock().unwrap();
            s.bot = "stopped".into();
            s.local = "stopped".into();
            s.tunnel = "off".into();
            s.public = "offline".into();
            s.rooms = 0;
            s.reason = "已停止".into();
        }
        self.event("停止 Bot 和应用管理的隧道。");
        Ok(())
    }
    async fn tick(&mut self) {
        let exited = self
            .bot
            .as_mut()
            .and_then(|b| b.child.try_wait().ok().flatten());
        if let Some(code) = exited {
            self.bot = None;
            self.attempts += 1;
            self.retry = Instant::now()
                + Duration::from_secs(
                    (5u64 * 2u64.pow(self.attempts.saturating_sub(1).min(4))).min(60),
                );
            {
                let mut s = self.status.lock().unwrap();
                s.bot = if self.wanted { "retrying" } else { "stopped" }.into();
                s.local = "stopped".into();
                s.rooms = 0;
                s.reason = format!(
                    "Bot 已退出（{}），即将自动重试",
                    code.code().map(|n| n.to_string()).unwrap_or("终止".into())
                );
            }
            self.event("Bot 意外退出，自动重连已排队。");
            self.publish();
        }
        if self
            .tunnel
            .as_mut()
            .is_some_and(|p| p.child.try_wait().ok().flatten().is_some())
        {
            self.tunnel = None;
            self.tunnel_retry = Instant::now() + Duration::from_secs(15);
            self.status.lock().unwrap().tunnel =
                if self.wanted { "retrying" } else { "off" }.into();
            self.event("SSH 连接中断，将在 15 秒后重试。");
            self.publish();
        }
        if !self.wanted {
            return;
        }
        if self.bot.is_none() && Instant::now() >= self.retry {
            if let Err(e) = self.start().await {
                self.event(&e);
                self.retry = Instant::now() + Duration::from_secs(15);
                self.publish();
            }
        }
        if self.bot.is_some() && self.heartbeat.elapsed() > Duration::from_secs(20) {
            let mut s = self.status.lock().unwrap();
            s.bot = "connecting".into();
            s.reason = "暂未收到 Bot 心跳".into();
        }
        if self.bot.is_some()
            && self.started.elapsed() > Duration::from_secs(120)
            && self.status.lock().unwrap().bot != "online"
        {
            if let Some(bot) = self.bot.as_mut() {
                let _ = bot.child.kill().await;
            }
            self.started = Instant::now();
        }
        let ssh = self
            .active
            .as_ref()
            .is_some_and(|(c, _)| c.activity_enabled && c.connection_mode == "ssh");
        if self.bot.is_some() && ssh && self.tunnel.is_none() && Instant::now() >= self.tunnel_retry
        {
            if let Err(e) = self.start_tunnel() {
                self.event(&e);
                self.tunnel_retry = Instant::now() + Duration::from_secs(15);
            }
        }
        if self.checked.elapsed() > Duration::from_secs(30) {
            self.check().await;
            self.publish();
        }
    }
    async fn check(&mut self) {
        let config = self
            .active
            .as_ref()
            .map(|a| a.0.clone())
            .unwrap_or_else(|| self.profile.lock().unwrap().config.clone());
        self.checked = Instant::now();
        if !config.activity_enabled {
            let mut s = self.status.lock().unwrap();
            s.local = "disabled".into();
            s.public = "disabled".into();
            return;
        }
        let local_origin = format!("http://127.0.0.1:{}", config.port);
        let (local, remote) = tokio::join!(
            endpoint(&local_origin, &config.client_id),
            endpoint(&config.public_origin, &config.client_id)
        );
        let mut s = self.status.lock().unwrap();
        s.local = if local.0 { "online" } else { "offline" }.into();
        s.public = if remote.0 { "online" } else { "offline" }.into();
        s.public_reason = remote.1;
        if self.tunnel.is_some() {
            s.tunnel = if remote.0 {
                "online"
            } else if self.tunnel_started.elapsed() < Duration::from_secs(15) {
                "connecting"
            } else {
                "unverified"
            }
            .into();
        }
    }
}
async fn endpoint(origin: &str, client_id: &str) -> (bool, String) {
    if origin.is_empty() {
        return (false, "请在连接设置填写 HTTPS 公网地址".into());
    }
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(c) => c,
        Err(_) => return (false, "连接超时、证书或代理配置异常".into()),
    };
    let result = client.get(format!("{origin}/api/config")).send().await;
    if let Ok(mut response) = result {
        let status = response.status();
        if !status.is_success()
            || !response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .contains("application/json")
        {
            return (false, format!("HTTP {} / 非点歌台响应", status.as_u16()));
        }
        if response.content_length().is_some_and(|n| n > 8_000_000) {
            return (false, "响应属于其他应用或预览服务".into());
        }
        let mut body = Vec::new();
        loop {
            match response.chunk().await {
                Ok(Some(bytes)) => {
                    if body.len() + bytes.len() > 8_000_000 {
                        return (false, "响应属于其他应用或预览服务".into());
                    }
                    body.extend_from_slice(&bytes);
                }
                Ok(None) => break,
                Err(_) => return (false, "连接超时、证书或代理配置异常".into()),
            }
        }
        if let Ok(data) = serde_json::from_slice::<Value>(&body) {
            let ok = data["clientId"] == client_id && data["preview"] == false;
            return (
                ok,
                if ok {
                    "已验证应用 ID"
                } else {
                    "响应属于其他应用或预览服务"
                }
                .into(),
            );
        }
    }
    (false, "连接超时、证书或代理配置异常".into())
}
pub fn child_environment(
    config: &Config,
    secrets: &Secrets,
    runtime: &Path,
    data: &Path,
) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    for key in [
        "SystemRoot",
        "WINDIR",
        "COMSPEC",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "PATHEXT",
        "SystemDrive",
        "NUMBER_OF_PROCESSORS",
        "ProgramData",
        "ALLUSERSPROFILE",
        "USERNAME",
        "USERDOMAIN",
        "HOMEDRIVE",
        "HOMEPATH",
        "COMPUTERNAME",
        "OS",
        "PROCESSOR_ARCHITECTURE",
    ] {
        if let Ok(value) = std::env::var(key) {
            env.insert(key.into(), value);
        }
    }
    let windows = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("C:\\Windows"));
    env.insert(
        "PATH".into(),
        format!(
            "{};{};{}",
            runtime.join("tools").display(),
            windows.join("System32").display(),
            windows.join("System32/OpenSSH").display()
        ),
    );
    for (key, value) in [
        (
            "DISCORD_TOKEN",
            secrets.get("botToken").cloned().unwrap_or_default(),
        ),
        ("GUILD_ID", config.guild_id.clone()),
        ("DISCORD_CLIENT_ID", config.client_id.clone()),
        (
            "DISCORD_CLIENT_SECRET",
            secrets.get("clientSecret").cloned().unwrap_or_default(),
        ),
        (
            "ACTIVITY_ENABLED",
            if config.activity_enabled { "1" } else { "0" }.into(),
        ),
        ("ACTIVITY_PORT", config.port.to_string()),
        ("ACTIVITY_HOST", config.bind.clone()),
        ("ACTIVITY_PUBLIC_ORIGIN", config.public_origin.clone()),
        ("AUDIO_CACHE_MB", config.cache_mb.to_string()),
        ("IDLE_TIMEOUT_MINUTES", config.idle_minutes.to_string()),
        (
            "YACHIYO_CUSTOMIZATION_PATH",
            data.join("customization.json")
                .to_string_lossy()
                .into_owned(),
        ),
    ] {
        env.insert(key.into(), value);
    }
    for platform in ["youtube", "bilibili", "netease"] {
        if secrets.contains_key(&format!("{platform}Cookies")) {
            env.insert(
                format!("{}_COOKIES", platform.to_uppercase()),
                data.join("private-runtime")
                    .join(format!("{platform}.txt"))
                    .to_string_lossy()
                    .into_owned(),
            );
        }
    }
    env
}
async fn classify_output<R: AsyncRead + Unpin>(mut reader: R, tx: mpsc::Sender<Feedback>) {
    let mut buffer = [0u8; 4096];
    while let Ok(n) = reader.read(&mut buffer).await {
        if n == 0 {
            break;
        }
        let text = String::from_utf8_lossy(&buffer[..n]);
        for (pattern, message) in [
            ("MODULE_NOT_FOUND", "运行组件不完整，请重新安装桌面应用。"),
            ("cache-download", "音频下载失败，请检查来源平台或登录状态。"),
            (
                "TokenInvalid",
                "Discord 登录失败，请检查 Bot Token 和网络。",
            ),
            ("loginFailed", "Discord 登录失败，请检查 Bot Token 和网络。"),
            ("EADDRINUSE", "端口已被其他程序占用。"),
        ] {
            if text.contains(pattern) {
                let _ = tx.try_send(Feedback::Event(message.into()));
                break;
            }
        }
    }
}
async fn control_pipe(
    server: NamedPipeServer,
    nonce: String,
    pid: u32,
    mut commands: mpsc::Receiver<()>,
    tx: mpsc::Sender<Feedback>,
) {
    use std::os::windows::io::AsRawHandle;
    if !matches!(
        timeout(Duration::from_secs(20), server.connect()).await,
        Ok(Ok(()))
    ) {
        return;
    }
    let mut actual = 0;
    let verified = unsafe {
        windows_sys::Win32::System::Pipes::GetNamedPipeClientProcessId(
            server.as_raw_handle(),
            &mut actual,
        )
    };
    if verified == 0 || actual != pid {
        return;
    }
    let (mut read, mut write) = tokio::io::split(server);
    let mut hello = Vec::new();
    let mut one = [0u8; 1];
    let handshake = async {
        loop {
            if hello.len() > 4096 {
                return false;
            }
            if read.read(&mut one).await.ok() != Some(1) {
                return false;
            }
            if one[0] == b'\n' {
                break;
            }
            hello.push(one[0]);
        }
        serde_json::from_slice::<Value>(&hello)
            .ok()
            .is_some_and(|v| v["type"] == "hello" && v["nonce"] == nonce)
    };
    if !timeout(Duration::from_secs(8), handshake)
        .await
        .unwrap_or(false)
    {
        return;
    }
    if write.write_all(b"{\"type\":\"ready\"}\n").await.is_err() {
        return;
    }
    let mut reader = BufReader::new(read);
    let mut line = String::new();
    loop {
        line.clear();
        tokio::select! {
            Some(_)=commands.recv()=>{let _=write.write_all(b"{\"type\":\"shutdown\"}\n").await;}
            result=reader.read_line(&mut line)=>{if result.unwrap_or(0)==0||line.len()>8192{break;}if let Ok(value)=serde_json::from_str::<Value>(&line){if value["type"]=="status"{let _=tx.send(Feedback::Status(pid,value)).await;}}}
        }
    }
}
