use axum::extract::{Query, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use sysinfo::{ProcessesToUpdate, System};

use crate::core::engine::EngineState;
use crate::core::events::EventEntry;

#[derive(Debug, Serialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct ProcessListResponse {
    pub processes: Vec<ProcessInfo>,
}

/// `GET /v1/system/processes` — top processes by memory, for the System page
/// process table. Runs on the blocking pool: sampling per-process CPU needs
/// two refreshes separated by `MINIMUM_CPU_UPDATE_INTERVAL`.
pub async fn list_processes() -> Json<ProcessListResponse> {
    let processes = tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_processes(ProcessesToUpdate::All, true);

        let mut list: Vec<ProcessInfo> = sys
            .processes()
            .values()
            .map(|p| ProcessInfo {
                pid: p.pid().as_u32(),
                name: p.name().to_string_lossy().into_owned(),
                cpu_percent: p.cpu_usage(),
                memory_bytes: p.memory(),
                status: p.status().to_string(),
            })
            .collect();
        list.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
        list.truncate(64);
        list
    })
    .await
    .unwrap_or_default();

    Json(ProcessListResponse { processes })
}

#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    /// Return only events with `seq` greater than this (cursor polling).
    pub after: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct EventsResponse {
    pub events: Vec<EventEntry>,
}

/// `GET /v1/system/events?after=<seq>` — engine lifecycle events from the
/// in-memory ring buffer (model loads, config changes, failures).
pub async fn list_events(
    State(engine): State<EngineState>,
    Query(query): Query<EventsQuery>,
) -> Json<EventsResponse> {
    Json(EventsResponse {
        events: engine.events().since(query.after.unwrap_or(0)),
    })
}
