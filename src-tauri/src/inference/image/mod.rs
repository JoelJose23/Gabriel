//! Modular image-generation backends.
//!
//! Layout (weights / scheduler / pipeline separated for future SDXL/Flux swaps):
//! - [`scheduler`]: isolated scheduler math (LCM / Euler-Ancestral / DDIM).
//! - [`dreamshaper`]: `DreamShaperBackend` + `ImageGenParams` (CLIP + UNet + VAE).
//!
//! The public [`crate::inference::ImageBackend`] trait stays decoupled from
//! these implementation details.

pub mod dreamshaper;
pub mod scheduler;

pub use dreamshaper::{DreamShaperBackend, ImageGenParams};
pub use scheduler::{SchedulerKind, build_scheduler};
