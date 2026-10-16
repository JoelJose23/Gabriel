pub mod api;
pub mod core;
pub mod error;
pub mod inference;
pub mod ipc;
pub mod telemetry;
pub mod types;

use core::engine::EngineState;
use tauri::Manager;

#[cfg(debug_assertions)]
fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,gabriel_lib=debug".into()),
        )
        .init();
}

#[cfg(not(debug_assertions))]
fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_tracing();

    tauri::Builder::default()
        .setup(|app| {
            // EngineState::new spawns Tokio tasks, so block_on Tauri's
            // runtime to provide a reactor context (setup itself is sync).
            let engine = tauri::async_runtime::block_on(async {
                EngineState::new(core::EngineConfig::load())
            });
            app.manage(engine.clone());
            let engine = engine.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = api::serve(engine).await {
                    tracing::error!("REST server terminated: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::commands::load_model,
            ipc::commands::unload_model,
            ipc::commands::offload_model,
            ipc::commands::get_telemetry,
            ipc::commands::list_loaded_models,
            ipc::commands::list_models_in_use,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gabriel");
}
