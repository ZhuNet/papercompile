use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarStatus {
    Starting,
    Running,
    Stopping,
    Stopped,
    Failed,
}

pub fn parse_sidecar_line(line: &str) -> Result<serde_json::Value, serde_json::Error> {
    serde_json::from_str(line)
}

pub fn encode_sidecar_command(command: &serde_json::Value) -> Result<Vec<u8>, serde_json::Error> {
    let mut bytes = serde_json::to_vec(command)?;
    bytes.push(b'\n');
    Ok(bytes)
}

pub struct AgentSidecar {
    child: std::sync::Arc<Mutex<Option<CommandChild>>>,
    status: std::sync::Arc<Mutex<SidecarStatus>>,
    ready: std::sync::Arc<Mutex<Option<serde_json::Value>>>,
    generation: std::sync::Arc<Mutex<u64>>,
}

impl Default for AgentSidecar {
    fn default() -> Self {
        Self {
            child: std::sync::Arc::new(Mutex::new(None)),
            status: std::sync::Arc::new(Mutex::new(SidecarStatus::Stopped)),
            ready: std::sync::Arc::new(Mutex::new(None)),
            generation: std::sync::Arc::new(Mutex::new(0)),
        }
    }
}

impl AgentSidecar {
    pub fn status(&self) -> SidecarStatus {
        *self.status.lock().expect("agent sidecar status lock poisoned")
    }

    pub fn start(&self, app: &AppHandle) -> Result<(), String> {
        if self.child.lock().map_err(|error| error.to_string())?.is_some() {
            return Ok(());
        }
        self.set_status(app, SidecarStatus::Starting);
        if let Ok(mut ready) = self.ready.lock() {
            *ready = None;
        }
        let generation = {
            let mut current = self.generation.lock().map_err(|error| error.to_string())?;
            *current += 1;
            *current
        };
        let command = app
            .shell()
            .sidecar("papercompile-agent")
            .map_err(|error| error.to_string())?;
        let (mut receiver, child) = command.spawn().map_err(|error| error.to_string())?;
        *self.child.lock().map_err(|error| error.to_string())? = Some(child);

        let config_root = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("agent");
        std::fs::create_dir_all(&config_root).map_err(|error| error.to_string())?;
        self.send(&serde_json::json!({
            "type": "initialize",
            "requestId": "startup",
            "configRoot": config_root,
        }))?;
        self.set_status(app, SidecarStatus::Running);

        let app = app.clone();
        let ready = self.ready.clone();
        let child_state = self.child.clone();
        let status = self.status.clone();
        let active_generation = self.generation.clone();
        tauri::async_runtime::spawn(async move {
            let mut stdout = String::new();
            while let Some(event) = receiver.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        stdout.push_str(&String::from_utf8_lossy(&bytes));
                        while let Some(index) = stdout.find('\n') {
                            let line = stdout[..index].trim().to_string();
                            stdout.drain(..=index);
                            if line.is_empty() {
                                continue;
                            }
                            match parse_sidecar_line(&line) {
                                Ok(event) => {
                                    if event.get("type").and_then(serde_json::Value::as_str) == Some("ready") {
                                        if let Ok(mut snapshot) = ready.lock() {
                                            *snapshot = Some(event.clone());
                                        }
                                    }
                                    let _ = app.emit("agent-event", event);
                                }
                                Err(error) => {
                                    let _ = app.emit("agent-protocol-error", error.to_string());
                                }
                            }
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        let _ = app.emit("agent-stderr", String::from_utf8_lossy(&bytes).to_string());
                    }
                    CommandEvent::Terminated(payload) => {
                        if active_generation.lock().map(|current| *current != generation).unwrap_or(true) {
                            continue;
                        }
                        if let Ok(mut child) = child_state.lock() {
                            *child = None;
                        }
                        if let Ok(mut current) = status.lock() {
                            *current = SidecarStatus::Failed;
                        }
                        let _ = app.emit("agent-sidecar-status", SidecarStatus::Failed);
                        let _ = app.emit("agent-sidecar-exited", payload.code);
                    }
                    _ => {}
                }
            }
        });
        Ok(())
    }

    pub fn send(&self, command: &serde_json::Value) -> Result<(), String> {
        let bytes = encode_sidecar_command(command).map_err(|error| error.to_string())?;
        let mut guard = self.child.lock().map_err(|error| error.to_string())?;
        guard
            .as_mut()
            .ok_or_else(|| "agent sidecar is not running".to_string())?
            .write(&bytes)
            .map_err(|error| error.to_string())
    }

    pub fn ready_snapshot(&self) -> Option<serde_json::Value> {
        self.ready.lock().ok().and_then(|value| value.clone())
    }

    pub fn shutdown(&self, app: &AppHandle) {
        self.set_status(app, SidecarStatus::Stopping);
        let _ = self.send(&serde_json::json!({ "type": "shutdown", "requestId": "shutdown" }));
        for _ in 0..10 {
            if self
                .child
                .lock()
                .map(|child| child.is_none())
                .unwrap_or(true)
            {
                self.set_status(app, SidecarStatus::Stopped);
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
        self.set_status(app, SidecarStatus::Stopped);
    }

    pub fn restart(&self, app: &AppHandle) -> Result<(), String> {
        self.shutdown(app);
        self.start(app)
    }

    fn set_status(&self, app: &AppHandle, status: SidecarStatus) {
        if let Ok(mut current) = self.status.lock() {
            *current = status;
        }
        let _ = app.emit("agent-sidecar-status", status);
    }
}
