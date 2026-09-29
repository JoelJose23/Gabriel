//! DreamShaper-8-LCM backend (SD 1.5 architecture, FP16, ~2.1 GB VRAM).
//! Includes live CUDA memory profiling, allocation tracking, and scoped VRAM recycling.
//!
//! VRAM strategy on 8 GB cards:
//!   * sliced attention in the UNet (no full 4096x4096 score matrices),
//!   * tiled VAE decode on the GPU (256px tiles, feather-blended on the CPU),
//!   * FP32 CPU VAE only as a last-resort fallback.
//!
//! Env: GABRIEL_IMAGE_CPU_DECODE=1 forces the CPU VAE path (debugging).

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use async_trait::async_trait;
use candle_core::{DType, Device, IndexOp, Tensor};
use candle_nn::Module;
use candle_transformers::models::stable_diffusion::{self, StableDiffusionConfig};
use tokenizers::Tokenizer;

use crate::core::bandwidth::BandwidthGovernor;
use crate::error::{GabrielError, Result};
use crate::inference::ImageBackend;
use crate::inference::hub;

use super::scheduler::{self, LCM_CFG_DEFAULT, LCM_STEPS_DEFAULT, SchedulerKind};

pub const MODEL_REPO_LCM: &str = hub::DREAMSHAPER_8_LCM_REPO;
pub const SIZE_DEFAULT: usize = 512;
pub const VAE_SCALE: f64 = 0.18215;
pub const VRAM_FLOOR: u64 = 1_000_000_000;
pub const VRAM_CEILING: u64 = 4_000_000_000;
pub const VRAM_FALLBACK_ESTIMATE: u64 = 2_100_000_000;

/// Tiled VAE decode geometry, in latent pixels (1 latent px = 8 image px).
pub const VAE_TILE: usize = 32; // 32 latent px = 256 image px per tile
pub const VAE_TILE_OVERLAP: usize = 8; // minimum overlap between neighbouring tiles
pub const VAE_UP: usize = 8; // VAE upsampling factor

/// UNet attention slice size (over batch*heads). Lower = less VRAM, slightly slower.
pub const ATTENTION_SLICE: Option<usize> = None;

/// Live snapshot for profiling CUDA memory footprint.
#[derive(Debug, Clone)]
pub struct CudaMemorySnapshot {
    pub stage: &'static str,
    pub used_bytes: u64,
    pub delta_bytes: i64,
    pub elapsed_ms: u128,
}

pub struct CudaMemoryProfiler {
    last_used: u64,
    start_time: Instant,
}

impl CudaMemoryProfiler {
    pub fn new() -> Self {
        let initial_used = hub::gpu_used_bytes().unwrap_or(0);
        Self {
            last_used: initial_used,
            start_time: Instant::now(),
        }
    }

    pub fn checkpoint(&mut self, stage: &'static str) -> CudaMemorySnapshot {
        let current_used = hub::gpu_used_bytes().unwrap_or(self.last_used);
        let delta = current_used as i64 - self.last_used as i64;
        let elapsed = self.start_time.elapsed().as_millis();
        self.last_used = current_used;

        let snapshot = CudaMemorySnapshot {
            stage,
            used_bytes: current_used,
            delta_bytes: delta,
            elapsed_ms: elapsed,
        };

        tracing::info!(
            stage = snapshot.stage,
            vram_mb = snapshot.used_bytes / (1024 * 1024),
            delta_mb = snapshot.delta_bytes / (1024 * 1024),
            elapsed_ms = snapshot.elapsed_ms,
            "CUDA Memory Profile Checkpoint"
        );
        eprintln!(
            "[CUDA PROFILE] [{:>4}ms] {:<25} | VRAM: {:>5} MB | Delta: {:>+5} MB",
            snapshot.elapsed_ms,
            snapshot.stage,
            snapshot.used_bytes / (1024 * 1024),
            snapshot.delta_bytes / (1024 * 1024)
        );

        snapshot
    }
}

