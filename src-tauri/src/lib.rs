use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

// ── Types ──

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Capabilities {
    tools: bool,
    thinking: bool,
}

impl Default for Capabilities {
    fn default() -> Self {
        Self {
            tools: true,
            thinking: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppConfig {
    #[serde(default = "default_base_url")]
    base_url: String,
    #[serde(default)]
    api_key: String,
    #[serde(default = "default_host")]
    host: String,
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default)]
    capabilities: Capabilities,
    #[serde(default)]
    auto_start_server: bool,
    #[serde(default = "default_true")]
    minimize_to_tray: bool,
}

fn default_base_url() -> String {
    "https://api.deepseek.com".into()
}
fn default_host() -> String {
    "localhost".into()
}
fn default_port() -> u16 {
    11434
}
fn default_true() -> bool {
    true
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            api_key: String::new(),
            host: default_host(),
            port: default_port(),
            capabilities: Capabilities::default(),
            auto_start_server: false,
            minimize_to_tray: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ServerStatus {
    running: bool,
    started_at: Option<u64>,
    host: String,
    port: u16,
    request_count: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct TestResult {
    success: bool,
    models: Vec<ModelInfo>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModelInfo {
    name: String,
    model: String,
}

struct AppState {
    config: Mutex<AppConfig>,
    server_process: Mutex<Option<Child>>,
    started_at: Mutex<Option<u64>>,
    request_count: Mutex<u64>,
}

// ── Config file ──

fn config_path() -> PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    let dir = PathBuf::from(appdata).join("vs2lma");
    fs::create_dir_all(&dir).ok();
    dir.join("config.json")
}

fn load_config_disk() -> AppConfig {
    let path = config_path();
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config_disk(config: &AppConfig) {
    let path = config_path();
    if let Ok(json) = serde_json::to_string_pretty(config) {
        fs::write(&path, json).ok();
    }
}

// ── Core server logic (shared between IPC and tray) ──

async fn do_start_server(app: &AppHandle) -> Result<ServerStatus, String> {
    let config = {
        let state = app.state::<AppState>();
        let c = state.config.lock().unwrap().clone();
        c
    };

    if config.api_key.is_empty() {
        return Err("API Key is not configured. Please set it in the Configuration tab.".into());
    }

    // Kill any existing process
    {
        let state = app.state::<AppState>();
        let mut proc = state.server_process.lock().unwrap();
        if let Some(ref mut child) = *proc {
            child.kill().ok();
            child.wait().ok();
        }
        *proc = None;
    }

    let caps: Vec<String> = {
        let mut v = Vec::new();
        if config.capabilities.tools {
            v.push("tools".into());
        }
        if config.capabilities.thinking {
            v.push("thinking".into());
        }
        v
    };

    // Resolve dist/index.js relative to project root (parent of src-tauri/)
    let project_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();
    let dist_path = project_root.join("dist").join("index.js");

    let mut args: Vec<String> = vec![
        dist_path.to_string_lossy().to_string(),
        "--url".into(),
        config.base_url.clone(),
        "--apikey".into(),
        config.api_key.clone(),
        "--host".into(),
        config.host.clone(),
        "--port".into(),
        config.port.to_string(),
    ];
    if !caps.is_empty() {
        args.push("--cap".into());
        args.extend(caps);
    }

    let child = Command::new("node")
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Node.js server: {}. Is Node.js installed and in PATH?", e))?;

    {
        let state = app.state::<AppState>();
        *state.server_process.lock().unwrap() = Some(child);
    }

    // Health check — wait for server to become ready
    let check_url = format!("http://{}:{}/api/version", config.host, config.port);
    let started = std::time::Instant::now();
    loop {
        if started.elapsed().as_secs() > 10 {
            let state = app.state::<AppState>();
            let mut proc = state.server_process.lock().unwrap();
            // Capture stderr for debugging
            let stderr_msg = if let Some(ref mut child) = *proc {
                use std::io::Read;
                let mut buf = String::new();
                if let Some(ref mut stderr) = child.stderr {
                    stderr.read_to_string(&mut buf).ok();
                }
                let mut outbuf = String::new();
                if let Some(ref mut stdout) = child.stdout {
                    stdout.read_to_string(&mut outbuf).ok();
                }
                child.kill().ok();
                child.wait().ok();
                format!("\nServer stdout: {}\nServer stderr: {}", outbuf, buf)
            } else {
                String::new()
            };
            *proc = None;
            return Err(format!(
                "Server did not become ready within 10 seconds.{}",
                stderr_msg
            ));
        }
        match reqwest::get(&check_url).await {
            Ok(resp) if resp.status().is_success() => break,
            _ => tokio::time::sleep(std::time::Duration::from_millis(300)).await,
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    {
        let state = app.state::<AppState>();
        *state.started_at.lock().unwrap() = Some(now);
        *state.request_count.lock().unwrap() = 0;
    }

    let status = ServerStatus {
        running: true,
        started_at: Some(now),
        host: config.host.clone(),
        port: config.port,
        request_count: 0,
    };

    app.emit("server-status-changed", &status).ok();
    update_tray_menu(app, &status);

    Ok(status)
}

async fn do_stop_server(app: &AppHandle) -> Result<(), String> {
    {
        let state = app.state::<AppState>();
        let mut proc = state.server_process.lock().unwrap();
        if let Some(ref mut child) = *proc {
            child.kill().map_err(|e| format!("Failed to stop server: {}", e))?;
            child.wait().ok();
        }
        *proc = None;
        *state.started_at.lock().unwrap() = None;
        *state.request_count.lock().unwrap() = 0;
    }

    let config = {
        let state = app.state::<AppState>();
        let c = state.config.lock().unwrap().clone();
        c
    };

    let status = ServerStatus {
        running: false,
        started_at: None,
        host: config.host,
        port: config.port,
        request_count: 0,
    };

    app.emit("server-status-changed", &status).ok();
    update_tray_menu(app, &status);

    Ok(())
}

// ── IPC Commands ──

#[tauri::command]
async fn fetch_logs(app: AppHandle) -> Result<serde_json::Value, String> {
    let config = {
        let state = app.state::<AppState>();
        let c = state.config.lock().unwrap().clone();
        c
    };
    let url = format!("http://{}:{}/api/logs", config.host, config.port);
    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => {
            resp.json::<serde_json::Value>().await
                .map_err(|e| format!("Failed to parse logs: {}", e))
        }
        Ok(resp) => Err(format!("Server returned {}", resp.status())),
        Err(_) => Ok(serde_json::Value::Array(vec![])),
    }
}

#[tauri::command]
async fn fetch_proxy_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let config = {
        let state = app.state::<AppState>();
        let c = state.config.lock().unwrap().clone();
        c
    };
    let url = format!("http://{}:{}/api/status", config.host, config.port);
    match reqwest::get(&url).await {
        Ok(resp) if resp.status().is_success() => {
            resp.json::<serde_json::Value>().await
                .map_err(|e| format!("Failed to parse status: {}", e))
        }
        Ok(resp) => Err(format!("Server returned {}", resp.status())),
        Err(_) => Ok(serde_json::json!({"requestCount": 0})),
    }
}

#[tauri::command]
async fn clear_proxy_logs(app: AppHandle) -> Result<(), String> {
    let config = {
        let state = app.state::<AppState>();
        let c = state.config.lock().unwrap().clone();
        c
    };
    let client = reqwest::Client::new();
    let _ = client
        .delete(format!("http://{}:{}/api/logs", config.host, config.port))
        .send()
        .await;
    Ok(())
}

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    let state = app.state::<AppState>();
    let c = state.config.lock().unwrap().clone();
    c
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    if config.base_url.trim().is_empty() {
        return Err("Base URL is required".into());
    }
    if config.api_key.trim().is_empty() {
        return Err("API Key is required".into());
    }
    if config.port == 0 {
        return Err("Port must be between 1 and 65535".into());
    }
    save_config_disk(&config);
    let state = app.state::<AppState>();
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
async fn start_server(app: AppHandle) -> Result<ServerStatus, String> {
    do_start_server(&app).await
}

#[tauri::command]
async fn stop_server(app: AppHandle) -> Result<(), String> {
    do_stop_server(&app).await
}

#[tauri::command]
fn get_server_status(app: AppHandle) -> ServerStatus {
    let state = app.state::<AppState>();
    let config = state.config.lock().unwrap().clone();
    let started_at = *state.started_at.lock().unwrap();
    let running = state.server_process.lock().unwrap().is_some();
    let request_count = *state.request_count.lock().unwrap();
    ServerStatus {
        running,
        started_at,
        host: config.host,
        port: config.port,
        request_count,
    }
}

#[tauri::command]
async fn test_connection(url: String, api_key: String) -> TestResult {
    let base_url = url.trim_end_matches('/');
    let models_url = if base_url.contains("api.deepseek.com") {
        format!("{}/models", base_url)
    } else {
        format!("{}/v1/models", base_url)
    };

    match reqwest::Client::new()
        .get(&models_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => match resp.json::<serde_json::Value>().await {
            Ok(data) => {
                let models: Vec<ModelInfo> = data
                    .get("data")
                    .and_then(|d| d.as_array())
                    .map(|arr| {
                        arr.iter()
                            .map(|item| ModelInfo {
                                name: item["id"].as_str().unwrap_or("unknown").into(),
                                model: item["id"].as_str().unwrap_or("unknown").into(),
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                TestResult {
                    success: true,
                    models,
                    error: None,
                }
            }
            Err(e) => TestResult {
                success: false,
                models: vec![],
                error: Some(format!("Failed to parse response: {}", e)),
            },
        },
        Ok(resp) => TestResult {
            success: false,
            models: vec![],
            error: Some(format!("API returned status {}", resp.status())),
        },
        Err(e) => TestResult {
            success: false,
            models: vec![],
            error: Some(format!("Connection failed: {}", e)),
        },
    }
}

// ── Tray menu ──

fn update_tray_menu(app: &AppHandle, status: &ServerStatus) {
    let server_label = if status.running {
        "Stop Server"
    } else {
        "Start Server"
    };
    let status_label = if status.running {
        format!("Running on {}:{}", status.host, status.port)
    } else {
        "Server Stopped".into()
    };

    let show_item = MenuItemBuilder::with_id("toggle_window", "Show/Hide Window")
        .build(app)
        .ok();
    let sep1 = PredefinedMenuItem::separator(app).ok();
    let server_item = MenuItemBuilder::with_id("toggle_server", server_label)
        .build(app)
        .ok();
    let sep2 = PredefinedMenuItem::separator(app).ok();
    let status_item = MenuItemBuilder::with_id("status_label", status_label)
        .enabled(false)
        .build(app)
        .ok();
    let exit_item = MenuItemBuilder::with_id("exit", "Exit").build(app).ok();

    let items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![
        show_item.as_ref().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>),
        sep1.as_ref().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>),
        server_item.as_ref().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>),
        status_item.as_ref().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>),
        sep2.as_ref().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>),
        exit_item.as_ref().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();

    if let Ok(menu) = MenuBuilder::new(app).items(&items).build() {
        if let Some(tray) = app.tray_by_id("main") {
            tray.set_menu(Some(menu)).ok();
        }
    }
}

fn build_tray(app: &AppHandle) {
    let initial_status = ServerStatus {
        running: false,
        started_at: None,
        host: "localhost".into(),
        port: 11434,
        request_count: 0,
    };

    update_tray_menu(app, &initial_status);

    if let Some(tray) = app.tray_by_id("main") {
        tray.on_menu_event(move |app, event| match event.id().as_ref() {
            "toggle_window" => {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        window.hide().ok();
                    } else {
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
            }
            "toggle_server" => {
                let handle = app.clone();
                let running = {
                    let state = app.state::<AppState>();
                    let r = state.server_process.lock().unwrap().is_some();
                    r
                };
                tauri::async_runtime::spawn(async move {
                    if running {
                        let _ = do_stop_server(&handle).await;
                    } else {
                        let _ = do_start_server(&handle).await;
                    }
                });
            }
            "exit" => {
                {
                    let state = app.state::<AppState>();
                    let mut proc = state.server_process.lock().unwrap();
                    if let Some(ref mut child) = *proc {
                        child.kill().ok();
                        child.wait().ok();
                    }
                }
                app.exit(0);
            }
            _ => {}
        });

        tray.on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        window.hide().ok();
                    } else {
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
            }
        });
    }
}

// ── App setup ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let config = load_config_disk();

            let state = AppState {
                config: Mutex::new(config.clone()),
                server_process: Mutex::new(None),
                started_at: Mutex::new(None),
                request_count: Mutex::new(0),
            };
            app.manage(state);

            build_tray(&app.handle());

            if config.auto_start_server && !config.api_key.is_empty() {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = do_start_server(&handle).await;
                });
            }

            let window = app.get_webview_window("main").unwrap();
            window.show().ok();

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window.hide().ok();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            start_server,
            stop_server,
            get_server_status,
            test_connection,
            fetch_logs,
            fetch_proxy_status,
            clear_proxy_logs,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {});
}
