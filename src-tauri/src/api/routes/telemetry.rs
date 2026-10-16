use axum::extract::State;
use axum::Json;

use crate::core::engine::EngineState;
use crate::types::TelemetrySnapshot;

/// `GET /v1/telemetry` — full GPU/RAM/CPU/VRAM snapshot.
/// HTTP mirror of the `get_telemetry` Tauri IPC command so the UI can run
/// identically inside the desktop webview and in a plain browser.
pub async fn get_telemetry(State(engine): State<EngineState>) -> Json<TelemetrySnapshot> {
    Json(engine.telemetry_snapshot())
}