#[derive(Debug, Clone)]
pub struct ImageGenParams {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub steps: usize,
    pub cfg_scale: f64,
    pub seed: Option<u64>,
    pub width: usize,
    pub height: usize,
    pub scheduler: SchedulerKind,
}

impl Default for ImageGenParams {
    fn default() -> Self {
        Self {
            prompt: String::new(),
            negative_prompt: None,
            steps: LCM_STEPS_DEFAULT,
            cfg_scale: LCM_CFG_DEFAULT,
            seed: None,
            width: SIZE_DEFAULT,
            height: SIZE_DEFAULT,
            scheduler: SchedulerKind::Lcm,
        }
    }
}

impl ImageGenParams {
    pub fn new(prompt: impl Into<String>, width: u32, height: u32) -> Self {
        let mut p = Self::default();
        p.prompt = prompt.into();
        p.width = normalize_size(width);
        p.height = normalize_size(height);
        p
    }

    pub fn normalized(mut self) -> Self {
        self.steps = scheduler::clamp_lcm_steps(self.steps);
        if !self.cfg_scale.is_finite() {
            self.cfg_scale = LCM_CFG_DEFAULT;
        }
        self.cfg_scale = self.cfg_scale.clamp(1.0, 8.0);
        self
    }
}

fn normalize_size(v: u32) -> usize {
    let v = v.clamp(256, 768) as usize;
    (v / 8) * 8
}

struct Pipeline {
    clip: stable_diffusion::clip::ClipTextTransformer,
    unet: stable_diffusion::unet_2d::UNet2DConditionModel,
    vae: stable_diffusion::vae::AutoEncoderKL,
    cpu_vae: Option<stable_diffusion::vae::AutoEncoderKL>,
    config: StableDiffusionConfig,
    vae_file: PathBuf,
    tokenizer: Tokenizer,
    clip_device: Device,
    vae_device: Device,
    unet_device: Device,
    dtype: DType,
}

pub struct DreamShaperBackend {
    model_id: String,
    pipeline: Arc<Mutex<Pipeline>>,
    governor: Arc<BandwidthGovernor>,
    resident_bytes: u64,
}

impl std::fmt::Debug for DreamShaperBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DreamShaperBackend")
            .field("model_id", &self.model_id)
            .field("resident_bytes", &self.resident_bytes)
            .finish_non_exhaustive()
    }
}

impl DreamShaperBackend {
    pub async fn load(model_id: String, governor: Arc<BandwidthGovernor>) -> Result<Self> {
        let tag = model_id.clone();
        tokio::task::spawn_blocking(move || Self::load_blocking(model_id, governor))
            .await
            .map_err(|e| GabrielError::WeightLoadFailed {
                model_id: tag,
                detail: format!("{e}"),
            })?
    }

