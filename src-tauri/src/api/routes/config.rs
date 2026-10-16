use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::core::{EngineConfig, EngineConfigDto};
use crate::core::engine::EngineState;
use crate::error::{ApiError, GabrielError};

#[derive(Debug, Serialize)]
pub struct ConfigUpdateResponse {
    pub config: EngineConfigDto,
    /// Fields that changed whose effects are construction-time only and
    /// therefore require an engine restart to take effect.
    pub restart_required: Vec<String>,
}

/// `GET /v1/config` — the live engine governor configuration.
pub async fn get_config(State(engine): State<EngineState>) -> Json<EngineConfigDto> {
    Json(engine.config().into())
}

/// `PUT /v1/config` — validate, hot-apply, and persist a new configuration.
///
/// Live-applied immediately: max_loaded_models, auto_load_on_request,
/// VRAM watermarks, idle offload timeout, bandwidth ceiling/yield.
/// Restart-required: host, port, queue_capacity, pager_poll_interval,
/// max_concurrent_image_jobs (reported in `restart_required`).
pub async fn put_config(
    State(engine): State<EngineState>,
    Json(req): Json<EngineConfigDto>,
) -> Result<Json<ConfigUpdateResponse>, ApiError> {
    req.validate()
        .map_err(|m| ApiError(GabrielError::InvalidRequest(m)))?;

    let new = EngineConfig::from(req);
    let old = engine.config();

    let mut restart_required = Vec::new();
    if old.host != new.host {
        restart_required.push("host".to_string());
    }
    if old.port != new.port {
        restart_required.push("port".to_string());
    }
    if old.queue_capacity != new.queue_capacity {
        restart_required.push("queue_capacity".to_string());
    }
    if old.pager_poll_interval != new.pager_poll_interval {
        restart_required.push("pager_poll_interval".to_string());
    }
    if old.max_concurrent_image_jobs != new.max_concurrent_image_jobs {
        restart_required.push("max_concurrent_image_jobs".to_string());
    }

    engine.update_config(new.clone());
    new.save();

    Ok(Json(ConfigUpdateResponse {
        config: new.into(),
        restart_required,
    }))
}
