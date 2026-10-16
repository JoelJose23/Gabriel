# Gabriel – Local AI Studio & Engine

Gabriel is a native, zero-crash, multimodal **local AI desktop application** and **inference engine** written in Rust. It serves as a desktop app powered by a React + Tauri v2 frontend ("Aurora Glass" UI) and a bare-metal Rust core running on Hugging Face Candle. Gabriel provides OpenAI-compatible inference entirely on your local machine with zero telemetry, zero cloud dependencies, and a hardware-aware resource governor that structurally prevents CUDA out-of-memory (OOM) crashes.

It runs both as a desktop app and as a headless server exposing standard OpenAI REST endpoints (`/v1/chat/completions`, `/v1/images/generations`, `/v1/audio/speech`), allowing any OpenAI SDK, LangChain pipeline, or `curl` script to drive it. Beyond the OpenAI surface, a management API (`/v1/models/*`, `/v1/telemetry`, `/v1/config`, `/v1/system/*`) lets the UI — or any HTTP client — load/offload models, read live telemetry, hot-edit the engine governor, and tail engine events. The frontend consumes this API directly (`src/api/`), so the same UI runs identically in the Tauri webview and in a plain browser, with CORS restricted to the known frontend origins.

---

## 🎨 Studio UI & Design System

The frontend is built with a bespoke **"Aurora Glass"** design system inspired by modern macOS, visionOS, and Linear:

* **Soft Matte Glass:** Heavy background blurs (`blur-40px`, `saturate-150%`), sheer surfaces, and light-catching borders.
* **Dynamic Aurora Motion:** Subtle ambient gradients inside sidebars, popups, and active chat surfaces.
* **Typography:** Driven by **DM Sans** for a modern geometric hierarchy.
* **True Dual Themes:**
* *Light Mode:* Translucent off-white glass with gray borders and soft pastel aurora accents.
* *Dark Mode:* Deep charcoal base (`#0a0a0a`), vibrant accent colors, and dark glass surfaces.

### Live-Engine Wiring

* Every page (**Chat, Home, Models, Image, Voice, Settings, System**) talks to the real engine through the typed client in `src/api/` — mock data was retired.
* **Chat** streams completions from `POST /v1/chat/completions` and persists sessions to `localStorage` (`src/lib/sessions.ts`, newest-first, capped at 100).
* **Models** loads/offloads/unloads models via the lifecycle endpoints, including load-by-ID for custom weights.
* **Settings** reads and hot-applies governor config via `GET`/`PUT /v1/config`.
* **System** polls `GET /v1/telemetry` (`useTelemetry`, 1.5–2 s cadence), `GET /health`, `GET /v1/system/processes`, and tails `GET /v1/system/events` for a live activity feed.
* The legacy `RightPanel` layout component was removed in favor of the full-width page surfaces.



### Global Keyboard Shortcuts

| Shortcut | Action | Scope |
| --- | --- | --- |
| `Ctrl + K` | Open Command Palette / Global Search | Global |
| `Ctrl + N` | New Chat Session | Global |
| `Ctrl + T` | Toggle Light/Dark Theme | Global |
| `Ctrl + ,` | Open Settings & Engine Governor | Global |
| `Ctrl + Enter` | Send Prompt | Chat Context |
| `Ctrl + .` | Stop / Abort Generation | Chat Context |

---

## ✨ System Capabilities

| Capability | Detail |
| --- | --- |
| **LLM Chat Streaming** | `POST /v1/chat/completions` with SSE token streaming or buffered JSON. Interactive priority (`-1`) strictly preempts background tasks. Real model: `Qwen2.5-3B-Instruct` Q4_K_M via Candle (~1.9 GB).

 |
| **Image Generation** | `POST /v1/images/generations` task-queued base64 PNG response. Real model: `DreamShaper-8-LCM` (4-step default, tiled VAE). Swappable LCM / DDIM / Euler-Ancestral schedulers.

 |
| **Speech Synthesis** | `POST /v1/audio/speech` outputting 24 kHz WAV audio with voice mapping (`alloy`→`am_adam`, `nova`→`af_sarah`, `onyx`→`am_michael`, `shimmer`→`af_sky`) and dynamic amplitude visualizer. Real model: `Kokoro-82M`.

 |
