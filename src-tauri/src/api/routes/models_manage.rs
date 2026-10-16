use axum::extract::State;
use axum::Json;
use serde::Deserialize;

use crate::core::engine::EngineState;
use crate::error::{ApiError, GabrielError};
use crate::types::{ModelStatus, ModelType};

#[derive(Debug, Deserialize)]
pub struct LoadModelRequest {
    pub model_id: String,
    pub model_type: String,
}

#[derive(Debug, Deserialize)]
pub struct ModelIdRequest {
    pub model_id: String,
}

fn parse_model_type(raw: &str) -> Result<ModelType, ApiError> {
    ModelType::parse(raw)
        .ok_or_else(|| ApiError(GabrielError::UnknownModelType(raw.to_string())))
}

/// `POST /v1/models/load` — load a model onto the GPU (LRU-evicts when the
/// slot pool is full). HTTP mirror of the `load_model` IPC command.
pub async fn load_model(
    State(engine): State<EngineState>,
    Json(req): Json<LoadModelRequest>,
) -> Result<Json<ModelStatus>, ApiError> {
    let model_type = parse_model_type(&req.model_type)?;
    let status = engine
        .load_model(&req.model_id, model_type, None)
        .await
        .map_err(ApiError)?;
    Ok(Json(status))
}

/// `POST /v1/models/offload` — demote a model GPU -> RAM, keeping it registered.
pub async fn offload_model(
    State(engine): State<EngineState>,
    Json(req): Json<ModelIdRequest>,
) -> Result<Json<ModelStatus>, ApiError> {
    let status = engine.offload_model(&req.model_id).await.map_err(ApiError)?;
    Ok(Json(status))
}

/// `POST /v1/models/unload` — fully remove a model from the registry.
pub async fn unload_model(
    State(engine): State<EngineState>,
    Json(req): Json<ModelIdRequest>,
) -> Result<Json<ModelStatus>, ApiError> {
    let status = engine.unload_model(&req.model_id).await.map_err(ApiError)?;
    Ok(Json(status))
}
