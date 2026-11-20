use std::path::PathBuf;

use crate::error::{GabrielError, Result};

pub const QWEN_GGUF_REPO: &str = "Qwen/Qwen2.5-3B-Instruct-GGUF";
pub const QWEN_GGUF_FILE: &str = "qwen2.5-3b-instruct-q4_k_m.gguf";
pub const QWEN_TOKENIZER_REPO: &str = "Qwen/Qwen2.5-3B-Instruct";
#[allow(dead_code)]
pub const SD15_REPO: &str = "stable-diffusion-v1-5/stable-diffusion-v1-5";
#[allow(dead_code)]
pub const SD15_CLIP_TOKENIZER_REPO: &str = "openai/clip-vit-base-patch32";
/// SD 2.x / SD-Turbo ships with CLIP ViT-L/14 tokenizer (49408 vocab)
pub const SD2_CLIP_TOKENIZER_REPO: &str = "openai/clip-vit-large-patch14";
/// Legacy SD-Turbo repo. Preserved (not deleted) for a future re-enable;
/// the active image backend no longer pulls from here.
#[allow(dead_code)]
pub const SD_TURBO_REPO: &str = "stabilityai/sd-turbo";
/// DreamShaper 8 LCM (SD 1.5 architecture, LCM-distilled for 4-8 step synthesis).
/// Stylistic/general-purpose upgrade over SD-Turbo with the same ~2 GB FP16 footprint.
pub const DREAMSHAPER_8_LCM_REPO: &str = "Lykon/dreamshaper-8-lcm";
/// Fallback: base DreamShaper 8 (non-LCM) weights, same layout.
pub const DREAMSHAPER_8_REPO: &str = "Lykon/dreamshaper-8";

/// A GGUF text-model preset the candle backend can serve.
///
/// Every entry is a Qwen2-architecture GGUF, because
/// [`crate::inference::candle_backend`] loads through candle's
/// `quantized_qwen2` weights, so the catalogue never offers text weights this
/// build cannot actually run.
pub struct GgufPreset {
    /// Id the UI / API refers to the model by.
    pub id: &'static str,
    pub repo: &'static str,
    pub file: &'static str,
    /// Repo holding `tokenizer.json` for this model.
    pub tokenizer_repo: &'static str,
}

/// Text presets, smallest first (the order the install panel lists them in).
pub const GGUF_PRESETS: &[GgufPreset] = &[
    GgufPreset {
        id: "qwen2.5-0.5b-instruct",
        repo: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        tokenizer_repo: "Qwen/Qwen2.5-0.5B-Instruct",
    },
    GgufPreset {
        id: "qwen2.5-1.5b-instruct",
        repo: "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        file: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        tokenizer_repo: "Qwen/Qwen2.5-1.5B-Instruct",
    },
    GgufPreset {
        id: "qwen2.5-3b-instruct",
        repo: QWEN_GGUF_REPO,
        file: QWEN_GGUF_FILE,
        tokenizer_repo: QWEN_TOKENIZER_REPO,
    },
    // Q4_K_M for 7B ships split across two files, which the single-file GGUF
    // reader cannot open; Q3_K_M is the largest single-file quant of this repo.
    GgufPreset {
        id: "qwen2.5-7b-instruct",
        repo: "Qwen/Qwen2.5-7B-Instruct-GGUF",
        file: "qwen2.5-7b-instruct-q3_k_m.gguf",
        tokenizer_repo: "Qwen/Qwen2.5-7B-Instruct",
    },
];

/// The preset used when a text model id matches no entry (the id Gabriel has
/// always shipped as its default chat model).
pub fn default_gguf_preset() -> &'static GgufPreset {
    GGUF_PRESETS
        .iter()
        .find(|p| p.id == "qwen2.5-3b-instruct")
        .unwrap_or(&GGUF_PRESETS[0])
}

/// Resolves a model id to a text preset: exact id / repo match wins, otherwise
/// the longest preset id contained in `model_id` (so
/// `qwen2.5-3b-instruct-test` and `Qwen/Qwen2.5-3B-Instruct-GGUF` both resolve).
pub fn gguf_preset(model_id: &str) -> Option<&'static GgufPreset> {
    let lower = model_id.to_ascii_lowercase();
    GGUF_PRESETS
        .iter()
        .filter(|p| {
            lower == p.id || lower == p.repo.to_ascii_lowercase() || lower.contains(p.id)
        })
        .max_by_key(|p| p.id.len())
}

