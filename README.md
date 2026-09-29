# Gabriel – Local AI Studio & Engine

Gabriel is a native, zero-crash, multimodal **local AI desktop application** and **inference engine** written in Rust. It serves as a desktop app powered by a React + Tauri v2 frontend ("Aurora Glass" UI) and a bare-metal Rust core running on Hugging Face Candle. Gabriel provides OpenAI-compatible inference entirely on your local machine with zero telemetry, zero cloud dependencies, and a hardware-aware resource governor that structurally prevents CUDA out-of-memory (OOM) crashes.

It runs both as a desktop app and as a headless server exposing standard OpenAI REST endpoints (`/v1/chat/completions`, `/v1/images/generations`, `/v1/audio/speech`), allowing any OpenAI SDK, LangChain pipeline, or `curl` script to drive it.

---

## 🎨 Studio UI & Design System

The frontend is built with a bespoke **"Aurora Glass"** design system inspired by modern macOS, visionOS, and Linear:

* **Soft Matte Glass:** Heavy background blurs (`blur-40px`, `saturate-150%`), sheer surfaces, and light-catching borders.
* **Dynamic Aurora Motion:** Subtle ambient gradients inside sidebars, popups, and active chat surfaces.
* **Typography:** Driven by **DM Sans** for a modern geometric hierarchy.
* **True Dual Themes:**
* *Light Mode:* Translucent off-white glass with gray borders and soft pastel aurora accents.
* *Dark Mode:* Deep charcoal base (`#0a0a0a`), vibrant accent colors, and dark glass surfaces.



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
| **Live Telemetry & IPC** | Real-time monitoring of CPU, GPU, RAM, VRAM budget ledgers, and per-model idle times via NVML/sysinfo and strongly typed Tauri IPC commands.

 |

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
└───────────────────────────────────────────────────────────────────────┘
```[cite: 1]

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
│   └── registry.rs      Model residency table with LRU tracking + active_jobs pins
├── inference/
│   ├── mod.rs           Backend traits + BackendFactory
│   ├── hub.rs           HuggingFace pull helpers + GPU memory tracking
│   ├── image/           DreamShaper backend, tiled GPU VAE decode, swappable schedulers
│   ├── candle_backend.rs Candle Qwen2.5-3B GGUF text backend (CUDA)
│   ├── tts_kokoro.rs    KokoroSpeechBackend (native kokoro-tiny, 24 kHz WAV)
│   └── stub.rs          Deterministic stub engines used by tests/dev
├── api/
│   ├── router.rs        Axum routing table
│   └── routes/          chat.rs (SSE) · images.rs · speech.rs · models_list.rs · health.rs
├── telemetry/
│   ├── gpu.rs           NVML / Metal / fallback monitors
│   └── sys.rs           sysinfo-based RAM/CPU sampler
└── ipc/commands.rs      #[tauri::command] handlers

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
```[cite: 1]

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

---

## 🚀 Building & Running

### Prerequisites
- **Node.js** (v18+) & **pnpm** (for desktop UI)
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
pnpm install

# Fast type-check of backend workspace
cargo check[cite: 1]

# Launch full desktop shell (React + Tauri)
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

---

## 🧪 Testing Suite

The testing suite verifies engine stability across multiple specialized isolation suites:

| Suite | File | Coverage |
| --- | --- | --- |
| **Functionality** | `tests/api_test.rs` | SSE streaming, buffered chat, base64 image PNGs, WAV output, model registry

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
