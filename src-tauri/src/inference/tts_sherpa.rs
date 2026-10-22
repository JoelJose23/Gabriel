use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use parking_lot::Mutex;
use sherpa_onnx::{
    GenerationConfig, OfflineTts, OfflineTtsConfig, OfflineTtsKokoroModelConfig,
    OfflineTtsModelConfig, OfflineTtsVitsModelConfig,
};

use crate::error::{GabrielError, Result};
use crate::inference::SpeechBackend;

/// Supported TTS model architectures under Sherpa-ONNX.
#[derive(Debug, Clone)]
enum SherpaModelFamily {
    /// Piper / VITS models (.onnx + tokens.txt + espeak-ng-data/)
    Vits {
        onnx_path: PathBuf,
        tokens_path: PathBuf,
        data_dir: Option<PathBuf>,
        lexicon_path: Option<PathBuf>,
    },
    /// Kokoro ONNX models (model.onnx + voices.bin + tokens.txt + espeak-ng-data/)
    Kokoro {
        onnx_path: PathBuf,
        voices_path: PathBuf,
        tokens_path: PathBuf,
        data_dir: Option<PathBuf>,
    },
}

impl SherpaModelFamily {
    fn from_dir(model_id: &str, dir: &Path) -> Result<Self> {
        if !dir.exists() {
            return Err(GabrielError::WeightLoadFailed {
                model_id: model_id.to_string(),
                detail: format!(
                    "TTS model directory not found at '{}'. Place your Sherpa-ONNX TTS model folder there.",
                    dir.display()
                ),
            });
        }

        let tokens_path = dir.join("tokens.txt");
        if !tokens_path.exists() {
            return Err(GabrielError::WeightLoadFailed {
                model_id: model_id.to_string(),
                detail: format!("missing tokens.txt in '{}'", dir.display()),
            });
        }

        let data_dir_candidate = dir.join("espeak-ng-data");
        let data_dir = data_dir_candidate.exists().then_some(data_dir_candidate);

        let onnx_path = Self::find_onnx_file(model_id, dir)?;

        // If `voices.bin` is present, this is a Kokoro ONNX checkpoint
        let voices_path = dir.join("voices.bin");
        if voices_path.exists() {
            return Ok(Self::Kokoro {
                onnx_path,
                voices_path,
                tokens_path,
                data_dir,
            });
        }

        // Otherwise treat as VITS / Piper
        let lexicon_candidate = dir.join("lexicon.txt");
        let lexicon_path = lexicon_candidate.exists().then_some(lexicon_candidate);

        Ok(Self::Vits {
            onnx_path,
            tokens_path,
            data_dir,
            lexicon_path,
        })
    }

    fn find_onnx_file(model_id: &str, dir: &Path) -> Result<PathBuf> {
        let entries = std::fs::read_dir(dir).map_err(|e| GabrielError::WeightLoadFailed {
            model_id: model_id.to_string(),
            detail: format!("failed to read directory '{}': {e}", dir.display()),
        })?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("onnx") {
                return Ok(path);
            }
        }

        Err(GabrielError::WeightLoadFailed {
            model_id: model_id.to_string(),
            detail: format!("no .onnx file found in '{}'", dir.display()),
        })
    }
}

pub struct SherpaSpeechBackend {
    model_id: String,
    tts: Arc<Mutex<OfflineTts>>,
    sample_rate: u32,
    num_speakers: i32,
}

// Safety: OfflineTts wraps a thread-safe C pointer (`SherpaOnnxOfflineTts*`)
// and all mutable access is serialized through `parking_lot::Mutex`.
unsafe impl Send for SherpaSpeechBackend {}
unsafe impl Sync for SherpaSpeechBackend {}

impl std::fmt::Debug for SherpaSpeechBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SherpaSpeechBackend")
            .field("model_id", &self.model_id)
            .field("sample_rate", &self.sample_rate)
            .field("num_speakers", &self.num_speakers)
            .finish_non_exhaustive()
    }
}

impl SherpaSpeechBackend {
    pub async fn load(model_id: String) -> Result<Self> {
        tracing::info!(model_id = %model_id, "sherpa-tts: initializing OfflineTts engine");

        let resolved_dir = Self::resolve_model_dir(&model_id)?;
        let id_clone = model_id.clone();

        tokio::task::spawn_blocking(move || Self::load_blocking(id_clone, &resolved_dir))
            .await
            .map_err(|e| GabrielError::Backend(format!("sherpa-tts init task panicked: {e}")))?
    }

