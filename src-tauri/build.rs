fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["rpc", "close_control_window"]),
        ),
    )
    .expect("Unable to prepare desktop application");
}
