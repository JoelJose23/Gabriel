use std::time::Duration;

use axum::Router;
use axum::http::{HeaderName, HeaderValue, Method};
use axum::routing::{delete, get, post};
use tower_http::cors::{Any, CorsLayer};

use crate::core::engine::EngineState;

use super::routes::{
    catalogue, chat, config, health, images, models_list, models_manage, speech, storage, system,
    telemetry,
};

pub fn build_router(engine: EngineState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(chat::chat_completions))
        .route("/v1/images/generations", post(images::images_generations))
        .route("/v1/audio/speech", post(speech::audio_speech))
        .route("/v1/models", get(models_list::list_models))
        .route("/v1/models/in_use", get(models_list::list_models_in_use))
        .route("/v1/models/catalogue", get(catalogue::list_catalogue))
        .route("/v1/models/install", post(catalogue::install_model))
        .route("/v1/models/load", post(models_manage::load_model))
        .route("/v1/models/offload", post(models_manage::offload_model))
        .route("/v1/models/unload", post(models_manage::unload_model))
        .route("/v1/telemetry", get(telemetry::get_telemetry))
        .route(
            "/v1/config",
            get(config::get_config).put(config::put_config),
        )
        .route(
            "/v1/storage/paths",
            get(storage::get_paths).put(storage::update_paths),
        )
        .route(
            "/v1/storage/llm",
            get(storage::list_llm).post(storage::save_llm),
        )
        .route("/v1/storage/llm/{id}", delete(storage::delete_llm))
        .route("/v1/storage/images", get(storage::list_images))
        .route(
            "/v1/storage/images/file/{filename}",
            get(storage::serve_image_file),
        )
        .route("/v1/storage/images/{id}", delete(storage::delete_image))
        .route("/v1/storage/tts", get(storage::list_tts))
        .route(
            "/v1/storage/tts/file/{filename}",
            get(storage::serve_tts_file),
        )
        .route("/v1/storage/tts/{id}", delete(storage::delete_tts))
        .route("/v1/system/processes", get(system::list_processes))
        .route("/v1/system/events", get(system::list_events))
        .route("/health", get(health::health))
        .layer(cors_layer())
        .with_state(engine)
}

/// CORS for the React webview/browser origins. The engine binds to
/// 127.0.0.1, so only the known frontend origins are granted browser access.
fn cors_layer() -> CorsLayer {
    let allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "tauri://localhost",
        "http://tauri.localhost",
    ];
    let mut layer = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("accept"),
        ])
        .max_age(Duration::from_secs(600));

    let origins: Vec<HeaderValue> = allowed_origins
        .iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();
    if origins.is_empty() {
        layer = layer.allow_origin(Any);
    } else {
        layer = layer.allow_origin(origins);
    }
    layer
}
