//! Swappable diffusion schedulers, isolated from UNet weights.
//!
//! Candle upstream has no dedicated `LCMScheduler` type. LCM-distilled UNets
//! (DreamShaper-8-LCM) are mathematically consumed through a standard
//! epsilon-predicting scheduler run at very few steps (4-8) with a low
//! guidance scale (1.5-2.0). This module isolates that choice so a future
//! backend (SDXL/Flux) can swap schedulers without touching UNet/VAE code.
//!
//! - [`SchedulerKind::Lcm`] (default): DDIM, epsilon prediction, 4 steps.
//! - [`SchedulerKind::EulerAncestral`]: Euler-Ancestral-Discrete with trailing
//!   spacing (same family SDXL-Turbo uses), for a slightly different
//!   speed/quality trade-off at 4-8 steps.
//! - [`SchedulerKind::Ddim`]: vanilla DDIM for higher-step (12+) fallback.

use candle_transformers::models::stable_diffusion::schedulers::{
    PredictionType, Scheduler, SchedulerConfig, TimestepSpacing,
};

/// Which scheduler family to run the denoising loop with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SchedulerKind {
    /// LCM mode: DDIM + epsilon + few steps + low CFG. Default.
    #[default]
    Lcm,
    /// Euler-Ancestral-Discrete with trailing spacing.
    EulerAncestral,
    /// Plain DDIM (higher-step fallback / SD 1.5 default behaviour).
    Ddim,
}

impl SchedulerKind {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "lcm" | "dreamshaper" | "dreamshaper-8" | "dreamshaper-8-lcm" => Some(Self::Lcm),
            "euler" | "euler_a" | "euler-ancestral" | "euler_ancestral" => {
                Some(Self::EulerAncestral)
            }
            "ddim" => Some(Self::Ddim),
            _ => None,
        }
    }
}

/// LCM defaults for DreamShaper-8-LCM.
pub const LCM_STEPS_DEFAULT: usize = 4;
pub const LCM_STEPS_MAX: usize = 8;
pub const LCM_CFG_DEFAULT: f64 = 1.5;
pub const LCM_CFG_MAX: f64 = 2.0;

/// Clamp user-requested steps into the LCM-supported window.
pub fn clamp_lcm_steps(steps: usize) -> usize {
    steps.clamp(1, LCM_STEPS_MAX)
}

/// Build an independent scheduler for `steps` inference steps.
///
/// Decoupled from [`candle_transformers::models::stable_diffusion::StableDiffusionConfig`]
/// so the scheduler can be swapped without rebuilding UNet/VAE weights.
pub fn build_scheduler(
    steps: usize,
    kind: SchedulerKind,
) -> candle_core::Result<Box<dyn Scheduler>> {
    let steps = steps.max(1);
    match kind {
        SchedulerKind::Lcm | SchedulerKind::Ddim => {
            let cfg =
                candle_transformers::models::stable_diffusion::ddim::DDIMSchedulerConfig {
                    prediction_type: PredictionType::Epsilon,
                    timestep_spacing: TimestepSpacing::Leading,
                    ..Default::default()
                };
            cfg.build(steps)
        }
        SchedulerKind::EulerAncestral => {
            let cfg = candle_transformers::models::stable_diffusion::euler_ancestral_discrete::EulerAncestralDiscreteSchedulerConfig {
                prediction_type: PredictionType::Epsilon,
                timestep_spacing: TimestepSpacing::Trailing,
                ..Default::default()
            };
            cfg.build(steps)
        }
    }
}
