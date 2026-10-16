
use axum::extract::State;
use axum::Json;

use crate::core::engine::EngineState;
use crate::types::openai::{
    GabrielModelMeta, ModelListEntry, ModelListEntryMeta,
};

fn to_entry(m: &crate::types::ModelRuntimeInfo) -> ModelListEntry {
    ModelListEntry {
        id: m.id.clone(),
        object: "model".into(),
        owned_by: "gabriel".into(),
        gabriel: GabrielModelMeta {
            model_type: format!("{:?}", m.model_type).to_lowercase(),
            residency: match m.residency {
                crate::types::Residency::Gpu => "vram".into(),
                crate::types::Residency::Cpu => "ram".into(),
            },
            vram_bytes: m.vram_bytes,
            active_jobs: m.active_jobs,
            in_use: m.in_use,
            idle_secs: m.idle_secs,
        },
    }
}

pub async fn list_models(State(engine): State<EngineState>) -> Json<ModelListEntryMeta> {
    let models = engine.list_models();
    let entries = models.iter().map(to_entry).collect();
    Json(ModelListEntryMeta::new(entries))
}

/// Models currently in use (at least one active streaming/generation job).
/// `GET /v1/models/in_use` — handy against `smoke_server` to infer which
/// model is actively inferring right now.
pub async fn list_models_in_use(
    State(engine): State<EngineState>,
) -> Json<ModelListEntryMeta> {
    let models = engine.list_models_in_use();
    let entries = models.iter().map(to_entry).collect();
    Json(ModelListEntryMeta::new(entries))
}
