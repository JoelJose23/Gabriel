use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::core::engine::EngineState;

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: String,
    pub uptime_secs: u64,
    pub loaded_models: usize,
    pub active_jobs: usize,
    /// API dialect served by this engine.
    pub api: &'static str,
}

/// `GET /health` — liveness plus lightweight engine status for the UI
/// (Settings backend panel, System engine status list).
pub async fn health(State(engine): State<EngineState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_secs: engine.uptime_secs(),
        loaded_models: engine.list_models().len(),
        active_jobs: engine.active_jobs(),
        api: "openai-compatible/v1",
    })
}
