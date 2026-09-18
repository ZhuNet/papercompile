#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(papercompile_core::agent_sidecar::AgentSidecar::default())
        .setup(|app| {
            let sidecar = app.state::<papercompile_core::agent_sidecar::AgentSidecar>();
            sidecar.start(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_project_command,
            compile_project_command,
            propose_source_edit_command,
            accept_revision_command,
            save_source_command,
            create_project_file_command,
            create_project_folder_command,
            rename_project_item_command,
            delete_project_item_command,
            import_project_files_command,
            send_agent_command,
            agent_sidecar_status,
            agent_ready_snapshot,
            restart_agent_sidecar,
            agent_config_directory,
            scan_project_command,
            read_project_file_command,
            create_project_file_with_content_command,
            save_compiled_pdf_command,
            watch_project_command
        ])
        .build(tauri::generate_context!())
        .expect("failed to build PaperCompile");
    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
            use tauri::Manager;
            handle
                .state::<papercompile_core::agent_sidecar::AgentSidecar>()
                .shutdown(handle);
        }
    });
}

#[tauri::command(rename = "send_agent_command")]
fn send_agent_command(
    command: serde_json::Value,
    sidecar: tauri::State<'_, papercompile_core::agent_sidecar::AgentSidecar>,
) -> Result<(), String> {
    sidecar.send(&command)
}

#[tauri::command(rename = "agent_sidecar_status")]
fn agent_sidecar_status(
    sidecar: tauri::State<'_, papercompile_core::agent_sidecar::AgentSidecar>,
) -> papercompile_core::agent_sidecar::SidecarStatus {
    sidecar.status()
}

#[tauri::command(rename = "agent_ready_snapshot")]
fn agent_ready_snapshot(
    sidecar: tauri::State<'_, papercompile_core::agent_sidecar::AgentSidecar>,
) -> Option<serde_json::Value> {
    sidecar.ready_snapshot()
}

#[tauri::command(rename = "restart_agent_sidecar")]
fn restart_agent_sidecar(
    app: tauri::AppHandle,
    sidecar: tauri::State<'_, papercompile_core::agent_sidecar::AgentSidecar>,
) -> Result<(), String> {
    sidecar.restart(&app)
}

#[tauri::command(rename = "agent_config_directory")]
fn agent_config_directory(app: tauri::AppHandle) -> Result<String, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("agent")
        .join("agents")
        .join("omp");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.to_string_lossy().into_owned())
}

#[tauri::command(rename = "save_compiled_pdf")]
fn save_compiled_pdf_command(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, data).map_err(|error| error.to_string())
}

#[tauri::command(rename = "watch_project")]
fn watch_project_command(root: String, app: tauri::AppHandle) -> Result<(), String> {
    std::thread::Builder::new()
        .name("papercompile-project-watcher".into())
        .spawn(move || {
            use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
            use std::sync::mpsc::channel;
            let (sender, receiver) = channel();
            let mut watcher = match RecommendedWatcher::new(sender, Config::default()) {
                Ok(watcher) => watcher,
                Err(_) => return,
            };
            if watcher
                .watch(std::path::Path::new(&root), RecursiveMode::Recursive)
                .is_err()
            {
                return;
            }
            while receiver.recv().is_ok() {
                let _ = tauri::Emitter::emit(&app, "project-changed", &root);
                while receiver.try_recv().is_ok() {}
            }
        })
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "propose_source_edit")]
fn propose_source_edit_command(
    root: String,
    path: String,
    expected_hash: String,
    new_source: String,
) -> Result<papercompile_core::core::ProposedChangeSet, String> {
    papercompile_core::source::propose_source_edit(
        std::path::Path::new(&root),
        &path,
        &expected_hash,
        &new_source,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command(rename = "accept_revision")]
fn accept_revision_command(
    root: String,
    changes: papercompile_core::core::ProposedChangeSet,
) -> Result<papercompile_core::project::Project, String> {
    papercompile_core::revision::accept_change_set(std::path::Path::new(&root), &changes)
        .map_err(|error| error.to_string())
        .and_then(|_| {
            papercompile_core::project::open_project(std::path::Path::new(&root), None)
                .map_err(|error| error.to_string())
        })
}

#[tauri::command(rename = "save_source")]
fn save_source_command(
    root: String,
    path: String,
    expected_hash: String,
    content: String,
) -> Result<(), String> {
    papercompile_core::source::save_source(
        std::path::Path::new(&root),
        &path,
        &expected_hash,
        &content,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command(rename = "create_project_file")]
fn create_project_file_command(root: String, path: String) -> Result<(), String> {
    papercompile_core::project::create_project_text_file(std::path::Path::new(&root), &path)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "create_project_file_with_content")]
fn create_project_file_with_content_command(
    root: String,
    path: String,
    content: String,
) -> Result<(), String> {
    papercompile_core::project::create_project_text_file_with_content(
        std::path::Path::new(&root),
        &path,
        &content,
    )
    .map_err(|error| error.to_string())
}

#[tauri::command(rename = "read_project_file")]
fn read_project_file_command(root: String, path: String) -> Result<String, String> {
    papercompile_core::project::read_project_file(std::path::Path::new(&root), &path)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "create_project_folder")]
fn create_project_folder_command(root: String, path: String) -> Result<(), String> {
    papercompile_core::project::create_project_folder(std::path::Path::new(&root), &path)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "rename_project_item")]
fn rename_project_item_command(root: String, from: String, to: String) -> Result<(), String> {
    papercompile_core::project::rename_project_item(std::path::Path::new(&root), &from, &to)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "delete_project_item")]
fn delete_project_item_command(root: String, path: String) -> Result<(), String> {
    papercompile_core::project::delete_project_item(std::path::Path::new(&root), &path)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "import_project_files")]
fn import_project_files_command(
    root: String,
    folder: String,
    sources: Vec<String>,
) -> Result<Vec<String>, String> {
    let sources = sources
        .into_iter()
        .map(std::path::PathBuf::from)
        .collect::<Vec<_>>();
    papercompile_core::project::import_project_files(std::path::Path::new(&root), &folder, &sources)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "compile_project")]
async fn compile_project_command(
    root: String,
    entry: String,
    sources: Vec<papercompile_core::project::SourceFile>,
) -> Result<papercompile_core::compiler::CompileReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        papercompile_core::compiler::compile_project_detailed(
            std::path::Path::new(&root),
            &entry,
            &sources,
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command(rename = "open_project")]
fn open_project_command(
    path: String,
    entry: Option<String>,
) -> Result<papercompile_core::project::Project, String> {
    papercompile_core::project::open_project(std::path::Path::new(&path), entry.as_deref())
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "scan_project")]
fn scan_project_command(path: String) -> Result<papercompile_core::project::Project, String> {
    papercompile_core::project::scan_project(std::path::Path::new(&path))
        .map_err(|error| error.to_string())
}
