use crate::model::*;
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Router,
};
use serde_json::json;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

pub struct Preview {
    pub url: String,
    pub theme: Arc<Mutex<Theme>>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Preview {
    fn drop(&mut self) {
        self.task.abort();
    }
}
#[derive(Clone)]
struct PreviewState {
    directory: PathBuf,
    theme: Arc<Mutex<Theme>>,
}
impl Preview {
    pub async fn start(runtime: PathBuf, theme: Theme) -> Result<Self> {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|_| "预览服务无法启动。".to_owned())?;
        let url = format!(
            "http://127.0.0.1:{}",
            listener
                .local_addr()
                .map_err(|_| "预览服务无法启动。".to_owned())?
                .port()
        );
        let theme = Arc::new(Mutex::new(theme));
        let state = PreviewState {
            directory: runtime.join("activity/dist"),
            theme: theme.clone(),
        };
        let router = Router::new().fallback(serve).with_state(state);
        let task = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });
        Ok(Self { url, theme, task })
    }
}
async fn serve(State(state): State<PreviewState>, request: Request) -> axum::response::Response {
    let path = request.uri().path();
    if request.method() != axum::http::Method::GET {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    if path == "/api/config" {
        return axum::Json(json!({"preview":true,"theme":state.theme.lock().unwrap().clone()}))
            .into_response();
    }
    if path.starts_with("/api/") {
        return StatusCode::NOT_FOUND.into_response();
    }
    let name = if path == "/" {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };
    if name.contains("..")
        || name.contains('%')
        || name.contains('\\')
        || !matches(r"^[A-Za-z0-9_./-]+$", name)
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let extension = name.rsplit('.').next().unwrap_or("");
    let mime = match extension {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "woff2" => "font/woff2",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        _ => return StatusCode::NOT_FOUND.into_response(),
    };
    match tokio::fs::read(state.directory.join(name)).await{
        Ok(bytes)=>([(header::CONTENT_TYPE,mime),(header::CACHE_CONTROL,"no-store"),(header::X_CONTENT_TYPE_OPTIONS,"nosniff"),(header::CONTENT_SECURITY_POLICY,"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors http://tauri.localhost https://tauri.localhost tauri: http://127.0.0.1:*; object-src 'none'")],bytes).into_response(),
        Err(_)=>StatusCode::NOT_FOUND.into_response()
    }
}