| **Model Registry & Pager** | `GET /v1/models` tracks active residency and VRAM status. Automatically demotes idle models GPU ➔ System RAM when usage crosses watermarks.

 |
| **Bandwidth Governor** | Smooths NVML memory-controller utilization and inserts backoff into background diffusion steps when the bus runs hot; interactive chat streaming is never throttled.

 |
| **Priority Scheduler** | Two-lane biased channel select where interactive jobs (priority `-1`) strictly preempt background jobs (priority `0`).

 |
| **Slot Pool & Pins** | Count-based `max_loaded_models` cap with deterministic LRU eviction. Models with in-flight jobs are pinned via `JobGuard` RAII and skipped during eviction sweeps.

 |
| **Live Telemetry & IPC** | Real-time monitoring of CPU, GPU, RAM, VRAM budget ledgers, and per-model idle times via NVML/sysinfo and strongly typed Tauri IPC commands. GPU samples now include **temperature, power draw, and driver version**; `GET /v1/telemetry` mirrors the `get_telemetry` IPC command over HTTP. |

| **Model Lifecycle API** | `POST /v1/models/load`, `/v1/models/offload`, `/v1/models/unload` drive residency from anywhere; `GET /v1/models/in_use` (and the `active_jobs` / `in_use` fields on every model) report which models are serving jobs right now. |

| **Hot-Applicable Config API** | `GET`/`PUT /v1/config` validates, hot-applies, and persists governor settings to disk, reporting construction-time fields (host, port, queue capacity, …) in `restart_required`. |

| **Engine Event Log** | A 500-entry ring buffer (`core/events.rs`) records model loads/offloads, scheduler rejections, and stream failures; `GET /v1/system/events?after=<seq>` tails it incrementally for the UI activity feed. |

| **CORS-Sandboxed HTTP** | The Axum server grants browser access only to the known frontend origins (`localhost:5173/4173`, `tauri://localhost`), keeping the engine bound to `127.0.0.1`. |


---

## 🛡️ Core Guarantees & Hardware Hardening

Every model carries a VRAM budget. Before execution touches the GPU, the memory pager:

1. **Reads Utilization:** Queries NVML (Linux/Windows) or Metal (macOS) in real time.


2. **Admission Control:** Rejects requests if projected footprint crosses the high watermark (default **85%** of VRAM) with a typed `VramExhausted` error rather than allowing CUDA OOM kills.


3. **Transparent Offloading:** Evicts least-recently-used (LRU) idle models to system RAM under memory pressure, restoring them transparently on demand.


4. **Software Graceful Degradation:** Bypasses budget checks if GPU VRAM is untracked (0 bytes reported), allowing the engine to continue running.



### Key Hardening Advancements

* **Active-Job Pinning (`JobGuard` RAII):** Increments `Registry::active_jobs` on job start and decrements on drop. All LRU eviction selectors skip entries with `active_jobs > 0`, ensuring long streams or diffusion runs are never paged out mid-execution.


* **Execute-Time Revalidation:** Re-checks model residency immediately before job execution to close races with concurrent LRU sweeps.


* **No Double-Counting:** `load_model` reconciles measured CUDA allocation deltas (`admit(measured - spec)`) instead of stacking redundant budget charges.


* **Memory-Bandwidth Sharing:** An exponential moving average (EMA) of NVML memory-controller utilization triggers proportional step pauses (up to 250ms) for background diffusion when bus utilization exceeds 80%. Interactive token streams are exempt by construction.



---

## 🏗️ Architecture

Gabriel uses a **React + Tauri v2** architecture communicating with a pure **Rust Core**:

```
React UI (Tauri WebView / Aurora Glass)
        │  invoke()                          ▲ telemetry events
        ▼                                     │
┌────────────────────────── src-tauri ────────┴─────────────────────────┐
│  ipc/commands.rs          load_model / unload_model / offload_model   │
│                           get_telemetry / list_loaded_models          │
│                                      │                                │
│                               core/engine.rs  ◄── EngineState (Arc)   │
│                            ┌──────────┼────────────┐                  │
│                 core/scheduler.rs  core/pager.rs  core/registry.rs    │
│                 interactive lane  VRAM budget +   residency table     │
│                 (biased select)   LRU offloading  (+active_jobs pins) │
│                            └──────────┬────────────┘                  │
│                    inference/ (TextBackend · ImageBackend ·           │
│                               SpeechBackend traits → factory)         │
│                     real: Candle LLM · DreamShaper-8-LCM · Kokoro-82M │
│                     stub backends when features are off               │
│                                      │                                │
│  api/  axum @ 127.0.0.1:8080 ────────┘                                │
│  /v1/chat/completions (SSE)  /v1/images/generations                   │
│  /v1/audio/speech            /v1/models       /health                 │
│  /v1/models/{in_use,load,offload,unload}   /v1/telemetry              │
│  /v1/config (GET/PUT)        /v1/system/{processes,events}            │
└───────────────────────────────────────────────────────────────────────┘
```[cite: 1]

The React frontend talks to this server through a typed client (`src/api/`), polling telemetry (`useTelemetry`) and health, tailing engine events, and streaming chat completions — mock data was replaced with live engine responses across every page.

### Module Map


```

src-tauri/src/
├── lib.rs               Tauri builder wiring: state management, server spawn, command registration
├── error.rs             GabrielError — unified error mapping for IPC (serde) and HTTP
├── types/
│   ├── openai.rs        Request/response DTOs for OpenAI wire format
│   ├── ipc.rs           ModelSpec, ModelStatus, Residency, TelemetrySnapshot
│   └── jobs.rs          Job envelope, Priority, ChatEvent, GenParams
├── core/
│   ├── engine.rs        EngineState: orchestration, admission, job execution (+JobGuard pinning)
│   ├── scheduler.rs     Two-lane mpsc queues + dispatcher (tokio::select! biased)
│   ├── pager.rs         MemoryPager: admit(), maintenance pass, VRAM ledger
│   ├── bandwidth.rs     BandwidthGovernor: EMA of NVML memory-controller utilization
│   ├── events.rs         EventLog: 500-entry ring buffer of engine lifecycle events
│   └── registry.rs      Model residency table with LRU tracking + active_jobs pins
├── inference/
│   ├── mod.rs           Backend traits + BackendFactory
│   ├── hub.rs           HuggingFace pull helpers + GPU memory tracking
│   ├── image/           DreamShaper backend, tiled GPU VAE decode, swappable schedulers
│   ├── candle_backend.rs Candle Qwen2.5-3B GGUF text backend (CUDA)
│   ├── tts_kokoro.rs    KokoroSpeechBackend (native kokoro-tiny, 24 kHz WAV)
│   └── stub.rs          Deterministic stub engines used by tests/dev
├── api/
│   ├── router.rs        Axum routing table + CORS layer (frontend origins only)
│   └── routes/          chat.rs (SSE) · images.rs · speech.rs · models_list.rs
│                        models_manage.rs (load/offload/unload) · health.rs
│                        config.rs (GET/PUT, validated + persisted)
│                        telemetry.rs (HTTP mirror of the IPC snapshot)
│                        system.rs (processes + event tail)
├── telemetry/
│   ├── gpu.rs           NVML / Metal / fallback monitors (temp, power, driver)
│   └── sys.rs           sysinfo-based RAM/CPU sampler
└── ipc/commands.rs      #[tauri::command] handlers (incl. list_models_in_use)

src/
├── api/                 Typed HTTP client for the engine (client.ts + endpoint wrappers)
├── types/               api.ts · telemetry.ts — shared request/response types
├── hooks/               useTelemetry (polls /v1/telemetry) · useTheme · useGlobalShortcuts
├── lib/sessions.ts      Chat session persistence (localStorage, newest-first)
├── pages/               Chat · Home · Image · Models · Settings · System · Voice
└── components/          Aurora Glass layout (Sidebar, SystemMonitor, …)

```[cite: 1]

---

## 📦 Real Weights

