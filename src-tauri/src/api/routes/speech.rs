use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::header::CONTENT_TYPE;
use axum::response::Response;

use crate::core::engine::EngineState;
use crate::error::{ApiError, GabrielError};
use crate::types::openai::SpeechRequest;

pub async fn audio_speech(
    State(engine): State<EngineState>,
    Json(req): Json<SpeechRequest>,
) -> Result<Response, ApiError> {
    if req.input.trim().is_empty() {
        return Err(ApiError(GabrielError::InvalidRequest(
            "input text must not be empty".into(),
        )));
    }
    if req.input.chars().count() > 10_000 {
        return Err(ApiError(GabrielError::InvalidRequest(
            "input text exceeds the 10000 character limit".into(),
        )));
    }
    if !(0.25..=4.0).contains(&req.speed) {
        return Err(ApiError(GabrielError::InvalidRequest(
            "speed must be between 0.25 and 4.0".into(),
        )));
    }

    let model_id = req.model.clone();
    let voice = req.voice.unwrap_or_else(|| "alloy".into());
    let voice_meta = voice.clone();

    let rx = engine
        .submit_speech(&model_id, req.input.clone(), voice, req.speed)
        .await
        .map_err(ApiError)?;

    let wav = rx
        .await
        .map_err(|_| ApiError(GabrielError::Internal("speech job dropped".into())))?
        .map_err(ApiError)?;

    let tts_dir = engine.config().tts_dir;
    if let Err(e) = crate::core::storage::save_tts_artifact(
        &tts_dir,
        &wav,
        &req.input,
        &voice_meta,
        &model_id,
        req.speed,
    )
    .await
    {
        tracing::warn!(error = %e, "failed to persist TTS artifact to workspace");
    }

    Response::builder()
        .status(axum::http::StatusCode::OK)
        .header(CONTENT_TYPE, "audio/wav")
        .body(Body::from(wav))
        .map_err(|e| ApiError(GabrielError::Internal(e.to_string())))
}