/// An SD 1.5-layout image checkpoint (safetensors UNet + VAE + CLIP).
pub struct ImagePreset {
    pub id: &'static str,
    pub repo: &'static str,
    /// LCM-distilled checkpoints run at 4-8 steps with a low guidance scale;
    /// the others need the higher-step DDIM defaults.
    pub lcm: bool,
}

pub const IMAGE_PRESETS: &[ImagePreset] = &[
    ImagePreset {
        id: "dreamshaper-8-lcm",
        repo: DREAMSHAPER_8_LCM_REPO,
        lcm: true,
    },
    ImagePreset {
        id: "dreamshaper-8",
        repo: DREAMSHAPER_8_REPO,
        lcm: false,
    },
    ImagePreset {
        id: "stable-diffusion-v1-5",
        repo: SD15_REPO,
        lcm: false,
    },
];

/// Resolves an image model id to a preset (longest id contained wins, so
/// `dreamshaper-8-lcm` is not shadowed by `dreamshaper-8`).
///
/// Legacy ids such as `sd-turbo-*` intentionally match nothing: they keep
/// resolving to the DreamShaper weights they have always loaded.
pub fn image_preset(model_id: &str) -> Option<&'static ImagePreset> {
    let lower = model_id.to_ascii_lowercase();
    IMAGE_PRESETS
        .iter()
        .filter(|p| {
            lower == p.id || lower == p.repo.to_ascii_lowercase() || lower.contains(p.id)
        })
        .max_by_key(|p| p.id.len())
}

/// Weights bundle for an image model id, falling back to the default
/// DreamShaper-8-LCM pull (with its base DreamShaper-8 fallback) for ids that
/// match no preset.
pub fn dreamshaper_files_for(model_id: &str) -> Result<DreamShaperFiles> {
    match image_preset(model_id) {
        // The default preset keeps its base-DreamShaper-8 fallback.
        Some(p) if p.repo == DREAMSHAPER_8_LCM_REPO => DreamShaperFiles::pull(),
        Some(p) => DreamShaperFiles::pull_from_repo(p.repo),
        None => DreamShaperFiles::pull(),
    }
}

/// HuggingFace hub cache root (`HF_HOME/hub`, else the platform cache dir).
/// HuggingFace hub cache root (`HF_HOME/hub`, else the platform cache dir).
pub fn hf_cache_dir() -> Option<PathBuf> {
    if let Ok(home) = std::env::var("HF_HOME") {
        return Some(PathBuf::from(home).join("hub"));
    }
    dirs::cache_dir().map(|d| d.join("huggingface").join("hub"))
}

/// True when `filename` of `repo` is already present in the local HF cache,
/// i.e. the loader will not hit the network for it.
pub fn is_file_cached(repo: &str, filename: &str) -> bool {
    let Some(cache) = hf_cache_dir() else {
        return false;
    };
    let folder = format!("models--{}", repo.replace('/', "--"));
    let snapshots = cache.join(folder).join("snapshots");
    let Ok(revisions) = std::fs::read_dir(&snapshots) else {
        return false;
    };
    revisions.flatten().any(|rev| {
        let path = rev.path().join(filename);
        std::fs::metadata(&path).map(|m| m.is_file()).unwrap_or(false)
    })
}