| Modality | Model ID | Source Repo | Notes |
|---|---|---|---|
| **LLM** | `qwen2.5-3b-instruct` | `Qwen/Qwen2.5-3B-Instruct-GGUF` | Candle GGUF on CUDA, measured VRAM delta[cite: 1] |
| **Image** | `dreamshaper-8` | `Lykon/dreamshaper-8-lcm` | SD 1.5 layout, FP16 UNet on GPU, tiled VAE, 4-step LCM[cite: 1] |
| **Speech** | `tts_kokoro` | `kokoro/kokoro-82m` via `kokoro-tiny` | Native engine, 24 kHz WAV[cite: 1] |

---

## 📡 API Reference

Endpoints match OpenAI wire specifications[cite: 1]:

```bash
# Chat (SSE Streaming)
curl -N http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5-3b-instruct","messages":[{"role":"user","content":"Hello!"}],"stream":true}'

# Image Generation
curl http://127.0.0.1:8080/v1/images/generations \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"A futuristic obsidian city under an aurora","size":"512x512"}'

# Speech Synthesis
curl http://127.0.0.1:8080/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"model":"tts_kokoro","input":"Gabriel online","voice":"nova"}' -o out.wav

# Model Registry Telemetry
curl http://127.0.0.1:8080/v1/models

# Live Telemetry Snapshot (GPU temp/power/driver, VRAM, CPU, RAM)
curl http://127.0.0.1:8080/v1/telemetry

# Models currently serving jobs (active_jobs > 0)
curl http://127.0.0.1:8080/v1/models/in_use

# Model lifecycle: load / offload / unload
curl http://127.0.0.1:8080/v1/models/load \
  -H 'Content-Type: application/json' \
  -d '{"model_id":"qwen2.5-3b-instruct","model_type":"text"}'
curl -X POST http://127.0.0.1:8080/v1/models/offload \
  -H 'Content-Type: application/json' -d '{"model_id":"qwen2.5-3b-instruct"}'
curl -X POST http://127.0.0.1:8080/v1/models/unload \
  -H 'Content-Type: application/json' -d '{"model_id":"qwen2.5-3b-instruct"}'

# Engine governor config — read and hot-apply (validated + persisted to disk)
curl http://127.0.0.1:8080/v1/config
curl -X PUT http://127.0.0.1:8080/v1/config \
  -H 'Content-Type: application/json' \
  -d '{"vram_high_watermark":0.85,"max_loaded_models":4}'

# System: running processes + incremental engine event tail
curl http://127.0.0.1:8080/v1/system/processes
curl 'http://127.0.0.1:8080/v1/system/events?after=0'
```[cite: 1]

`PUT /v1/config` responds with the applied config plus a `restart_required` array listing construction-time fields (`host`, `port`, `queue_capacity`, `pager_poll_interval`, `max_concurrent_image_jobs`); everything else — watermarks, residency cap, idle offload timeout, bandwidth ceiling/yield — hot-applies immediately.

---

## ⚙️ Configuration

Defaults live in `core::EngineConfig`[cite: 1]:

```rust
EngineConfig {
    host: "127.0.0.1".into(),
    port: 8080,
    vram_high_watermark: 0.85,   // Refuse/offload above 85% VRAM
    vram_low_watermark: 0.70,    // Target usage during eviction
    idle_offload_after: 120 s,   // Idle timeout before LRU offload
    pager_poll_interval: 2 s,
    queue_capacity: 256,         // Capacity per scheduler lane
    max_concurrent_image_jobs: 4,
    auto_load_on_request: false, 
    bandwidth_ceiling_percent: 80.0, // Bus utilization threshold for yield backoff
    max_bandwidth_yield: 250 ms, // Max sleep duration per denoising step
    max_loaded_models: 4,        // Residency cap
}
```[cite: 1]

**Persistence & hot-apply:** Config is no longer compile-time only. `EngineConfig::load()` reads `~/.config/gabriel/config.json` on startup (falling back to defaults when missing or malformed), and `EngineConfig::save()` writes it back after every accepted change. The Settings page edits this live through `GET`/`PUT /v1/config`, which runs `EngineConfigDto::validate()` (watermark ordering, port ranges, bandwidth ceiling bounds, …) before applying. Governor knobs — watermarks, residency cap, idle offload timeout, bandwidth ceiling/yield, auto-load — hot-apply to the running engine; binding/queue/poller fields are reported as `restart_required`.

