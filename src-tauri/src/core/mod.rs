pub mod bandwidth;
pub mod engine;
pub mod events;
pub mod pager;
pub mod registry;
pub mod scheduler;

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub host: String,
    pub port: u16,
    pub vram_high_watermark: f64,
    pub vram_low_watermark: f64,
    pub idle_offload_after: Duration,
    pub pager_poll_interval: Duration,
    pub queue_capacity: usize,
    pub max_concurrent_image_jobs: usize,
    pub auto_load_on_request: bool,
    pub bandwidth_ceiling_percent: f64,
    pub max_bandwidth_yield: Duration,
    pub max_loaded_models: usize,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 8080,
            vram_high_watermark: 0.85,
            vram_low_watermark: 0.70,
            idle_offload_after: Duration::from_secs(120),
            pager_poll_interval: Duration::from_secs(2),
            queue_capacity: 256,
            max_concurrent_image_jobs: 4,
            auto_load_on_request: false,
            bandwidth_ceiling_percent: 80.0,
            max_bandwidth_yield: Duration::from_millis(250),
            max_loaded_models: 4,
        }
    }
}

impl EngineConfig {
    fn config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|d| d.join("gabriel").join("config.json"))
    }

    /// Load the persisted config, falling back to defaults when missing,
    /// unreadable, malformed, or failing validation.
    pub fn load() -> Self {
        let Some(path) = Self::config_path() else {
            return Self::default();
        };
        match std::fs::read_to_string(path) {
            Ok(raw) => serde_json::from_str::<EngineConfigDto>(&raw)
                .ok()
                .filter(|dto| dto.validate().is_ok())
                .map(EngineConfig::from)
                .unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Persist the config to the platform config directory.
    /// Failures are logged, never fatal — the runtime copy stays authoritative.
    pub fn save(&self) {
        let Some(path) = Self::config_path() else {
            return;
        };
        let dto = EngineConfigDto::from(self.clone());
        let render = || -> std::io::Result<()> {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, serde_json::to_string_pretty(&dto).expect("config serializes"))
        };
        if let Err(e) = render() {
            tracing::warn!(path = %path.display(), error = %e, "failed to persist engine config");
        }
    }
}

/// JSON representation of [`EngineConfig`] — durations become plain numbers
/// (seconds / milliseconds) so the API surface stays ergonomic for the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct EngineConfigDto {
    pub host: String,
    pub port: u16,
    pub vram_high_watermark: f64,
    pub vram_low_watermark: f64,
    pub idle_offload_after_secs: u64,
    pub pager_poll_interval_secs: u64,
    pub queue_capacity: usize,
    pub max_concurrent_image_jobs: usize,
    pub auto_load_on_request: bool,
    pub bandwidth_ceiling_percent: f64,
    pub max_bandwidth_yield_ms: u64,
    pub max_loaded_models: usize,
}

impl Default for EngineConfigDto {
    fn default() -> Self {
        EngineConfig::default().into()
    }
}

impl From<EngineConfig> for EngineConfigDto {
    fn from(c: EngineConfig) -> Self {
        Self {
            host: c.host,
            port: c.port,
            vram_high_watermark: c.vram_high_watermark,
            vram_low_watermark: c.vram_low_watermark,
            idle_offload_after_secs: c.idle_offload_after.as_secs(),
            pager_poll_interval_secs: c.pager_poll_interval.as_secs(),
            queue_capacity: c.queue_capacity,
            max_concurrent_image_jobs: c.max_concurrent_image_jobs,
            auto_load_on_request: c.auto_load_on_request,
            bandwidth_ceiling_percent: c.bandwidth_ceiling_percent,
            max_bandwidth_yield_ms: c.max_bandwidth_yield.as_millis() as u64,
            max_loaded_models: c.max_loaded_models,
        }
    }
}

impl From<EngineConfigDto> for EngineConfig {
    fn from(d: EngineConfigDto) -> Self {
        Self {
            host: d.host,
            port: d.port,
            vram_high_watermark: d.vram_high_watermark,
            vram_low_watermark: d.vram_low_watermark,
            idle_offload_after: Duration::from_secs(d.idle_offload_after_secs),
            pager_poll_interval: Duration::from_secs(d.pager_poll_interval_secs),
            queue_capacity: d.queue_capacity,
            max_concurrent_image_jobs: d.max_concurrent_image_jobs,
            auto_load_on_request: d.auto_load_on_request,
            bandwidth_ceiling_percent: d.bandwidth_ceiling_percent,
            max_bandwidth_yield: Duration::from_millis(d.max_bandwidth_yield_ms),
            max_loaded_models: d.max_loaded_models,
        }
    }
}

impl EngineConfigDto {
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.host.trim().is_empty() {
            return Err("host must not be empty".into());
        }
        if self.port == 0 {
            return Err("port must be between 1 and 65535".into());
        }
        if !(0.0..=1.0).contains(&self.vram_high_watermark) || self.vram_high_watermark <= 0.0 {
            return Err("vram_high_watermark must be in (0, 1]".into());
        }
        if !(0.0..=1.0).contains(&self.vram_low_watermark) {
            return Err("vram_low_watermark must be in [0, 1]".into());
        }
        if self.vram_low_watermark >= self.vram_high_watermark {
            return Err("vram_low_watermark must be below vram_high_watermark".into());
        }
        if self.idle_offload_after_secs == 0 {
            return Err("idle_offload_after_secs must be at least 1".into());
        }
        if self.pager_poll_interval_secs == 0 {
            return Err("pager_poll_interval_secs must be at least 1".into());
        }
        if self.queue_capacity == 0 {
            return Err("queue_capacity must be at least 1".into());
        }
        if self.max_concurrent_image_jobs == 0 {
            return Err("max_concurrent_image_jobs must be at least 1".into());
        }
        if !(10.0..=100.0).contains(&self.bandwidth_ceiling_percent) {
            return Err("bandwidth_ceiling_percent must be in [10, 100]".into());
        }
        if self.max_bandwidth_yield_ms > 5_000 {
            return Err("max_bandwidth_yield_ms must be at most 5000".into());
        }
        if self.max_loaded_models == 0 {
            return Err("max_loaded_models must be at least 1".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dto_round_trips() {
        let cfg = EngineConfig::default();
        let dto = EngineConfigDto::from(cfg.clone());
        assert!(dto.validate().is_ok());
        let back = EngineConfig::from(dto);
        assert_eq!(back.port, cfg.port);
        assert_eq!(back.vram_high_watermark, cfg.vram_high_watermark);
        assert_eq!(back.idle_offload_after, cfg.idle_offload_after);
        assert_eq!(back.max_bandwidth_yield, cfg.max_bandwidth_yield);
    }

    #[test]
    fn validation_rejects_inverted_watermarks() {
        let mut dto = EngineConfigDto::default();
        dto.vram_low_watermark = 0.9;
        dto.vram_high_watermark = 0.5;
        assert!(dto.validate().is_err());
    }
}
