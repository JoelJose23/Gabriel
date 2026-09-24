# Gabriel

A native, zero-crash, multi-modal **local AI engine** written in Rust. Gabriel runs
OpenAI-compatible inference entirely on your machine — no cloud, no telemetry — with a
hardware-aware resource governor that structurally prevents CUDA out-of-memory crashes and manages memory bandwidth consumption across diverse workloads.
impossible.

It is designed as the backend for a Tauri v2 + React desktop app, but the HTTP surface is
standard OpenAI REST, so any OpenAI SDK, LangChain pipeline, or `curl` can drive it.

Real-weight backends are wired in: **Qwen2.5-3B-Instruct (GGUF, LLM)**,
**DreamShaper-8-LCM (4-step diffusion, images)**, and **Kokoro-82M (TTS)**.
Without the `candle-cuda` / `tts-kokoro` features the engine runs on deterministic
stub backends so the full default test suite passes with no GPU.

---

## What it does

| Capability | Detail |
|---|---|
| LLM chat streaming | `POST /v1/chat/completions` with SSE token streaming (OpenAI chunk protocol incl. `[DONE]`) or buffered JSON. Real: Qwen2.5-3B-Instruct Q4_K_M via Candle (`qwen2.5-3b-instruct`, ~1.9 GB) |
| Image generation | `POST /v1/images/generations`, task-queued, base64 **PNG** responses. Real: DreamShaper-8-LCM, 4-step LCM default (max 8), CFG 1.5 default (max 2.0), swappable LCM/DDIM/Euler-Ancestral schedulers (`inference/image/scheduler.rs`) |
| Speech synthesis | `POST /v1/audio/speech`, streams a valid PCM WAV (stub: 22 050 Hz; real Kokoro-82M backend: 24 000 Hz). Voice map: `alloy`→`am_adam`, `nova`→`af_sarah` (default), `onyx`→`am_michael`, `shimmer`→`af_sky`, plus `af_/am_/bf_` passthrough |
| Model registry | `GET /v1/models` reports every loaded model with residency and VRAM status |
| VRAM pager | Automatically demotes idle models GPU -> RAM when usage crosses a high watermark; promotes on demand. When GPU VRAM is untracked (0 bytes reported) the budget check is bypassed and the engine keeps running |
| Memory-bandwidth governor | Smooths NVML memory-controller utilization and inserts backoff into background diffusion steps when the bus runs hot; interactive chat is never throttled |
| Priority scheduler | Interactive jobs (priority `-1`) strictly preempt background diffusion jobs (priority `0`) via biased channel select |
| Slot pool | Count-based `max_loaded_models` cap with deterministic LRU eviction — saturated pools reject instead of thrashing residents (inspired by Lemonade's residency model). Models with in-flight jobs are pinned and never selected for eviction (`JobGuard` RAII) |
| Telemetry | Live GPU name/utilisation, VRAM budget ledger, RAM, CPU, per-model idle times |
| Tauri IPC | Strongly typed commands: `load_model`, `unload_model`, `offload_model`, `get_telemetry`, `list_loaded_models` |

## Core Guarantees & Advancements

Every model carries a VRAM budget. Before anything touches the GPU, the memory pager:

1. Reads real utilisation from NVML (Linux/Windows) or Metal (macOS).
2. Refuses admission if the projected footprint would cross the high watermark
   (default **85 %** of total VRAM) — returning a typed `VramExhausted` error instead of
   letting CUDA OOM kill the process.
3. Evicts least-recently-used idle models to CPU when pressure builds, restoring them
   transparently on the next request.

The engine degrades gracefully: if no GPU monitor exists (VRAM total reports 0),
admission control is skipped and the engine keeps running in software mode.

Three hardening fixes beyond the original design:

- **Active-job pinning** — a `JobGuard` RAII increments `Registry::active_jobs` for the
  model on job start and decrements on drop; all LRU selectors (`least_recently_used_resident`,
  `least_recently_used_any_idle`, idle-sweep) skip entries with `active_jobs > 0`, so a long
  SSE stream or 4-step diffusion run can never be paged out from under itself.
- **Execute-time revalidation** — `EngineState::execute` (moved off `EngineInner` so it can
  call `ensure_ready`) re-checks residency immediately before each chat/image/speech job, closing
  the race where a job queued during an LRU sweep would run against an evicted handle.
- **No double-counting** — `load_model` reconciles the measured CUDA allocation delta
  (`admit(measured - spec)` / refund) instead of calling `pager.on_promoted()` on top of the
  already-charged budget.

### Memory-bandwidth sharing

VRAM capacity is only half of the story: concurrent workloads also fight over the
memory bus, which manifests as wall-clock throttling even when capacity is fine. The
`BandwidthGovernor` (`core/bandwidth.rs`) closes that gap:

1. A sampler task feeds NVML's memory-controller utilization (`utilization_rates().memory`)
   into an exponential moving average every pager tick, so single spikes cannot trigger
   backoff.
2. Utilization above the configurable ceiling (default **80 %**) produces a normalized
   `pressure` value (0..=1), exposed as `bandwidth_pressure` in `get_telemetry`.
3. Background diffusion consults `standard_yield()` between denoising steps and sleeps
   proportionally (up to `max_bandwidth_yield`, default 250 ms per step).
4. **Interactive traffic never consults the governor** — chat token streams are exempt
   by construction, not by best effort. This is enforced in tests.

Slot pools follow the same philosophy as [Lemonade](https://github.com/lemonade-sdk/lemonade)'s
residency manager: at most `max_loaded_models` registrations exist at once, a saturated
pool deterministically rejects newcomers with `slot_pool_exhausted` rather than evicting
warm residents, and only genuinely idle LRU entries are evicted to make room.

## Architecture

```
React UI (Tauri WebView)
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
```

### Module map

```
src-tauri/src/
├── lib.rs               Tauri builder wiring: manage state, spawn server, register commands
├── error.rs             GabrielError — one enum, both IPC (serde) and HTTP (status mapping)
├── types/
│   ├── openai.rs        Request/response DTOs mirroring the OpenAI wire format
│   ├── ipc.rs           ModelSpec, ModelStatus, Residency, TelemetrySnapshot
│   └── jobs.rs          Job envelope, Priority, ChatEvent, GenParams
├── core/
│   ├── engine.rs        EngineState: orchestration, admission, job execution (+JobGuard pinning,
│   │                    execute-time ensure_ready, measured-delta VRAM reconcile)
│   ├── scheduler.rs     Two-lane mpsc queues + dispatcher (tokio::select! biased)
│   ├── pager.rs         MemoryPager: admit(), maintenance pass, VRAM ledger
│   │                    (bypasses budget when GPU VRAM is untracked)
│   ├── bandwidth.rs     BandwidthGovernor: EMA of NVML memory-controller utilization
│   └── registry.rs      Model residency table with LRU tracking + active_jobs pins
├── inference/
│   ├── mod.rs           Backend traits + BackendFactory (routes dreamshaper/lykon/lcm,
│   │                    kokoro, .gguf/.safetensors ids to real backends)
│   ├── hub.rs           HuggingFace pull helpers + gpu_used_bytes(); repos: Qwen2.5-3B GGUF,
│   │                    DreamShaper-8-LCM (+base fallback), Kokoro-82M;
│   │                    legacy SdTurboFiles/SdV15Files preserved but unused
│   ├── image/
│   │   ├── mod.rs       Module root (weights / scheduler / pipeline split for future SDXL/Flux)
│   │   ├── dreamshaper.rs DreamShaperBackend + ImageGenParams: CLIP+UNet+VAE, sliced attention,
│   │   │                tiled GPU VAE decode (256px tiles) with CPU-VAE fallback, CUDA mem profiler
│   │   └── scheduler.rs Swappable schedulers: Lcm (default, DDIM 4-step) · EulerAncestral · Ddim
│   ├── image_candle.rs  Back-compat shim: CandleImageBackend aliases DreamShaperBackend;
│   │                    legacy "sd-turbo" ids route to DreamShaper weights
│   ├── candle_backend.rs Candle Qwen2.5-3B GGUF text backend (CUDA, measured VRAM delta)
│   ├── tts_kokoro.rs    KokoroSpeechBackend (native kokoro-tiny, 24 kHz WAV, voice map)
│   ├── tts_candle.rs    Legacy Parler-TTS backend — retained in tree, no longer wired to factory
│   ├── tts_parler.rs    CPU-isolation helper (shared rayon pool) + re-export shim
│   ├── audio.rs         WavBuilder + SAMPLE_RATE_HZ (22 050 Hz stub constant)
│   ├── image_codec.rs   BMP encoder, HSV gradient renderer (stub image path)
│   └── stub.rs          Deterministic stub engines used by tests/dev
├── api/
│   ├── router.rs        Axum routing table
│   └── routes/          chat.rs (SSE) · images.rs · speech.rs · models_list.rs · health.rs
├── telemetry/
│   ├── gpu.rs           NVML / Metal / fallback monitors behind one trait
│   └── sys.rs           sysinfo-based RAM/CPU sampler
├── ipc/commands.rs      #[tauri::command] handlers
└── bin/diag.rs          VRAM ledger diagnostic (load LLM → image → tts_kokoro, print snapshots)
```

Examples: `examples/smoke_server.rs` (three stub models on 127.0.0.1:8080),
`examples/real_showcase.rs` (real Qwen + DreamShaper + Kokoro concurrent pipeline, see below),
`examples/verify_multimodal.rs` (stub three-way concurrency + ledger checks).

## Real weights

| Modality | Model id | Source repo | Notes |
|---|---|---|---|
| LLM | `qwen2.5-3b-instruct` | `Qwen/Qwen2.5-3B-Instruct-GGUF` (`qwen2.5-3b-instruct-q4_k_m.gguf`) + `Qwen/Qwen2.5-3B-Instruct` tokenizer | Candle GGUF on CUDA, VRAM delta measured via `gpu_used_bytes()` |
| Image | `dreamshaper-8` (also accepts legacy `sd-turbo`) | `Lykon/dreamshaper-8-lcm` (fallback `Lykon/dreamshaper-8`) | SD 1.5 layout, FP16 UNet on GPU + CLIP/VAE on CPU, ~2.1 GB estimate, tiled VAE, 4-step LCM |
| Speech | `tts_kokoro` | `kokoro/kokoro-82m` via `kokoro-tiny` | Native (non-Candle) engine, 24 kHz WAV |

End-to-end proof (requires CUDA + `--features tts-kokoro`):

```bash
cargo run --example real_showcase --features tts-kokoro
# loads all three models concurrently, streams LLM tokens, pipes the LLM text
# into Kokoro, runs DreamShaper in the background; asserts no stub text leaks,
# PNG magic on the image and RIFF on the audio; writes /tmp/gabriel_showcase.png
# and /tmp/gabriel_showcase.wav
```

Checked-in sample outputs from a real run live at the repo root:
`showcase_output.png` (archangel image) and `showcase_output.wav`.

`GABRIEL_IMAGE_CPU_DECODE=1` forces the slow CPU VAE path for debugging the image backend.

## API reference

All endpoints accept and return OpenAI-compatible JSON. Errors use the standard
`{"error": {"message", "type", "code"}}` envelope with correct HTTP status codes
(404 unknown model, 409 double-load, 413 oversized body, 507 VRAM exhausted...).

```bash
# chat (streaming)
curl -N http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"m","messages":[{"role":"user","content":"hi"}],"stream":true}'

# images
curl http://127.0.0.1:8080/v1/images/generations \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"a neon skyline","size":"512x512"}'

# speech (returns WAV bytes)
curl http://127.0.0.1:8080/v1/audio/speech \
  -H 'Content-Type: application/json' \
  -d '{"model":"tts","input":"Gabriel online","voice":"nova"}' -o out.wav

# registry
curl http://127.0.0.1:8080/v1/models
```

## Building

### Prerequisites

- Rust 1.85+ (`rustup update stable`)
- Tauri v2 system dependencies:
  - Linux: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - macOS: Xcode Command Line Tools
  - Windows: WebView2 + MSVC Build Tools
- For `--features tts-kokoro`: system speech libs `libespeak-ng`, `libsonic`, `libpcaudio`
  (pre-wired in `.cargo/config.toml` via `rustflags = ["-L", "/usr/lib", "-l", "espeak-ng", "-l", "sonic", "-l", "pcaudio"]`).
- Optional (real GPU inference): NVIDIA CUDA toolkit for the `candle-cuda` feature.
  Everything else compiles and runs without CUDA. The workspace pins `CUDARC_CUDA_VERSION=13000`
  and patches `cudarc` to `patches/cudarc` for CUDA 13.0-compatible bindings.

### Commands

```bash
git clone <repo> && cd Gabriel

cargo check              # fast type-check of the whole workspace
cargo run --example smoke_server
                         # boots the engine + REST API on 127.0.0.1:8080 with three stub models
cargo run --example real_showcase --features tts-kokoro
                         # real weights: Qwen2.5-3B + DreamShaper-8-LCM + Kokoro-82M
cargo run --example verify_multimodal
                         # stub three-way concurrency + VRAM ledger checks
cargo run --bin diag     # quick load-and-print VRAM ledger diagnostic
cargo test               # default-feature suite (stubs, no GPU required)
cargo test --features tts-kokoro -- --ignored
                         # + ignored real-weight tests (downloads ~GBs, slow)
cargo clippy --all-targets   # must stay warning-free
cargo tauri dev          # full desktop shell (needs a frontend at ../dist or tauri.conf.json update)
cargo build --release    # optimized binary (LTO + strip enabled)
```

CI (`.github/workflows/rust.yml`) runs `cargo build` + `cargo test` on push/PR to `main`.

### Feature flags

| Feature | Default | Purpose |
|---|---|---|
| `nvml` | yes | NVML-backed VRAM/GPU telemetry (Linux, Windows) |
| `metal` | no | Metal-backed telemetry (macOS) |
| `candle-cuda` | yes | Candle/CUDA weight path: Qwen GGUF (`inference/candle_backend.rs`) + DreamShaper (`inference/image/`) |
| `tts-kokoro` | no | Native Kokoro-82M speech backend (`inference/tts_kokoro.rs` via `kokoro-tiny`) |

Candle dependencies are pinned to crates.io `0.8` (`cuda` enabled). The old
`tts-parler` feature and its Parler-TTS wiring are retired: `tts_candle.rs` remains in
tree unwired and `tts_parler.rs` is a CPU-isolation helper shim.

## Testing

The suite is split by concern so failures are immediately diagnosable:

| Suite | File | Covers |
|---|---|---|
| Functionality | `tests/api_test.rs` | SSE streaming, buffered chat, image b64 output, WAV output, registry |
| Stress | `tests/stress_test.rs` | 32-way concurrent SSE storm, mixed-modality load, 50 load/unload cycles, 100 sequential requests, interactive-priority preemption timing |
| Failure management | `tests/failure_test.rs` | Client disconnect mid-stream, unload during active stream, pager-offloaded model errors, oversized VRAM rejection + recovery, queue backpressure rejection, typed error slugs |
| Bandwidth & sharing | `tests/bandwidth_test.rs` | Governor EMA/backoff math, diffusion slowdown under bus pressure vs. unpressured baseline, interactive-lane immunity under saturation, slot-pool deterministic rejection + LRU eviction |
| Security | `tests/security_test.rs` | Malformed JSON, wrong content-type, >2 MB body limit, prompt/input length caps, parameter clamping, invalid dimensions, SSE JSON well-formedness |
| Real LLM/Image (ignored) | `tests/inference_real_test.rs` · `tests/image_real_test.rs` | `candle-cuda` only: real Qwen / DreamShaper downloads + generation |
| Real TTS (ignored) | `tests/tts_real_test.rs` | `tts-kokoro` only: Kokoro-82M WAV synthesis |
| Real concurrency (ignored) | `tests/multimodal_concurrency_test.rs` | `candle-cuda` + `tts-kokoro`: three-way Qwen + DreamShaper + Kokoro under VRAM pressure |

```bash
cargo test                                  # everything (default features, stubs)
cargo test --test stress_test               # one category
cargo test --test security_test -- --nocapture
cargo test --features tts-kokoro -- --ignored   # real-weight ignored tests
```

Bugs the suite has already caught and fixed:

- SSE streams never emitted the OpenAI `[DONE]` terminator (found by the 32-stream storm).
- Systems without a GPU monitor could never load a model (pager computed a 0-byte budget).
- Concurrent loads of the same model id could race past the registry check (now serialized
  by an internal gate).
- Admission control double-counted engine-resident bytes against the VRAM cap.
- LRU sweeps could evict a model with in-flight jobs (fixed by `JobGuard` active-job pins).
- Jobs queued during an LRU sweep ran against evicted handles (fixed by execute-time `ensure_ready`).
- TTS telemetry on non-CUDA platforms reported resident bytes as free budget (fixed routing log).

## Configuration

Defaults live in `core::EngineConfig` and can be tuned before constructing the engine:

```rust
EngineConfig {
    host: "127.0.0.1".into(),
    port: 8080,
    vram_high_watermark: 0.85,   // refuse/offload above this fraction of total VRAM
    vram_low_watermark: 0.70,    // pager evicts until usage drops below this
    idle_offload_after: 120 s,   // models idle this long are first to be paged out
    pager_poll_interval: 2 s,
    queue_capacity: 256,         // per scheduler lane
    max_concurrent_image_jobs: 4,
    auto_load_on_request: false, // if true, requests may transparently cold-start models
    bandwidth_ceiling_percent: 80.0, // memory-bus utilization where background jobs yield
    max_bandwidth_yield: 250 ms, // per-step pause at full pressure
    max_loaded_models: 4,        // registration slot pool (Lemonade-style residency cap)
}
```

## Contributing

Pull requests welcome. House rules that keep the engine predictable:

1. **Zero-warning policy** — `cargo clippy --all-targets` must be clean before review.
2. **No lock across `.await`** — parking-lot guards are dropped before awaiting; the
   existing code never holds one across a suspension point, keep it that way.
3. **New behaviour needs a failing test first** — add it to the matching suite above;
   cross-cutting failure modes belong in `failure_test.rs`.
4. **Errors are typed** — extend `GabrielError` rather than stringifying; every variant
   gets a slug and an HTTP status mapping in `error.rs`.
5. **Stub parity** — anything the stub engines demonstrate (streaming, WAV/BMP output)
   must keep working; they are the contract the test suite verifies against.

### Adding a real model backend

1. Implement `TextBackend` / `ImageBackend` / `SpeechBackend` from `inference/mod.rs`.
2. Register it in `BackendFactory::create` (LLM via `inference/candle_backend.rs`, image via
   `inference/image/dreamshaper.rs`, speech via `inference/tts_kokoro.rs`). Image schedulers
   live in `inference/image/scheduler.rs` so UNet/VAE code never changes on a scheduler swap;
   SD-Turbo weight structs in `inference/hub.rs` are preserved for a future re-enable.
3. Add a functionality test that loads your model id through
   `EngineState::load_model` and exercises the matching HTTP route (see the ignored
   `*_real_test.rs` suites for the pattern; gate yours with the matching `cfg(feature)`).

### Debugging tips

- `RUST_LOG=debug cargo run --example smoke_server` shows every scheduler dequeue,
  pager eviction, and job completion.
- `GABRIEL_IMAGE_CPU_DECODE=1` forces CPU VAE decode; DreamShaper logs `[CUDA PROFILE]`
  checkpoints with per-stage VRAM deltas either way.
- `/health` returns `200` once the Axum task is serving.
- `get_telemetry` (IPC) or `GET /v1/models` expose the full residency picture at runtime.
