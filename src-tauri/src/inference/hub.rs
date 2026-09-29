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
#[cfg(feature = "tts-kokoro")]
pub const KOKORO_REPO: &str = "kokoro/kokoro-82m";

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
        match Self::pull_from(DREAMSHAPER_8_LCM_REPO) {
            Ok(f) => Ok(f),
            Err(e) => {
                tracing::warn!(error = %e, repo = DREAMSHAPER_8_REPO, "LCM repo pull failed, trying base DreamShaper-8");
                Self::pull_from(DREAMSHAPER_8_REPO)
            }
        }
    }

    fn pull_from(repo: &str) -> Result<Self> {
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
