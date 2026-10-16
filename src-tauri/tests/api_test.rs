use axum::body::Body;
use axum::http::{Request, StatusCode};
use futures::StreamExt;
use gabriel_lib::api::router::build_router;
use gabriel_lib::core::engine::EngineState;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

fn test_engine() -> EngineState {
    let config = gabriel_lib::core::EngineConfig::default();
    EngineState::new(config)
}

async fn body_bytes(body: Body) -> Vec<u8> {
    body.collect()
        .await
        .expect("collectable body")
        .to_bytes()
        .to_vec()
}

#[tokio::test]
async fn models_endpoint_lists_loaded_models() {
    let engine = test_engine();
    engine
        .load_model("test-llm", gabriel_lib::types::ModelType::Llm, Some(64 * 1024 * 1024))
        .await
        .expect("load succeeds");
    let app = build_router(engine);

    let res = app
        .oneshot(
            Request::builder()
                .uri("/v1/models")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(res.status(), StatusCode::OK);
    let bytes = body_bytes(res.into_body()).await;
    let v: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(v["object"], "list");
    assert_eq!(v["data"][0]["id"], "test-llm");
    assert_eq!(v["data"][0]["gabriel"]["residency"], "vram");
}

#[tokio::test]
async fn chat_completion_non_stream_returns_content() {
    let engine = test_engine();
    engine
        .load_model("stub-chat", gabriel_lib::types::ModelType::Llm, None)
        .await
        .unwrap();
    let app = build_router(engine);

    let payload = json!({
        "model": "stub-chat",
        "messages": [
            {"role": "system", "content": "You are Gabriel."},
            {"role": "user", "content": "hello"}
        ],
        "stream": false,
        "max_tokens": 32
    });

    let req = Request::builder()
        .method("POST")
        .uri("/v1/chat/completions")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = body_bytes(res.into_body()).await;
    let v: Value = serde_json::from_slice(&bytes).unwrap();

    assert_eq!(v["object"], "chat.completion");
    assert!(
        v["choices"][0]["message"]["content"]
            .as_str()
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    );
    assert!(v["usage"]["total_tokens"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn chat_completion_stream_emits_sse_chunks() {
    let engine = test_engine();
    engine
        .load_model("stub-stream", gabriel_lib::types::ModelType::Llm, None)
        .await
        .unwrap();
    let app = build_router(engine);

    let payload = json!({
        "model": "stub-stream",
        "messages": [{"role": "user", "content": "stream please"}],
        "stream": true,
        "max_tokens": 16
    });

    let req = Request::builder()
        .method("POST")
        .uri("/v1/chat/completions")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);

    let mut stream = res.into_body().into_data_stream();
    let mut collected = String::new();
    while let Some(chunk) = stream.next().await {
        collected.push_str(&String::from_utf8_lossy(
            &chunk.expect("valid chunk"),
        ));
        if collected.contains("[DONE]") {
            break;
        }
    }

    assert!(collected.contains("chat.completion.chunk"));
    assert!(collected.contains("stop"));
}

#[tokio::test]
async fn image_generation_returns_b64_payload() {
    let engine = test_engine();
    engine
        .load_model("stub-image", gabriel_lib::types::ModelType::Image, None)
        .await
        .unwrap();
    let app = build_router(engine);

    let payload = json!({
        "prompt": "a neon skyline at dusk",
        "model": "stub-image",
        "size": "64x64"
    });

    let req = Request::builder()
        .method("POST")
        .uri("/v1/images/generations")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = body_bytes(res.into_body()).await;
    let v: Value = serde_json::from_slice(&bytes).unwrap();

    let b64 = v["data"][0]["b64_json"].as_str().expect("b64 present");
    assert!(!b64.is_empty());
    assert_eq!(&b64[..2], "Qk");
}

#[tokio::test]
async fn speech_synthesis_returns_wav_audio() {
    let engine = test_engine();
    engine
        .load_model("stub-tts", gabriel_lib::types::ModelType::Tts, None)
        .await
        .unwrap();
    let app = build_router(engine);

    let payload = json!({
        "model": "stub-tts",
        "input": "Gabriel online.",
        "voice": "nova"
    });

    let req = Request::builder()
        .method("POST")
        .uri("/v1/audio/speech")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers()["content-type"],
        "audio/wav"
    );

    let bytes = body_bytes(res.into_body()).await;
    assert_eq!(&bytes[..4], b"RIFF");
}

#[tokio::test]
async fn request_to_unloaded_model_is_404() {
    let engine = test_engine();
    let app = build_router(engine);

    let payload = json!({
        "model": "missing-model",
        "messages": [{"role": "user", "content": "hi"}],
        "stream": false
    });

    let req = Request::builder()
        .method("POST")
        .uri("/v1/chat/completions")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn unload_removes_model_and_subsequent_requests_fail() {
    let engine = test_engine();
    engine
        .load_model("temp", gabriel_lib::types::ModelType::Tts, None)
        .await
        .unwrap();
    engine.unload_model("temp").await.unwrap();
    assert!(engine.list_models().is_empty());

    let app = build_router(engine);
    let payload = json!({
        "model": "temp",
        "input": "gone?",
        "voice": "alloy"
    });
    let req = Request::builder()
        .method("POST")
        .uri("/v1/audio/speech")
        .header("content-type", "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let res = app.oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::NOT_FOUND);
}

async fn json_body(body: Body) -> Value {
    let bytes = body_bytes(body).await;
    serde_json::from_slice(&bytes).unwrap()
}

async fn get_json(app: &axum::Router, uri: &str) -> (StatusCode, Value) {
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(uri)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    (status, json_body(res.into_body()).await)
}

async fn post_json(app: &axum::Router, uri: &str, payload: Value) -> (StatusCode, Value) {
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    (status, json_body(res.into_body()).await)
}

async fn put_json(app: &axum::Router, uri: &str, payload: Value) -> (StatusCode, Value) {
    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = res.status();
    (status, json_body(res.into_body()).await)
}

fn default_config_json() -> Value {
    serde_json::to_value(gabriel_lib::core::EngineConfigDto::default()).unwrap()
}

#[tokio::test]
async fn telemetry_endpoint_returns_snapshot() {
    let app = build_router(test_engine());
    let (status, v) = get_json(&app, "/v1/telemetry").await;
    assert_eq!(status, StatusCode::OK);
    assert!(v.get("gpu_name").is_some());
    assert!(v.get("vram_total_bytes").is_some());
    assert!(v.get("loaded_models").is_some());
}

#[tokio::test]
async fn model_lifecycle_endpoints_load_offload_unload() {
    let app = build_router(test_engine());

    let (status, v) = post_json(
        &app,
        "/v1/models/load",
        json!({"model_id": "rest-llm", "model_type": "llm"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["model_id"], "rest-llm");
    assert_eq!(v["residency"], "gpu");

    let (status, _) = get_json(&app, "/v1/models").await;
    assert_eq!(status, StatusCode::OK);

    let (status, v) = post_json(&app, "/v1/models/offload", json!({"model_id": "rest-llm"})).await;
    assert_eq!(status, StatusCode::OK, "{v}");
    assert_eq!(v["residency"], "cpu");

    let (status, v) = post_json(&app, "/v1/models/unload", json!({"model_id": "rest-llm"})).await;
    assert_eq!(status, StatusCode::OK, "{v}");

    let (status, _) = post_json(&app, "/v1/models/unload", json!({"model_id": "rest-llm"})).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn load_with_unknown_type_is_400() {
    let app = build_router(test_engine());
    let (status, _) = post_json(
        &app,
        "/v1/models/load",
        json!({"model_id": "x", "model_type": "banana"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn config_get_put_round_trip() {
    // Keep the on-disk write out of the real user config directory.
    let tmp = std::env::temp_dir().join(format!("gabriel-test-config-{}", std::process::id()));
    unsafe { std::env::set_var("XDG_CONFIG_HOME", &tmp) };

    let app = build_router(test_engine());

    let (status, before) = get_json(&app, "/v1/config").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(before["max_loaded_models"], 4);

    let mut dto = before.clone();
    dto["max_loaded_models"] = json!(6);
    dto["auto_load_on_request"] = json!(true);
    dto["vram_high_watermark"] = json!(0.9);

    let (status, v) = put_json(&app, "/v1/config", dto).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["config"]["max_loaded_models"], 6);
    assert_eq!(v["config"]["auto_load_on_request"], true);
    assert_eq!(v["restart_required"], json!([]));

    let (status, after) = get_json(&app, "/v1/config").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(after["max_loaded_models"], 6);

    let _ = std::fs::remove_dir_all(&tmp);
}

#[tokio::test]
async fn config_put_rejects_invalid_values() {
    let app = build_router(test_engine());
    let mut dto = default_config_json();
    dto["vram_low_watermark"] = json!(0.95);
    dto["vram_high_watermark"] = json!(0.5);

    let (status, _) = put_json(&app, "/v1/config", dto).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn config_put_reports_restart_required_fields() {
    let tmp = std::env::temp_dir().join(format!("gabriel-test-config-r-{}", std::process::id()));
    unsafe { std::env::set_var("XDG_CONFIG_HOME", &tmp) };

    let app = build_router(test_engine());
    let mut dto = default_config_json();
    dto["port"] = json!(9090);

    let (status, v) = put_json(&app, "/v1/config", dto).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["restart_required"], json!(["port"]));

    let _ = std::fs::remove_dir_all(&tmp);
}

#[tokio::test]
async fn events_endpoint_reports_model_lifecycle() {
    let app = build_router(test_engine());
    let (status, v) = post_json(
        &app,
        "/v1/models/load",
        json!({"model_id": "event-model", "model_type": "tts"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{v}");

    let (status, events) = get_json(&app, "/v1/system/events?after=0").await;
    assert_eq!(status, StatusCode::OK);
    let list = events["events"].as_array().expect("events array");
    assert!(!list.is_empty());
    assert!(
        list.iter()
            .any(|e| e["message"].as_str().map(|m| m.contains("event-model")) == Some(true)),
        "expected load event, got {list:?}"
    );

    let last_seq = list.last().unwrap()["seq"].as_u64().unwrap();
    let (_, after) = get_json(&app, &format!("/v1/system/events?after={last_seq}")).await;
    assert_eq!(after["events"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn health_reports_engine_status() {
    let app = build_router(test_engine());
    let (status, v) = get_json(&app, "/health").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["status"], "ok");
    assert!(v["version"].as_str().is_some());
    assert!(v.get("uptime_secs").is_some());
}

#[tokio::test]
async fn processes_endpoint_returns_sorted_list() {
    let app = build_router(test_engine());
    let (status, v) = get_json(&app, "/v1/system/processes").await;
    assert_eq!(status, StatusCode::OK);
    let list = v["processes"].as_array().expect("processes array");
    assert!(!list.is_empty());
    assert!(list[0].get("pid").is_some());
    assert!(list[0].get("name").is_some());
}

#[tokio::test]
async fn cors_preflight_grants_frontend_origin_only() {
    let app = build_router(test_engine());

    let res = app
        .clone()
        .oneshot(
            Request::builder()
                .method("OPTIONS")
                .uri("/v1/telemetry")
                .header("origin", "http://localhost:5173")
                .header("access-control-request-method", "GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(
        res.headers().get("access-control-allow-origin").map(|v| v.to_str().unwrap()),
        Some("http://localhost:5173")
    );

    let res = app
        .oneshot(
            Request::builder()
                .method("OPTIONS")
                .uri("/v1/telemetry")
                .header("origin", "https://evil.example")
                .header("access-control-request-method", "GET")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(res.headers().get("access-control-allow-origin").is_none());
}
