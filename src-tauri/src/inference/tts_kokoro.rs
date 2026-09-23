use std::sync::Arc;
use std::sync::Mutex;
use async_trait::async_trait;
use kokoro_tiny::TtsEngine;

use crate::error::{GabrielError, Result};
use crate::inference::SpeechBackend;

pub struct KokoroSpeechBackend {
    model_id: String,
    tts: Arc<Mutex<TtsEngine>>,
}

impl std::fmt::Debug for KokoroSpeechBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KokoroSpeechBackend")
            .field("model_id", &self.model_id)
            .finish_non_exhaustive()
    }
}

/// Map generic voice identifiers to Kokoro 82M default voices
fn map_voice_name(voice: &str) -> String {
    let lower = voice.to_ascii_lowercase();
    match lower.as_str() {
        "alloy" => "am_adam".to_string(),
        "nova" => "af_sarah".to_string(),
        "onyx" => "am_michael".to_string(),
        "shimmer" => "af_sky".to_string(),
        other if other.starts_with("af_") || other.starts_with("am_") || other.starts_with("bf_") => other.to_string(),
        _ => "af_sarah".to_string(),
    }
}

impl KokoroSpeechBackend {
    pub async fn load(model_id: String) -> Result<Self> {
        tracing::info!("kokoro-tts: initializing native Kokoro-82M engine");

        let tts = tokio::task::spawn(async move {
            TtsEngine::new().await.map_err(|e| GabrielError::WeightLoadFailed {
                model_id: "kokoro-82m".into(),
                detail: format!("{e}"),
            })
        })
        .await
        .map_err(|_| GabrielError::Backend("Kokoro initialization task panicked".into()))??;

        tracing::info!("kokoro-tts: model loaded successfully");

        Ok(Self {
            model_id,
            tts: Arc::new(Mutex::new(tts)),
        })
    }

    fn synthesize_blocking(tts: &mut TtsEngine, text: &str, voice: &str) -> Result<Vec<u8>> {
        let kokoro_voice = map_voice_name(voice);

        let samples = tts
            .synthesize(text, Some(&kokoro_voice))
            .map_err(|e| GabrielError::Backend(format!("Kokoro synthesis failed: {e}")))?;

        let sample_rate = 24000;
        let wav_bytes = pcm_f32_to_wav(&samples, sample_rate);
        Ok(wav_bytes)
    }
}

#[async_trait]
impl SpeechBackend for KokoroSpeechBackend {
    async fn synthesize(&self, text: &str, voice: &str, _force_cpu: bool) -> Result<Vec<u8>> {
        let owned_text = text.to_string();
        let owned_voice = voice.to_string();
        let tts = self.tts.clone();

        tokio::task::spawn_blocking(move || {
            let mut tts = tts.lock().unwrap();
            Self::synthesize_blocking(&mut tts, &owned_text, &owned_voice)
        })
        .await
        .map_err(|_| GabrielError::Backend("Kokoro synthesis worker failed".into()))?
    }
}

/// Helper function to encapsulate raw f32 PCM into a standard WAV container
fn pcm_f32_to_wav(pcm: &[f32], sample_rate: u32) -> Vec<u8> {
    let mut wav = crate::inference::audio::WavBuilder::new(sample_rate);
    for &s in pcm {
        let clamped = s.clamp(-1.0, 1.0);
        wav.push_sample((clamped * i16::MAX as f32) as i16);
    }
    wav.finish()
}