    fn load_blocking(model_id: String, governor: Arc<BandwidthGovernor>) -> Result<Self> {
        let mut profiler = CudaMemoryProfiler::new();
        profiler.checkpoint("Start Model Load");

        let files = hub::DreamShaperFiles::pull()?;
        let gpu_device = Device::cuda_if_available(0).map_err(|_| GabrielError::GpuQueryFailed)?;
        let cpu_device = Device::Cpu;
        let dtype = DType::F16;

        // Sliced attention keeps the UNet's transient VRAM small enough to leave
        // headroom for the VAE and any concurrently running LLM.
        let config =
            StableDiffusionConfig::v1_5(ATTENTION_SLICE, Some(SIZE_DEFAULT), Some(SIZE_DEFAULT));

        let tokenizer =
            Tokenizer::from_file(&files.tokenizer).map_err(|e| GabrielError::WeightLoadFailed {
                model_id: "dreamshaper-clip-tokenizer".into(),
                detail: e.to_string(),
            })?;

        let (clip, clip_device) = match build_clip(&config, &files.clip, &gpu_device, dtype) {
            Ok(c) => (c, gpu_device.clone()),
            Err(e) => {
                tracing::warn!(error = %e, "CLIP GPU load failed, falling back to CPU");
                let c = build_clip(&config, &files.clip, &cpu_device, DType::F32)?;
                (c, cpu_device.clone())
            }
        };
        profiler.checkpoint("Post CLIP Load");

        let (vae, vae_device) = match config.build_vae(&files.vae, &gpu_device, dtype) {
            Ok(v) => (v, gpu_device.clone()),
            Err(e) => {
                tracing::warn!(error = %e, "VAE GPU load failed, falling back to CPU");
                let v = config.build_vae(&files.vae, &cpu_device, DType::F32)?;
                (v, cpu_device.clone())
            }
        };
        profiler.checkpoint("Post GPU VAE Load");

        let cpu_vae = match config.build_vae(&files.vae, &cpu_device, DType::F32) {
            Ok(v) => {
                tracing::info!("dreamshaper: CPU VAE pre-cached for OOM-proof decode");
                Some(v)
            }
            Err(e) => {
                tracing::warn!(error = %e, "CPU VAE pre-cache failed; decode will build it lazily");
                None
            }
        };

        tracing::info!("dreamshaper: loading UNet on GPU (fp16)");
        let before_unet = hub::gpu_used_bytes().unwrap_or(0);
        let unet = config
            .build_unet(&files.unet, &gpu_device, 4, false, dtype)
            .map_err(|e| GabrielError::WeightLoadFailed {
                model_id: "dreamshaper-unet".into(),
                detail: format!("{e}"),
            })?;
        let after_unet = hub::gpu_used_bytes().unwrap_or(before_unet);
        profiler.checkpoint("Post UNet Load");

        let clip_on_gpu = clip_device.is_cuda();
        let vae_on_gpu = vae_device.is_cuda();
        let unet_gpu_bytes = after_unet.saturating_sub(before_unet);
        let clip_vram = if clip_on_gpu {
            estimate_clip_vram(dtype)
        } else {
            0
        };
        let vae_vram = if vae_on_gpu {
            estimate_vae_vram(dtype)
        } else {
            0
        };

        let measured = unet_gpu_bytes
            .saturating_add(clip_vram)
            .saturating_add(vae_vram);
        let resident_bytes = if (VRAM_FLOOR..=VRAM_CEILING).contains(&measured) {
            measured
        } else {
            VRAM_FALLBACK_ESTIMATE
        };

        Ok(Self {
            model_id,
            pipeline: Arc::new(Mutex::new(Pipeline {
                clip,
                unet,
                vae,
                cpu_vae,
                config,
                vae_file: files.vae,
                tokenizer,
                clip_device,
                vae_device,
                unet_device: gpu_device,
                dtype,
            })),
            governor,
            resident_bytes,
        })
    }

    pub async fn generate_with_params(&self, params: ImageGenParams) -> Result<Vec<u8>> {
        let pipeline = self.pipeline.clone();
        let governor = self.governor.clone();
        let params = params.normalized();
        tracing::info!("dreamshaper: spawning blocking diffusion task");

        let result = tokio::task::spawn_blocking(move || {
            Self::generate_blocking(&pipeline, &governor, &params)
        })
        .await;

        tracing::info!("dreamshaper: blocking task completed: {:?}", result.is_ok());
        result
            .map_err(|_| GabrielError::Backend("diffusion worker terminated abnormally".into()))?
    }

