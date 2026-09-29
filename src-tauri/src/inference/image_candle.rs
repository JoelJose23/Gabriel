//! Backwards-compatibility shim for the image backend.
//!
//! The file is intentionally **kept** (not deleted) so the SD-Turbo code path
//! can be re-enabled in the future. The SD-Turbo weight-pulling and denoising
//! implementation has been removed from here and replaced by the modular
//! pipeline in [`crate::inference::image`]:
//!
//! - weights: [`crate::inference::hub::DreamShaperFiles`]
//!   (legacy [`crate::inference::hub::SdTurboFiles`] preserved but unused)
//! - scheduler: [`crate::inference::image::scheduler`]
//! - pipeline: [`crate::inference::image::DreamShaperBackend`]
//!
//! Existing imports of `image_candle::CandleImageBackend` keep compiling:
//! it is now an alias for the DreamShaper backend, and legacy `"sd-turbo"`
//! model ids route to DreamShaper weights (see `DreamShaperBackend::load`).

pub use crate::inference::image::DreamShaperBackend as CandleImageBackend;
pub use crate::inference::image::ImageGenParams;
