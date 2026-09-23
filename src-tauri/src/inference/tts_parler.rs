// tts_parler.rs
// Adaptive Device Scheduler - CPU Thread Isolation for Parler-TTS
// This module re-exports tts_candle and provides helper device routing routines.

use std::sync::{Arc, OnceLock};

use crate::error::Result;

static PARLER_CPU_POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();

// Limit CPU worker threads during CPU synthesis task
pub fn synthesize_cpu_isolated<F, R>(f: F) -> R
where
    F: FnOnce() -> R + Send,
    R: Send,
{
    let pool = PARLER_CPU_POOL.get_or_init(|| {
        rayon::ThreadPoolBuilder::new()
            .num_threads(2) // Constrain CPU tensor math to 2 cores
            .build()
            .unwrap()
    });

    pool.install(f)
}

// Re-export the real backend for convenience when feature is enabled
#[cfg(feature = "tts-parler")]
pub use crate::inference::tts_candle::CandleSpeechBackend;

/// Helper that routes synthesis based on available VRAM budget.
pub async fn synthesize_with_device_routing(
    backend: Arc<dyn crate::inference::SpeechBackend>,
    text: String,
    voice: String,
    cpu_fallback: bool,
) -> Result<Vec<u8>> {
    backend.synthesize(&text, &voice, cpu_fallback).await
}