    fn generate_blocking(
        pipeline: &Mutex<Pipeline>,
        governor: &BandwidthGovernor,
        params: &ImageGenParams,
    ) -> Result<Vec<u8>> {
        let mut profiler = CudaMemoryProfiler::new();
        profiler.checkpoint("Generation Start");

        let pipe = pipeline
            .lock()
            .map_err(|_| GabrielError::Backend("image pipeline lock poisoned".into()))?;

        let prompt = params.prompt.as_str();
        let pad_id =
            *pipe
                .tokenizer
                .get_vocab(true)
                .get("<|endoftext|>")
                .ok_or(GabrielError::Backend(
                    "CLIP tokenizer missing pad token".into(),
                ))?;
        let max_pos = pipe.config.clip.max_position_embeddings;

        let mut tokens = pipe
            .tokenizer
            .encode(prompt, true)
            .map_err(|_| GabrielError::InvalidRequest("prompt tokenization failed".into()))?
            .get_ids()
            .to_vec();
        tokens.truncate(max_pos);
        while tokens.len() < max_pos {
            tokens.push(pad_id);
        }

        let clip_on_gpu = pipe.clip_device.is_cuda();
        let cond_tokens = Tensor::new(tokens.as_slice(), &pipe.clip_device)?.unsqueeze(0)?;
        let cond = pipe.clip.forward(&cond_tokens)?;
        let cond_embeddings_cpu = cond.to_dtype(pipe.dtype)?;

        let text_embeddings = if clip_on_gpu {
            cond_embeddings_cpu
        } else {
            cond_embeddings_cpu.to_device(&pipe.unet_device)?
        };

        let guidance = params.cfg_scale;
        let text_embeddings = if (guidance - 1.0).abs() < f64::EPSILON {
            text_embeddings
        } else {
            let neg = params.negative_prompt.as_deref().unwrap_or("");
            let uncond_ids = if neg.is_empty() {
                vec![pad_id; max_pos]
            } else {
                let mut ids = pipe
                    .tokenizer
                    .encode(neg, true)
                    .map_err(|_| {
                        GabrielError::InvalidRequest("negative prompt tokenization failed".into())
                    })?
                    .get_ids()
                    .to_vec();
                ids.truncate(max_pos);
                while ids.len() < max_pos {
                    ids.push(pad_id);
                }
                ids
            };
            let uncond_tokens = Tensor::new(&uncond_ids[..], &pipe.clip_device)?.unsqueeze(0)?;
            let uncond = pipe.clip.forward(&uncond_tokens)?;
            let uncond_embeddings = Tensor::cat(&[&uncond, &cond], 0)?.to_dtype(pipe.dtype)?;
            if clip_on_gpu {
                uncond_embeddings
            } else {
                uncond_embeddings.to_device(&pipe.unet_device)?
            }
        };

        profiler.checkpoint("Text Embedding Forward");

        let mut scheduler = super::scheduler::build_scheduler(params.steps, params.scheduler)
            .map_err(|e| GabrielError::Backend(format!("scheduler build failed: {e}")))?;
        let timesteps = scheduler.timesteps().to_vec();

        let (w, h) = (params.width, params.height);
        let latents_shape = (1usize, 4usize, h / 8, w / 8);
        let latents = Tensor::randn(0f32, 1f32, latents_shape, &pipe.unet_device)?
            .affine(scheduler.init_noise_sigma(), 0.0)?
            .to_dtype(pipe.dtype)?;
        let text_embeddings = text_embeddings
            .to_device(&pipe.unet_device)?
            .to_dtype(pipe.dtype)?;

        let mut latents = latents;
        tracing::info!(
            "dreamshaper: starting denoising loop with {} steps",
            timesteps.len()
        );

        for (step_index, &timestep) in timesteps.iter().enumerate() {
            let yield_time = governor.standard_yield();
            if !yield_time.is_zero() {
                std::thread::sleep(yield_time);
            }

            // Wrap each step in a scope block so temporary step tensors are immediately dropped
            latents = {
                let latent_model_input = scheduler
                    .scale_model_input(latents.clone(), timestep)
                    .map_err(|e| GabrielError::Backend(format!("scheduler scale failed: {e}")))?
                    .to_dtype(pipe.dtype)?;

                let noise_pred = if (guidance - 1.0).abs() < f64::EPSILON {
                    pipe.unet
                        .forward(&latent_model_input, timestep as f64, &text_embeddings)?
                } else {
                    let input = Tensor::cat(&[&latent_model_input, &latent_model_input], 0)?;
                    let pred = pipe
                        .unet
                        .forward(&input, timestep as f64, &text_embeddings)?;
                    let chunks = pred.chunk(2, 0)?;
                    (&chunks[0] + ((&chunks[1] - &chunks[0])? * guidance)?)?
                };

                scheduler
                    .step(&noise_pred, timestep, &latents)
                    .map_err(|e| GabrielError::Backend(format!("scheduler step failed: {e}")))?
                    .to_dtype(pipe.dtype)?
            };

            if step_index == 0 || step_index == timesteps.len() - 1 {
                profiler.checkpoint(if step_index == 0 {
                    "UNet Denoise Step 1"
                } else {
                    "UNet Denoise Step Final"
                });
            }
        }

        // Everything except the final latents is dead now; release it before the VAE runs.
        drop(text_embeddings);
        profiler.checkpoint("Pre VAE Decode");

        let vae_scale_inv = 1.0 / VAE_SCALE;
        let vae_on_gpu = pipe.vae_device.is_cuda();
        let vae_dtype = if vae_on_gpu { pipe.dtype } else { DType::F32 };

        let force_cpu_decode = std::env::var("GABRIEL_IMAGE_CPU_DECODE")
            .is_ok_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));

        let images = if force_cpu_decode || !vae_on_gpu {
            let img = Self::decode_vae_cpu(&pipe, &latents, vae_scale_inv)?;
            profiler.checkpoint("Post CPU VAE Decode");
            img
        } else {
            match decode_tiled(
                &pipe.vae,
                &latents,
                &pipe.vae_device,
                vae_dtype,
                vae_scale_inv,
                &mut profiler,
            ) {
                Ok(img) => {
                    profiler.checkpoint("Post GPU Tiled VAE Decode");
                    img
                }
                Err(e) => {
                    tracing::warn!(
                        error = %e,
                        "tiled GPU VAE decode failed, falling back to CPU VAE (slow)"
                    );
                    let t = Instant::now();
                    let img = Self::decode_vae_cpu(&pipe, &latents, vae_scale_inv)?;
                    tracing::info!(
                        secs = t.elapsed().as_secs_f32(),
                        "dreamshaper: CPU VAE decode done"
                    );
                    profiler.checkpoint("Post CPU VAE Decode");
                    img
                }
            }
        };

        drop(latents);

        // `images` is (1, 3, H, W) F32 on the CPU (tiled/CPU paths) in [-1, 1].
        let pixels = ((images.affine(0.5, 0.0))? + 0.5)?
            .clamp(0f32, 1f32)?
            .affine(255., 0.)?
            .to_dtype(DType::U8)?;

        profiler.checkpoint("Post Pixel Processing");
        encode_png(pixels.i(0)?)
    }

    fn decode_vae_cpu(pipe: &Pipeline, latents: &Tensor, vae_scale_inv: f64) -> Result<Tensor> {
        let cpu = Device::Cpu;

        let latents_f32_gpu = latents
            .to_dtype(DType::F32)
            .map_err(|e| GabrielError::Backend(format!("GPU FP16->FP32 cast failed: {e}")))?;

        let latents_cpu = latents_f32_gpu
            .to_device(&cpu)
            .map_err(|e| GabrielError::Backend(format!("GPU->CPU tensor transfer failed: {e}")))?;

        drop(latents_f32_gpu);

        let scaled = latents_cpu.affine(vae_scale_inv, 0.0)?;

        if let Some(ref cpu_vae) = pipe.cpu_vae {
            cpu_vae
                .decode(&scaled)
                .map_err(|e| GabrielError::Backend(format!("CPU VAE decode failed: {e}")))
        } else {
            let cpu_vae = pipe
                .config
                .build_vae(&pipe.vae_file, &cpu, DType::F32)
                .map_err(|e| GabrielError::WeightLoadFailed {
                    model_id: "dreamshaper-vae-cpu-fallback".into(),
                    detail: e.to_string(),
                })?;
            cpu_vae
                .decode(&scaled)
                .map_err(|e| GabrielError::Backend(format!("CPU VAE decode failed: {e}")))
        }
    }
}