---

## 🚀 Building & Running

### Prerequisites
- **Bun** (v1.1+) — frontend package manager & scripts (`pnpm`/npm also work for plain Vite, but lockfile and Tauri hooks assume Bun)
- **Node.js** runtime compatibility (v18+) for Vite
- **Rust 1.85+** (`rustup update stable`)[cite: 1]
- **Tauri v2 Dependencies:**
  - *Linux:* `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`[cite: 1]
  - *macOS:* Xcode Command Line Tools[cite: 1]
  - *Windows:* WebView2 + MSVC Build Tools[cite: 1]
- **System Speech Libraries** (for `--features tts-kokoro`): `libespeak-ng`, `libsonic`, `libpcaudio`[cite: 1]
- **Optional (GPU Acceleration):** NVIDIA CUDA Toolkit (for `candle-cuda` feature)[cite: 1]

### Feature Flags

| Feature | Default | Purpose |
|---|---|---|
| `nvml` | Yes | NVML-backed VRAM/GPU telemetry (Linux, Windows)[cite: 1] |
| `metal` | No | Metal-backed telemetry (macOS)[cite: 1] |
| `candle-cuda` | Yes | Candle/CUDA backend for Qwen LLM & DreamShaper Image Gen[cite: 1] |
| `tts-kokoro` | No | Native Kokoro-82M speech backend[cite: 1] |

### Development Commands

```bash
# Install frontend dependencies
bun install

# Frontend-only dev server (Vite @ http://localhost:5173)
bun run dev

# Launch full desktop shell (React + Tauri; runs `bun run dev` first)
bun run tauri dev

# Fast type-check of backend workspace
cargo check[cite: 1]

# Launch full desktop shell via Cargo (same effect as `bun run tauri dev`)
cargo tauri dev[cite: 1]

# Run standalone backend server with deterministic stubs (No GPU needed)
cargo run --example smoke_server[cite: 1]

# Run real multimodal pipeline (Requires CUDA + tts-kokoro)
cargo run --example real_showcase --features tts-kokoro[cite: 1]

# Run full default test suite (Stubs, zero GPU required)
cargo test[cite: 1]

# Run clippy (Zero-warning policy)
cargo clippy --all-targets[cite: 1]

# Compile production release build
cargo build --release[cite: 1]

```

The UI reaches the engine at `http://127.0.0.1:8080` by default; set `VITE_GABRIEL_API` to point the frontend elsewhere. `tauri.conf.json` wires `beforeDevCommand`/`beforeBuildCommand` to Bun and the dev server to `http://localhost:5173`.

---

## 🧪 Testing Suite

The testing suite verifies engine stability across multiple specialized isolation suites:

| Suite | File | Coverage |
| --- | --- | --- |
| **Functionality** | `tests/api_test.rs` | SSE streaming, buffered chat, base64 image PNGs, WAV output, model registry, model load/offload/unload lifecycle, `GET/PUT /v1/config` round-trip + validation + `restart_required`, telemetry snapshot, event tail, processes list, health, CORS preflight grants only frontend origins

 |
| **Stress** | `tests/stress_test.rs` | 32-way SSE token streams, mixed loads, 50 load/unload cycles, priority timing

 |
| **Failure Management** | `tests/failure_test.rs` | Disconnects, unloads during active streaming, OOM rejections & recovery, backpressure

 |
| **Bandwidth & Sharing** | `tests/bandwidth_test.rs` | EMA math, diffusion step pauses under pressure, chat stream immunity, slot pool rejections

 |
| **Security** | `tests/security_test.rs` | Malformed JSON, >2MB body caps, input length limits, parameter clamping

 |

---

## 🤝 Contributing

Pull requests are welcome! Rules to maintain engine predictability:

1. **Zero-warning policy:** `cargo clippy --all-targets` must pass without warnings.


2. **No locks across `.await`:** Parking-lot guards must be dropped before suspension points.


3. **Test-first additions:** New features or bug fixes require a corresponding test in the test suite.


4. **Typed errors:** Extend `GabrielError` in `error.rs` rather than stringifying errors.