    fn load_blocking(model_id: String, model_dir: &Path) -> Result<Self> {
        let family = SherpaModelFamily::from_dir(&model_id, model_dir)?;

        let model_cfg = match family {
            SherpaModelFamily::Vits {
                onnx_path,
                tokens_path,
                data_dir,
                lexicon_path,
            } => OfflineTtsModelConfig {
                vits: OfflineTtsVitsModelConfig {
                    model: Some(onnx_path.to_string_lossy().into_owned()),
                    tokens: Some(tokens_path.to_string_lossy().into_owned()),
                    data_dir: data_dir.map(|p| p.to_string_lossy().into_owned()),
                    lexicon: lexicon_path.map(|p| p.to_string_lossy().into_owned()),
                    noise_scale: 0.667,
                    noise_scale_w: 0.8,
                    length_scale: 1.0,
                    ..Default::default()
                },
                num_threads: 4,
                debug: false,
                provider: Some("cpu".to_string()),
                ..Default::default()
            },
            SherpaModelFamily::Kokoro {
                onnx_path,
                voices_path,
                tokens_path,
                data_dir,
            } => OfflineTtsModelConfig {
                kokoro: OfflineTtsKokoroModelConfig {
                    model: Some(onnx_path.to_string_lossy().into_owned()),
                    voices: Some(voices_path.to_string_lossy().into_owned()),
                    tokens: Some(tokens_path.to_string_lossy().into_owned()),
                    data_dir: data_dir.map(|p| p.to_string_lossy().into_owned()),
                    length_scale: 1.0,
                    ..Default::default()
                },
                num_threads: 4,
                debug: false,
                provider: Some("cpu".to_string()),
                ..Default::default()
            },
        };

        let config = OfflineTtsConfig {
            model: model_cfg,
            max_num_sentences: 1,
            ..Default::default()
        };

        let tts = OfflineTts::create(&config).ok_or_else(|| GabrielError::WeightLoadFailed {
            model_id: model_id.clone(),
            detail: format!(
                "sherpa-onnx failed to create OfflineTts from '{}'",
                model_dir.display()
            ),
        })?;

        let sample_rate = tts.sample_rate().max(8000) as u32;
        let num_speakers = tts.num_speakers().max(1);

        tracing::info!(
            model_id = %model_id,
            sample_rate,
            num_speakers,
            dir = %model_dir.display(),
            "sherpa-tts: model loaded successfully"
        );

        Ok(Self {
            model_id,
            tts: Arc::new(Mutex::new(tts)),
            sample_rate,
            num_speakers,
        })
    }

    /// Resolves a model ID or alias to `~/.local/share/gabriel/models/tts/<dir>`.
    fn resolve_model_dir(model_id: &str) -> Result<PathBuf> {
        let direct = PathBuf::from(model_id);
        if direct.is_dir() && direct.join("tokens.txt").exists() {
            return Ok(direct);
        }

        let base = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("gabriel")
            .join("models")
            .join("tts");

        // Exact subdirectory match: e.g. `~/.local/share/gabriel/models/tts/vits-piper-en_US-lessac-medium`
        let exact = base.join(model_id);
        if exact.is_dir() {
            return Ok(exact);
        }

        // Friendly aliases for OpenAI / Gabriel UI defaults ("tts_kokoro", "piper", "tts-1")
        let fallbacks = [
            "vits-piper-en_US-lessac-medium",
            "kokoro-en-v0_19",
            "vits-piper-en_GB-cori-high",
        ];

        for candidate in fallbacks {
            let path = base.join(candidate);
            if path.is_dir() {
                return Ok(path);
            }
        }

        // If any valid model directory exists inside `base`, pick the first one
        if let Ok(entries) = std::fs::read_dir(&base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() && path.join("tokens.txt").exists() {
                    return Ok(path);
                }
            }
        }

        Ok(exact)
    }

    /// Maps OpenAI voice names, Kokoro voice IDs, or numeric strings to speaker IDs (`sid`).
    fn map_speaker_id(&self, voice: &str) -> i32 {
        let lower = voice.trim().to_ascii_lowercase();
        let raw_sid = match lower.as_str() {
            "alloy" | "af_sarah" | "af_bella" => 0,
            "nova" | "af_sky" | "af_nicole" => 1,
            "onyx" | "am_adam" => 2,
            "shimmer" | "am_michael" => 3,
            "echo" | "bf_emma" => 4,
            "fable" | "bm_george" => 5,
            other => other.parse::<i32>().unwrap_or(0),
        };

        if self.num_speakers <= 1 {
            0
        } else {
            raw_sid.rem_euclid(self.num_speakers)
        }
    }
}

#[async_trait]
impl SpeechBackend for SherpaSpeechBackend {
    async fn synthesize(&self, text: &str, voice: &str, _force_cpu: bool) -> Result<Vec<u8>> {
        let owned_text = text.to_string();
        let sid = self.map_speaker_id(voice);
        let fallback_sr = self.sample_rate;
        let tts = Arc::clone(&self.tts);

        tokio::task::spawn_blocking(move || {
            let cfg = GenerationConfig {
                sid,
                speed: 1.0,
                silence_scale: 0.2,
                ..Default::default()
            };

            let audio = {
                let guard = tts.lock();
                guard
                    .generate_with_config(&owned_text, &cfg, None::<fn(&[f32], f32) -> bool>)
                    .ok_or_else(|| {
                        GabrielError::Backend("sherpa-onnx synthesis returned null audio".into())
                    })?
            };

            let samples = audio.samples();
            if samples.is_empty() {
                return Err(GabrielError::Backend(
                    "sherpa-onnx generated 0 audio samples".into(),
                ));
            }

            let sr = if audio.sample_rate() > 0 {
                audio.sample_rate() as u32
            } else {
                fallback_sr
            };

            Ok(pcm_f32_to_wav(samples, sr))
        })
        .await
        .map_err(|e| GabrielError::Backend(format!("sherpa-onnx worker failed: {e}")))?
    }
}

fn pcm_f32_to_wav(pcm: &[f32], sample_rate: u32) -> Vec<u8> {
    let mut wav = crate::inference::audio::WavBuilder::new(sample_rate);
    for &s in pcm {
        if s.is_nan() || s.is_infinite() {
            wav.push_sample(0);
            continue;
        }
        let clamped = s.clamp(-1.0, 1.0);
        let scaled = (clamped * 32767.0) as i16;
        wav.push_sample(scaled);
    }
    wav.finish()
}