// ---------------------------------------------------------------------------
// Tiled VAE decode
// ---------------------------------------------------------------------------

/// Evenly spaced tile origins along one axis (latent px).
/// Returns `(starts, actual_overlap)` where `actual_overlap >= min_overlap`
/// whenever more than one tile is needed.
fn tile_layout(dim: usize, tile: usize, min_overlap: usize) -> (Vec<usize>, usize) {
    if dim <= tile {
        return (vec![0], 0);
    }
    let max_stride = tile.saturating_sub(min_overlap).max(1);
    let span = dim - tile;
    let n = span.div_ceil(max_stride) + 1; // number of tiles, >= 2 here
    let starts: Vec<usize> = (0..n).map(|i| i * span / (n - 1)).collect();
    let max_gap = starts.windows(2).map(|p| p[1] - p[0]).max().unwrap_or(tile);
    (starts, tile.saturating_sub(max_gap))
}

/// Feather weight for pixel `i` of `n` along one axis. Edges that touch the image
/// border are not faded; interior edges ramp linearly over `ov` pixels.
/// Always strictly positive so the final normalisation never divides by zero.
fn ramp(i: usize, n: usize, ov: usize, first: bool, last: bool) -> f32 {
    let mut w = 1.0f32;
    if !first && i < ov {
        w = w.min((i as f32 + 1.0) / (ov as f32 + 1.0));
    }
    if !last && n - 1 - i < ov {
        w = w.min(((n - 1 - i) as f32 + 1.0) / (ov as f32 + 1.0));
    }
    w
}