pub fn pull_file(repo: &str, filename: &str) -> Result<PathBuf> {
    let api = hf_hub::api::sync::Api::new().map_err(|_| GabrielError::DownloadFailed {
        repo: repo.to_string(),
        filename: filename.to_string(),
    })?;
    api.model(repo.to_string())
        .get(filename)
        .map_err(|_| GabrielError::DownloadFailed {
            repo: repo.to_string(),
            filename: filename.to_string(),
        })
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SdV15Files {
    pub unet: PathBuf,
    pub vae: PathBuf,
    pub clip: PathBuf,
    pub tokenizer: PathBuf,
}

impl SdV15Files {
    #[allow(dead_code)]
    pub fn pull() -> Result<Self> {
        Ok(Self {
            unet: pull_file(SD15_REPO, "unet/diffusion_pytorch_model.fp16.safetensors")?,
            vae: pull_file(SD15_REPO, "vae/diffusion_pytorch_model.fp16.safetensors")?,
            clip: pull_file(SD15_REPO, "text_encoder/model.fp16.safetensors")?,
            tokenizer: pull_file(SD15_CLIP_TOKENIZER_REPO, "tokenizer.json")?,
        })
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SdTurboFiles {
    pub unet: PathBuf,
    pub vae: PathBuf,
    pub clip: PathBuf,
    pub tokenizer: PathBuf,
}

impl SdTurboFiles {
    #[allow(dead_code)]
    pub fn pull() -> Result<Self> {
        tracing::info!("fetching SD-turbo fp16 components from HuggingFace Hub");
        Ok(Self {
            unet: pull_file(
                SD_TURBO_REPO,
                "unet/diffusion_pytorch_model.fp16.safetensors",
            )?,
            vae: pull_file(
                SD_TURBO_REPO,
                "vae/diffusion_pytorch_model.fp16.safetensors",
            )?,
            clip: pull_file(SD_TURBO_REPO, "text_encoder/model.fp16.safetensors")?,
            // SD-Turbo is based on SD 2.1; use the ViT-L/14 tokenizer (matches the CLIP weights)
            tokenizer: pull_file(SD2_CLIP_TOKENIZER_REPO, "tokenizer.json")?,
        })
    }
}

/// DreamShaper 8 LCM weight bundle (SD 1.5 layout, safetensors).
///
/// NOTE: `SdTurboFiles` above is intentionally preserved (not deleted) so the
/// SD-Turbo backend can be re-enabled in the future. New code paths pull
/// DreamShaper weights via this struct instead.
#[derive(Debug, Clone)]
pub struct DreamShaperFiles {
    pub unet: PathBuf,
    pub vae: PathBuf,
    pub clip: PathBuf,
    pub tokenizer: PathBuf,
}

impl DreamShaperFiles {
    pub fn pull() -> Result<Self> {
        tracing::info!(
            repo = DREAMSHAPER_8_LCM_REPO,
            "fetching DreamShaper-8-LCM fp16 components from HuggingFace Hub"
        );
        match Self::pull_from_repo(DREAMSHAPER_8_LCM_REPO) {
            Ok(f) => Ok(f),
            Err(e) => {
                tracing::warn!(error = %e, repo = DREAMSHAPER_8_REPO, "LCM repo pull failed, trying base DreamShaper-8");
                Self::pull_from_repo(DREAMSHAPER_8_REPO)
            }
        }
    }

    /// Pulls the SD 1.5-layout components of an explicit repo (fp16 files when
    /// the repo ships them, full precision otherwise).
    pub fn pull_from_repo(repo: &str) -> Result<Self> {
        Ok(Self {
            // LCM repo ships full SD1.5-layout safetensors; prefer fp16 variants,
            // fall back to full-precision files which we cast to F16 on load.
            unet: Self::pull_first(repo, &[
                "unet/diffusion_pytorch_model.fp16.safetensors",
                "unet/diffusion_pytorch_model.safetensors",
            ])?,
            vae: Self::pull_first(repo, &[
                "vae/diffusion_pytorch_model.fp16.safetensors",
                "vae/diffusion_pytorch_model.safetensors",
            ])?,
            clip: Self::pull_first(repo, &[
                "text_encoder/model.fp16.safetensors",
                "text_encoder/model.safetensors",
            ])?,
            // DreamShaper 8 is SD 1.5 based (CLIP ViT-L/14 tokenizer).
            tokenizer: pull_file(SD2_CLIP_TOKENIZER_REPO, "tokenizer.json")?,
        })
    }

    fn pull_first(repo: &str, candidates: &[&str]) -> Result<PathBuf> {
        let mut last_err = None;
        for name in candidates {
            match pull_file(repo, name) {
                Ok(p) => return Ok(p),
                Err(e) => last_err = Some((name, e)),
            }
        }
        let (name, _) = last_err.expect("candidates non-empty");
        Err(GabrielError::DownloadFailed {
            repo: repo.to_string(),
            filename: name.to_string(),
        })
    }
}

/// Query GPU used bytes via NVML (nvml-wrapper).
///
/// This avoids pulling in cudarc directly (which would conflict with
/// candle-core's pinned cudarc feature set) and gives us device-level
/// memory information regardless of CUDA context state.
#[cfg(feature = "nvml")]
pub fn gpu_used_bytes() -> Result<u64> {
    let nvml = nvml_wrapper::Nvml::init().map_err(|_| GabrielError::GpuQueryFailed)?;
    let device = nvml
        .device_by_index(0)
        .map_err(|_| GabrielError::GpuQueryFailed)?;
    let mem = device
        .memory_info()
        .map_err(|_| GabrielError::GpuQueryFailed)?;
    Ok(mem.used)
}

#[cfg(not(feature = "nvml"))]
pub fn gpu_used_bytes() -> Result<u64> {
    tracing::warn!("nvml feature disabled; gpu_used_bytes returning 0");
    Ok(0)
}
