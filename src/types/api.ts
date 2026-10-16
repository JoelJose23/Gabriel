// Type definitions mirroring the Gabriel REST API (src-tauri/src/types/*).

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Residency as reported by /v1/models (`gabriel.residency`). */
export type ModelResidency = 'vram' | 'ram';

/** Residency as reported by ModelStatus / telemetry (`Residency` serde). */
export type RuntimeResidency = 'gpu' | 'cpu';

export type ModelKind = 'llm' | 'embedding' | 'image' | 'tts' | 'asr';

export interface GabrielModelMeta {
  model_type: ModelKind;
  residency: ModelResidency;
  vram_bytes: number;
  active_jobs: number;
  in_use: boolean;
  idle_secs: number;
}

export interface ModelListEntry {
  id: string;
  object: 'model';
  owned_by: string;
  gabriel: GabrielModelMeta;
}

export interface ModelListResponse {
  object: 'list';
  data: ModelListEntry[];
}

export interface ModelStatus {
  model_id: string;
  model_type: ModelKind;
  residency: RuntimeResidency;
  vram_bytes: number;
  loaded_at_unix: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface EngineConfig {
  host: string;
  port: number;
  vram_high_watermark: number;
  vram_low_watermark: number;
  idle_offload_after_secs: number;
  pager_poll_interval_secs: number;
  queue_capacity: number;
  max_concurrent_image_jobs: number;
  auto_load_on_request: boolean;
  bandwidth_ceiling_percent: number;
  max_bandwidth_yield_ms: number;
  max_loaded_models: number;
}

export interface ConfigUpdateResponse {
  config: EngineConfig;
  restart_required: string[];
}

// ---------------------------------------------------------------------------
// Chat (OpenAI wire format)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatDelta {
  role?: string | null;
  content?: string | null;
}

export interface ChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: ChatDelta;
    finish_reason: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Images / speech
// ---------------------------------------------------------------------------

export interface ImageGenerationResponse {
  created: number;
  data: Array<{ b64_json: string }>;
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_bytes: number;
  status: string;
}

export interface ProcessListResponse {
  processes: ProcessInfo[];
}

export interface EventEntry {
  seq: number;
  ts_unix_ms: number;
  level: 'info' | 'warn' | 'error' | string;
  source: string;
  message: string;
}

export interface EventsResponse {
  events: EventEntry[];
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime_secs: number;
  loaded_models: number;
  active_jobs: number;
  api: string;
}

// ---------------------------------------------------------------------------
// Sessions (localStorage-backed, not persisted server-side)
// ---------------------------------------------------------------------------

export interface StoredSession {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}