/// Decode `latents` (1, 4, h, w) tile by tile on `device`, accumulating the result on
/// the CPU. Peak VRAM is that of a 256x256 decode regardless of the output size.
/// Returns a (1, 3, h*8, w*8) F32 CPU tensor in [-1, 1].
fn decode_tiled(
    vae: &stable_diffusion::vae::AutoEncoderKL,
    latents: &Tensor,
    device: &Device,
    dtype: DType,
    scale_inv: f64,
    profiler: &mut CudaMemoryProfiler,
) -> Result<Tensor> {
    let (_, _, lh, lw) = latents.dims4()?;
    let (oh, ow) = (lh * VAE_UP, lw * VAE_UP);
    let (th, tw) = (VAE_TILE.min(lh), VAE_TILE.min(lw));
    let (ph, pw) = (th * VAE_UP, tw * VAE_UP); // tile size in image px

    let (ys, y_ov) = tile_layout(lh, th, VAE_TILE_OVERLAP);
    let (xs, x_ov) = tile_layout(lw, tw, VAE_TILE_OVERLAP);
    let (y_ramp, x_ramp) = (y_ov * VAE_UP, x_ov * VAE_UP);

    let z_all = latents.to_device(device)?.to_dtype(dtype)?;
    let mut acc = vec![0f32; 3 * oh * ow];
    let mut wsum = vec![0f32; oh * ow];
    let mut first_tile = true;

    for &y0 in &ys {
        let (first_y, last_y) = (y0 == 0, y0 + th == lh);
        let wy: Vec<f32> = (0..ph)
            .map(|i| ramp(i, ph, y_ramp, first_y, last_y))
            .collect();

        for &x0 in &xs {
            let (first_x, last_x) = (x0 == 0, x0 + tw == lw);
            let wx: Vec<f32> = (0..pw)
                .map(|i| ramp(i, pw, x_ramp, first_x, last_x))
                .collect();

            // GPU work for this tile; every GPU temporary is dropped at the end of the statement.
            let z = z_all
                .narrow(2, y0, th)?
                .narrow(3, x0, tw)?
                .contiguous()?
                .affine(scale_inv, 0.0)?;
            let d = vae
                .decode(&z)?
                .to_dtype(DType::F32)?
                .to_device(&Device::Cpu)?
                .i(0)?
                .contiguous()?
                .flatten_all()?
                .to_vec1::<f32>()?;
            drop(z);

            if first_tile {
                profiler.checkpoint("VAE First Tile");
                first_tile = false;
            }
            if d.iter().any(|v| !v.is_finite()) {
                return Err(GabrielError::Backend(
                    "tiled VAE decode produced non-finite values".into(),
                ));
            }

            let (py0, px0) = (y0 * VAE_UP, x0 * VAE_UP);
            for yy in 0..ph {
                for xx in 0..pw {
                    let wgt = wy[yy] * wx[xx];
                    let o = (py0 + yy) * ow + px0 + xx;
                    wsum[o] += wgt;
                    for c in 0..3 {
                        acc[c * oh * ow + o] += d[c * ph * pw + yy * pw + xx] * wgt;
                    }
                }
            }
        }
    }
    drop(z_all);

    for c in 0..3 {
        for o in 0..oh * ow {
            acc[c * oh * ow + o] /= wsum[o];
        }
    }
    Ok(Tensor::from_vec(acc, (1, 3, oh, ow), &Device::Cpu)?)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn estimate_clip_vram(dtype: DType) -> u64 {
    match dtype {
        DType::F16 => 300_000_000,
        _ => 600_000_000,
    }
}

fn estimate_vae_vram(dtype: DType) -> u64 {
    match dtype {
        DType::F16 => 150_000_000,
        _ => 300_000_000,
    }
}

fn build_clip(
    config: &StableDiffusionConfig,
    weights: &PathBuf,
    device: &Device,
    dtype: DType,
) -> Result<stable_diffusion::clip::ClipTextTransformer> {
    stable_diffusion::build_clip_transformer(&config.clip, weights, device, dtype).map_err(|e| {
        GabrielError::WeightLoadFailed {
            model_id: "dreamshaper-clip".into(),
            detail: e.to_string(),
        }
    })
}

fn encode_png(image_chw_u8: Tensor) -> Result<Vec<u8>> {
    let (channels, height, width) = match image_chw_u8.dims3() {
        Ok(d) => d,
        Err(_) => return Err(GabrielError::Backend("unexpected VAE output shape".into())),
    };
    if channels != 3 {
        return Err(GabrielError::Backend("VAE output must be RGB".into()));
    }
    let data = image_chw_u8
        .flatten_all()?
        .to_vec1::<u8>()
        .map_err(|_| GabrielError::Backend("failed to read decoded pixels".into()))?;

    let mut imgbuf = image::RgbImage::new(width as u32, height as u32);
    for y in 0..height {
        for x in 0..width {
            let r = data[y * width + x];
            let g = data[(height + y) * width + x];
            let b = data[(2 * height + y) * width + x];
            imgbuf.put_pixel(x as u32, y as u32, image::Rgb([r, g, b]));
        }
    }

    let mut out = Vec::new();
    let cursor = std::io::Cursor::new(&mut out);
    image::DynamicImage::ImageRgb8(imgbuf)
        .write_to(cursor, image::ImageFormat::Png)
        .map_err(|_| GabrielError::Backend("PNG encoding failed".into()))?;
    Ok(out)
}

#[async_trait]
impl ImageBackend for DreamShaperBackend {
    async fn generate(&self, prompt: &str, width: u32, height: u32) -> Result<Vec<u8>> {
        self.generate_with_params(ImageGenParams::new(prompt, width, height))
            .await
    }

    fn measured_vram_bytes(&self) -> Option<u64> {
        Some(self.resident_bytes)
    }
}
